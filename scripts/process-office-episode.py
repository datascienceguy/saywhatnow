#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright", "beautifulsoup4"]
# ///
"""
The Office episode import pipeline.

Usage:
  uv run scripts/process-office-episode.py --season 1 --episode 3

Steps (auto-skipped if output files already exist):
  1. Locate MKV from office_prep/Season {N}/
  2. Download transcript from foreverdreaming.org (f=574)
  3. Extract embedded SRT from MKV
  4. Convert MKV to full MP4
  5. Fetch episode metadata from tvmaze.com
  6. Parse transcript into quotes, using <hr> separators as clip boundaries
  7. Match transcript to SRT timestamps
  8. Create StagingEpisode in DB via API

Output dir: clip_prep/office-s{NN}e{NN}/

Requirements:
  playwright, beautifulsoup4  — uv dependencies
  ffmpeg                      — in PATH or WinGet

First-time playwright setup:
  uv run --with playwright playwright install chromium
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
from difflib import SequenceMatcher
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

OFFICE_PREP_DIR = Path("office_prep")
FORUM_URL = "https://transcripts.foreverdreaming.org/viewforum.php?f=574&sk=t&sd=a"
SHOW_NAME = "The Office"


# ---------------------------------------------------------------------------
# ffmpeg helpers (same as Simpsons script)
# ---------------------------------------------------------------------------

def find_ffmpeg(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    winget = Path.home() / "AppData/Local/Microsoft/WinGet/Packages"
    for d in winget.glob(f"Gyan.FFmpeg_*/ffmpeg-*-full_build/bin/{name}.exe"):
        return str(d)
    raise FileNotFoundError(f"{name} not found. Install with: winget install Gyan.FFmpeg")


def get_duration(path: str) -> float | None:
    try:
        result = subprocess.run(
            [find_ffmpeg("ffprobe"), "-v", "quiet", "-print_format", "json",
             "-show_entries", "format=duration", path],
            capture_output=True, text=True,
        )
        return float(json.loads(result.stdout)["format"]["duration"])
    except Exception:
        return None


def extract_subtitles(mkv_path: str, output_dir: Path, basename: str) -> str | None:
    print("Checking for embedded subtitles...")
    probe = subprocess.run(
        [find_ffmpeg("ffprobe"), "-v", "quiet", "-print_format", "json", "-show_streams", mkv_path],
        capture_output=True, text=True,
    )
    if probe.returncode != 0:
        return None
    info = json.loads(probe.stdout)
    sub_streams = [s for s in info.get("streams", []) if s.get("codec_type") == "subtitle"]
    if not sub_streams:
        print("  No embedded subtitle streams found.")
        return None
    srt_path = str(output_dir / f"{basename}.srt")
    print(f"  Found {len(sub_streams)} subtitle stream(s), extracting first...")
    result = subprocess.run(
        [find_ffmpeg("ffmpeg"), "-y", "-i", mkv_path, "-map", "0:s:0", srt_path],
        capture_output=True, text=True,
    )
    if result.returncode == 0 and Path(srt_path).exists():
        print(f"  Subtitles saved to {srt_path}")
        return srt_path
    print("  Failed to extract subtitles.")
    return None


def convert_full_mp4(mkv_path: str, output_dir: Path, basename: str) -> str:
    import time
    out_path = str(output_dir / f"{basename}.mp4")
    total = get_duration(mkv_path)
    if total:
        print(f"Converting to MP4 (total: {int(total//60)}m{int(total%60):02d}s)...")
    else:
        print("Converting to MP4...")
    proc = subprocess.Popen(
        [find_ffmpeg("ffmpeg"), "-y", "-i", mkv_path,
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ac", "2",
         "-progress", "pipe:1", "-nostats", out_path],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
    )
    start_time = time.time()
    out_time_s = 0.0
    for line in proc.stdout:
        line = line.strip()
        if line.startswith("out_time_ms="):
            try:
                out_time_s = int(line.split("=")[1]) / 1_000_000
            except ValueError:
                pass
        elif line.startswith("progress=") and total and total > 0:
            pct = min(100.0, out_time_s / total * 100)
            elapsed = time.time() - start_time
            eta = (elapsed / pct * (100 - pct)) if pct > 0 else 0
            print(f"\r  {pct:5.1f}%  elapsed {int(elapsed//60)}m{int(elapsed%60):02d}s  ETA {int(eta//60)}m{int(eta%60):02d}s   ", end="", flush=True)
    proc.wait()
    print()
    if proc.returncode != 0:
        print("  ERROR: ffmpeg failed")
        sys.exit(1)
    print(f"  → {out_path}")
    return out_path


# ---------------------------------------------------------------------------
# Find local MKV
# ---------------------------------------------------------------------------

def find_mkv(season: int, episode: int) -> Path | None:
    """Search office_prep/Season {N}/ for a file matching S{NN}E{NN}."""
    season_dirs = [
        OFFICE_PREP_DIR / f"Season {season}",
        OFFICE_PREP_DIR / f"season{season}",
        OFFICE_PREP_DIR / f"season {season}",
        OFFICE_PREP_DIR / f"S{season:02d}",
    ]
    patterns = [
        f"S{season:02d}E{episode:02d}",
        f"s{season:02d}e{episode:02d}",
        f"{season}x{episode:02d}",
    ]
    for d in season_dirs:
        if not d.exists():
            continue
        for f in d.iterdir():
            if f.suffix.lower() != ".mkv":
                continue
            name_upper = f.name.upper()
            if any(p.upper() in name_upper for p in patterns):
                return f
    return None


# ---------------------------------------------------------------------------
# SRT parsing (same as Simpsons)
# ---------------------------------------------------------------------------

def parse_srt(srt_path: str) -> list[dict]:
    text = Path(srt_path).read_text(encoding="utf-8", errors="replace")
    entries = []

    def to_sec(h, m, s, ms):
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000

    for block in re.split(r"\n\s*\n", text.strip()):
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        try:
            int(lines[0].strip())
        except ValueError:
            continue
        m = re.match(
            r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})",
            lines[1],
        )
        if not m:
            continue
        start = to_sec(*m.groups()[:4])
        end = to_sec(*m.groups()[4:])
        clean = re.sub(r"<[^>]+>", "", " ".join(lines[2:])).strip()
        entries.append({"start": start, "end": end, "text": clean})
    return entries


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------

_UNICODE_MAP = str.maketrans({
    "\u2018": "'", "\u2019": "'", "\u02bc": "'",
    "\u201c": '"', "\u201d": '"',
    "\u2013": "-", "\u2014": "-",
    "\u2026": "...",
    "\u00a0": " ",
})


def clean_text(text: str) -> str:
    text = text.translate(_UNICODE_MAP)
    text = re.sub(r"\s*\([^)]*\)", "", text)
    text = re.sub(r"\s*\[[^\]]*\]", "", text)
    text = re.sub(r"[♪♫]+", "", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def normalize_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Transcript parser — ForeverDreaming Office format
# Uses <hr> tags as scene/clip boundaries
# ---------------------------------------------------------------------------

def parse_office_transcript(path: str) -> tuple[list[dict], list[int]]:
    """Parse Office transcript HTML.

    Returns:
        quotes: list of {speaker, text}
        scene_breaks: list of quote indices where a new scene starts
    """
    try:
        from bs4 import BeautifulSoup, Tag
    except ImportError:
        print("ERROR: beautifulsoup4 not installed.")
        sys.exit(1)

    html = Path(path).read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")
    content = (
        soup.find("div", class_="content")
        or soup.find("div", class_="postbody")
        or soup.find("div", id=re.compile(r"post", re.I))
        or soup.body
    )
    if not content:
        return [], []

    SPEAKER_RE = re.compile(r"^((?:[A-Z][A-Za-z'.]+)(?:\s+[A-Za-z'.]+){0,3}):\s*(.*)$")

    quotes: list[dict] = []
    scene_breaks: list[int] = []  # indices into quotes where a new scene begins
    current_speaker: str | None = None

    # Walk children of content div, treating <hr> as scene separator
    # and <br> separated text as lines
    raw_html = str(content)

    # Split on <hr> first to get scenes
    scene_chunks = re.split(r"<hr[^>]*/>|<hr[^>]*>", raw_html, flags=re.IGNORECASE)

    for scene_idx, chunk in enumerate(scene_chunks):
        scene_start_quote_idx = len(quotes)

        # Split chunk on <br> tags
        parts = re.split(r"<br\s*/?>", chunk, flags=re.IGNORECASE)
        for part in parts:
            text = re.sub(r"<[^>]+>", "", part)
            for ent, ch in [("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                            ("&quot;", '"'), ("&#39;", "'"), ("&nbsp;", " ")]:
                text = text.replace(ent, ch)
            text = clean_text(text.strip())
            if not text:
                continue

            m = SPEAKER_RE.match(text)
            if m:
                current_speaker = m.group(1).strip()
                dialogue = m.group(2).strip()
                if dialogue:
                    quotes.append({"speaker": current_speaker, "text": dialogue})
            elif current_speaker:
                quotes.append({"speaker": current_speaker, "text": text})
            else:
                quotes.append({"speaker": "", "text": text})

        # Record scene break at first quote of this scene (skip empty scenes)
        if len(quotes) > scene_start_quote_idx and scene_idx > 0:
            scene_breaks.append(scene_start_quote_idx)

    print(f"  Parsed {len(quotes)} lines across {len(scene_chunks)} scenes ({len(scene_breaks)} scene breaks)")
    return quotes, scene_breaks


# ---------------------------------------------------------------------------
# Transcript → SRT matching (same logic as Simpsons)
# ---------------------------------------------------------------------------

def _build_char_index(entries: list[dict]) -> tuple[str, list[int]]:
    chars, positions = [], []
    for idx, entry in enumerate(entries):
        norm = normalize_text(entry["text"])
        for ch in norm:
            chars.append(ch)
            positions.append(idx)
        chars.append(" ")
        positions.append(idx)
    return "".join(chars), positions


def _token_overlap(a: str, b: str) -> float:
    wa = set(normalize_text(a).split())
    wb = set(normalize_text(b).split())
    if not wa:
        return 0.0
    return len(wa & wb) / len(wa)


def match_transcript_to_srt(transcript: list[dict], srt: list[dict]) -> list[dict]:
    t_str, t_pos = _build_char_index(transcript)
    s_str, s_pos = _build_char_index(srt)
    matcher = SequenceMatcher(None, t_str, s_str, autojunk=False)

    assignments: dict[int, int] = {}
    methods: dict[int, str] = {}
    for i, j, n in matcher.get_matching_blocks():
        if n < 12 or i >= len(t_pos) or j >= len(s_pos):
            continue
        t_idx = t_pos[i]
        if t_idx not in assignments:
            assignments[t_idx] = s_pos[j]
            methods[t_idx] = "difflib"

    N, M = len(transcript), len(srt)
    anchors = sorted([(-1, -1)] + list(assignments.items()) + [(N, M)])

    def interpolated(t_idx: int) -> int:
        prev_a, next_a = (-1, -1), (N, M)
        for a in anchors:
            if a[0] < t_idx: prev_a = a
            elif a[0] > t_idx: next_a = a; break
        t_span = next_a[0] - prev_a[0]
        s_span = next_a[1] - prev_a[1]
        if t_span <= 0 or s_span <= 0: return -1
        frac = (t_idx - prev_a[0]) / t_span
        return max(0, min(M - 1, round(prev_a[1] + frac * s_span)))

    for t_idx in range(N):
        if t_idx in assignments: continue
        base = interpolated(t_idx)
        if base < 0: continue
        best_score, best_s = -1.0, base
        for s_idx in range(max(0, base - 8), min(M - 1, base + 8) + 1):
            score = _token_overlap(transcript[t_idx]["text"], srt[s_idx]["text"])
            if score > best_score:
                best_score, best_s = score, s_idx
        assignments[t_idx] = best_s
        methods[t_idx] = "fuzzy" if best_score >= 0.4 else "positional"

    results = []
    for t_idx, entry in enumerate(transcript):
        if t_idx in assignments:
            s = srt[assignments[t_idx]]
            results.append({**entry, "start": s["start"], "end": s["end"], "match_method": methods.get(t_idx)})
        else:
            results.append({**entry, "start": None, "end": None, "match_method": None})
    return results


# ---------------------------------------------------------------------------
# Episode metadata from tvmaze.com
# ---------------------------------------------------------------------------

def fetch_episode_metadata(season: int, episode: int) -> dict:
    import urllib.request
    print(f"\nFetching metadata for S{season:02d}E{episode:02d} from tvmaze.com...")
    # The Office (US) on tvmaze is show ID 526
    url = f"https://api.tvmaze.com/shows/526/episodebynumber?season={season}&number={episode}"
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            data = json.loads(r.read())
        title = data.get("name", "")
        air_date = (data.get("airdate") or "")[:10] or None
        print(f"  Title    : {title}")
        print(f"  Air date : {air_date}")
        return {"title": title, "air_date": air_date}
    except Exception as e:
        print(f"  WARNING: metadata lookup failed: {e}")
        return {"title": "", "air_date": None}


# ---------------------------------------------------------------------------
# Transcript download from ForeverDreaming
# ---------------------------------------------------------------------------

def download_transcript(season: int, episode: int, output_path: Path) -> bool:
    if output_path.exists():
        print(f"Transcript already exists: {output_path}")
        return True

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed — run: uv run --with playwright playwright install chromium")
        return False

    targets = {
        f"{season:02d}x{episode:02d}",
        f"{season}x{episode:02d}",
        f"{season:02d}x{episode}",
        f"{season}x{episode}",
    }
    print(f"\nSearching ForeverDreaming for S{season:02d}E{episode:02d}...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )

        start = 0
        topic_url = None

        while True:
            url = f"{FORUM_URL}&start={start}"
            print(f"  Scanning {url} ...")
            page.goto(url, wait_until="load", timeout=60000)
            try:
                page.wait_for_selector("a[href*='viewtopic']", timeout=30000)
            except Exception:
                print("    WARNING: timed out waiting for topic links")

            topic_links = page.locator("a[href*='viewtopic']").all()
            print(f"    {len(topic_links)} topic links on page")

            for link in topic_links:
                try:
                    text = link.inner_text(timeout=1000).strip()
                except Exception:
                    continue
                if any(t in text.lower() for t in targets):
                    href = link.get_attribute("href") or ""
                    topic_url = href if href.startswith("http") else f"https://transcripts.foreverdreaming.org/{href.lstrip('./')}"
                    print(f"  Found: {text!r}")
                    break

            if topic_url:
                break

            if page.locator("a[rel='next']").count() == 0:
                print("  No more pages — episode not found.")
                browser.close()
                return False

            start += 25

        print("  Downloading transcript...")
        page.goto(topic_url, wait_until="load", timeout=60000)
        try:
            page.wait_for_selector("div.content, div.postbody, .post", timeout=15000)
        except Exception:
            pass
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(page.content(), encoding="utf-8")
        browser.close()

    print(f"  Saved: {output_path}")
    return True


# ---------------------------------------------------------------------------
# Staging API
# ---------------------------------------------------------------------------

def load_env(project_root: Path) -> dict:
    env = {}
    env_file = project_root / ".env.local"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def create_staging_episode(
    project_root: Path,
    basename: str,
    season: int,
    episode: int,
    title: str,
    air_date: str | None,
) -> int:
    import urllib.request
    env = load_env(project_root)
    base_url = env.get("AUTH_URL", "http://localhost:3000").rstrip("/")
    url = f"{base_url}/api/admin/staging"

    payload = json.dumps({
        "basename": basename,
        "season": season,
        "episodeNumber": episode,
        "title": title,
        "airDate": air_date,
        "productionCode": None,
        "showName": SHOW_NAME,
    }).encode()

    print(f"\nCreating staging episode via {url}...")
    headers = {"Content-Type": "application/json"}
    secret = env.get("INTERNAL_API_SECRET")
    if secret:
        headers["x-internal-secret"] = secret
    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    with urllib.request.urlopen(req) as r:
        result = json.loads(r.read())
    ep_id = result["id"]
    print(f"  Created staging episode id={ep_id}")
    return ep_id


def push_clips_to_staging(base_url: str, ep_id: int, clips: list[dict], secret: str) -> None:
    import urllib.request
    payload = json.dumps({"clips": clips}).encode()
    req = urllib.request.Request(
        f"{base_url}/api/admin/staging/{ep_id}/clips",
        data=payload,
        headers={"Content-Type": "application/json", "x-internal-secret": secret},
        method="PUT",
    )
    with urllib.request.urlopen(req) as r:
        json.loads(r.read())
    print(f"  ✓ Pushed {len(clips)} clip boundaries")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Process The Office episode into staging")
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--episode", type=int, required=True)
    parser.add_argument("--no-transcript", action="store_true", help="Skip transcript download")
    parser.add_argument("--no-subtitles", action="store_true", help="Skip SRT extraction")
    parser.add_argument("--no-convert", action="store_true", help="Skip MP4 conversion")
    parser.add_argument("--regen-quotes", action="store_true", help="Regenerate quotes JSON")
    parser.add_argument("--srt-offset", type=float, default=0.0, help="Seconds to add to all SRT timestamps (e.g. 22 if MP4 has a 22s intro not in the SRT)")
    args = parser.parse_args()

    season, episode, srt_offset = args.season, args.episode, args.srt_offset
    basename = f"office-s{season:02d}e{episode:02d}"
    episode_dir = Path("clip_prep") / basename
    episode_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"  The Office — S{season:02d}E{episode:02d}  ({basename})")
    print(f"{'='*60}")

    # Step 1: find MKV
    mkv = find_mkv(season, episode)
    if not mkv:
        print(f"ERROR: No MKV found for S{season:02d}E{episode:02d} in {OFFICE_PREP_DIR}/")
        sys.exit(1)
    print(f"\nMKV: {mkv}")

    # Step 2: download transcript
    transcript_path = episode_dir / f"{basename}.html"
    if not args.no_transcript:
        download_transcript(season, episode, transcript_path)

    # Step 3: extract SRT
    srt_path_str: str | None = None
    srt_file = episode_dir / f"{basename}.srt"
    if srt_file.exists():
        print(f"SRT already exists: {srt_file}")
        srt_path_str = str(srt_file)
    elif not args.no_subtitles:
        srt_path_str = extract_subtitles(str(mkv), episode_dir, basename)

    # Step 4: convert to MP4
    mp4_file = episode_dir / f"{basename}.mp4"
    if mp4_file.exists():
        print(f"\nMP4 already exists: {mp4_file}")
    elif not args.no_convert:
        convert_full_mp4(str(mkv), episode_dir, basename)

    if not mp4_file.exists():
        print("ERROR: MP4 not found — cannot create staging episode")
        sys.exit(1)

    # Step 5: episode metadata
    project_root = Path(__file__).resolve().parent.parent
    ep_meta = fetch_episode_metadata(season, episode)
    title = ep_meta["title"] or f"S{season:02d}E{episode:02d}"

    # Step 6: parse transcript + generate quotes
    quotes_path = episode_dir / f"{basename}-quotes.json"
    if args.regen_quotes and quotes_path.exists():
        print("\n--regen-quotes: deleting cached quotes JSON...")
        quotes_path.unlink()

    scene_breaks: list[int] = []

    if quotes_path.exists():
        print(f"\nQuotes JSON already exists: {quotes_path}")
        data = json.loads(quotes_path.read_text(encoding="utf-8"))
        scene_breaks = data.get("sceneBreaks", [])
    elif transcript_path.exists():
        print(f"\n=== Generating quotes: {basename} ===")
        transcript_entries, scene_breaks = parse_office_transcript(str(transcript_path))

        if srt_path_str:
            srt = parse_srt(srt_path_str)
            print(f"  SRT: {len(srt)} entries")
            if srt_offset:
                print(f"  Applying SRT offset: +{srt_offset}s")
                srt = [{**e, "start": e["start"] + srt_offset, "end": e["end"] + srt_offset} for e in srt]
            matched = match_transcript_to_srt(transcript_entries, srt)
            n_difflib = sum(1 for m in matched if m.get("match_method") == "difflib")
            n_fuzzy   = sum(1 for m in matched if m.get("match_method") == "fuzzy")
            n_pos     = sum(1 for m in matched if m.get("match_method") == "positional")
            n_none    = sum(1 for m in matched if m.get("match_method") is None)
            print(f"  Matched: {n_difflib} difflib, {n_fuzzy} fuzzy, {n_pos} positional, {n_none} unmatched")
        else:
            print("  No SRT available — quotes will have no timestamps")
            matched = [
                {**e, "start": None, "end": None, "match_method": None}
                for e in transcript_entries
            ]

        quotes = [
            {
                "speaker": m["speaker"],
                "text": m["text"],
                "startTime": m.get("start"),
                "endTime": m.get("end"),
                "matchMethod": m.get("match_method"),
                "sequence": i,
            }
            for i, m in enumerate(matched)
        ]
        quotes_path.write_text(
            json.dumps({"basename": basename, "totalQuotes": len(quotes),
                        "sceneBreaks": scene_breaks, "quotes": quotes},
                       indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"  Saved: {quotes_path} ({len(quotes)} quotes, {len(scene_breaks)} scene breaks)")

        print("\n  Sample:")
        for q in quotes[:5]:
            ts = f"{q['startTime']:.1f}s" if q["startTime"] else "?"
            print(f"    {ts:>8}  {q['speaker']}: {q['text'][:65]}")
    else:
        print("\nWARNING: No transcript — skipping quotes generation")

    if not quotes_path.exists():
        print("ERROR: Quotes JSON not found — cannot create staging episode (transcript needed)")
        sys.exit(1)

    # Step 7: check for existing staging episode
    env = load_env(project_root)
    base_url = env.get("AUTH_URL", "http://localhost:3000").rstrip("/")
    secret = env.get("INTERNAL_API_SECRET", "")

    import urllib.request

    # If regen-quotes was requested, delete the old staging episode so quotes get recreated with new timestamps
    if args.regen_quotes:
        try:
            req = urllib.request.Request(
                f"{base_url}/api/admin/staging?basename={basename}",
                headers={"x-internal-secret": secret},
                method="DELETE",
            )
            with urllib.request.urlopen(req) as r:
                json.loads(r.read())
            print(f"\n--regen-quotes: deleted existing staging episode, will recreate with updated timestamps")
        except Exception:
            pass  # didn't exist, that's fine

    try:
        req = urllib.request.Request(
            f"{base_url}/api/admin/staging?basename={basename}",
            headers={"x-internal-secret": secret},
        )
        with urllib.request.urlopen(req) as r:
            existing = json.loads(r.read())
        ep_id = existing["id"]
        print(f"\nStaging episode already exists: id={ep_id}")
    except Exception:
        ep_id = create_staging_episode(project_root, basename, season, episode, title.upper(), ep_meta["air_date"])

    # Step 8: push scene-based clip boundaries
    if scene_breaks:
        quotes_data = json.loads(quotes_path.read_text(encoding="utf-8"))
        all_quotes = quotes_data["quotes"]

        # Build clip list from scene breaks using sequence-based assignment
        clips = []
        boundaries = [0] + scene_breaks + [len(all_quotes)]

        for i in range(len(boundaries) - 1):
            seq_start = boundaries[i]
            seq_end = boundaries[i + 1] - 1  # inclusive

            # Try to find timestamps for this scene (may be None for PGS subtitles)
            start_time = next(
                (all_quotes[j]["startTime"] for j in range(seq_start, seq_end + 1)
                 if all_quotes[j].get("startTime") is not None), None
            )
            end_time = next(
                (all_quotes[j]["endTime"] for j in range(seq_end, seq_start - 1, -1)
                 if all_quotes[j].get("endTime") is not None), None
            )

            clip: dict = {
                "index": len(clips) + 1,
                "sequenceStart": seq_start,
                "sequenceEnd": seq_end,
            }
            if start_time is not None:
                clip["startTime"] = round(start_time, 3)
            if end_time is not None:
                clip["endTime"] = round(end_time, 3)

            clips.append(clip)

        print(f"\n=== Pushing {len(clips)} scene-based clip boundaries ===")
        has_timestamps = any(c.get("startTime") is not None for c in clips)
        if not has_timestamps:
            print("  (no timestamps — clip times will need to be set in the staging editor)")
        push_clips_to_staging(base_url, ep_id, clips, secret)

    print(f"\n✓ Done! Review at /admin/staging/{ep_id}")


if __name__ == "__main__":
    main()
