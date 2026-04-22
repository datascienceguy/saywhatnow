#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright", "beautifulsoup4", "faster-whisper"]
# ///
"""
The Office episode import pipeline.

Usage:
  uv run scripts/process-office-episode.py --season 1 --episode 3

Steps (auto-skipped if output files already exist):
  1. Locate MKV from office_prep/Season {N}/
  2. Download transcript from foreverdreaming.org (f=574)
  3. Convert MKV to full MP4
  4. Transcribe audio with Whisper → precise timestamps (.whisper.json)
  5. Fetch episode metadata from tvmaze.com
  6. Parse transcript into quotes, using <hr> separators as clip boundaries
  7. Match transcript to Whisper timestamps
  8. Create StagingEpisode in DB via API

Pass --no-whisper to fall back to embedded SRT / tvsubtitles.net download.

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
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import builtins, datetime
_orig_print = builtins.print
def print(*args, **kwargs):
    if args and isinstance(args[0], str) and not args[0].startswith("\r"):
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        _orig_print(f"[{ts}]", *args, **kwargs)
    else:
        _orig_print(*args, **kwargs)
builtins.print = print

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
        text_lines = [re.sub(r"<[^>]+>", "", l).strip() for l in lines[2:] if l.strip()]
        # Multi-speaker blocks (lines starting with -): expand into separate entries
        hyphen_lines = [l for l in text_lines if l.startswith("-")]
        if len(hyphen_lines) >= 2:
            for hl in hyphen_lines:
                clean = hl.lstrip("- ").strip()
                if clean:
                    entries.append({"start": start, "end": end, "text": clean})
        else:
            clean = " ".join(l.lstrip("- ").strip() for l in text_lines)
            if clean:
                entries.append({"start": start, "end": end, "text": clean})
    return entries


def combine_srt_sentences(srt: list[dict]) -> list[dict]:
    """Combine consecutive SRT entries into complete sentences.

    Entries are joined when the current text doesn't end with terminal
    punctuation (. ? !) and the gap to the next entry is small.
    Simultaneous entries (gap <= 0, e.g. from hyphen-split pairs) are
    never joined.
    """
    TERMINAL = re.compile(r"[.?!]\s*$")
    MAX_GAP = 1.5  # seconds

    result = []
    i = 0
    while i < len(srt):
        text = srt[i]["text"]
        start = srt[i]["start"]
        end = srt[i]["end"]

        while not TERMINAL.search(text) and i + 1 < len(srt):
            gap = srt[i + 1]["start"] - end
            if gap <= 0 or gap > MAX_GAP:
                break
            i += 1
            text = text.rstrip(" ,") + " " + srt[i]["text"]
            end = srt[i]["end"]

        result.append({"start": start, "end": end, "text": text})
        i += 1

    return result


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

def match_transcript_to_srt(transcript: list[dict], srt: list[dict]) -> list[dict]:
    """Match transcript entries to SRT timestamps.

    Both sequences are in the same order. For each transcript entry we compute
    a proportional anchor in the SRT and search a small window around it.
    The SRT pointer only moves forward, guaranteeing monotonic timestamps.
    Scoring is from the SRT side (fraction of SRT words found in the transcript
    line) so long transcript lines correctly match short SRT entries.
    On ties the earliest (first) SRT entry wins, giving the start of a speech.
    """
    N, M = len(transcript), len(srt)
    results = []
    s_ptr = 0  # never goes backward

    for t_idx, entry in enumerate(transcript):
        t_words = set(normalize_text(entry["text"]).split())

        # Proportional anchor: where in the SRT should this transcript line fall?
        anchor = round(t_idx / max(N - 1, 1) * max(M - 1, 1))
        lo = max(s_ptr, anchor - 5)
        hi = min(M - 1, max(anchor + 10, s_ptr + 5))

        best_score = -1.0
        best_s = min(M - 1, max(lo, anchor))  # default: anchor

        for s in range(lo, hi + 1):
            s_words = set(normalize_text(srt[s]["text"]).split())
            score = len(t_words & s_words)  # raw word overlap count
            if score > best_score:          # strict > keeps earliest best match
                best_score, best_s = score, s

        s_ptr = best_s
        method = "fuzzy" if best_score >= 1 else "positional"
        results.append({
            **entry,
            "start": srt[best_s]["start"],
            "end": srt[best_s]["end"],
            "match_method": method,
        })

    n_fuzzy = sum(1 for r in results if r.get("match_method") == "fuzzy")
    n_pos   = sum(1 for r in results if r.get("match_method") == "positional")
    print(f"  Matched: {n_fuzzy} fuzzy, {n_pos} positional")
    return results


# ---------------------------------------------------------------------------
# SRT download from subtitlecat.com
# ---------------------------------------------------------------------------

def download_srt_from_tvsubtitles(season: int, episode: int, output_path: Path) -> bool:
    """Download English SRT from tvsubtitles.net (show ID 58 = The Office US)."""
    import urllib.request
    import zipfile
    import io
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("  beautifulsoup4 not available")
        return False

    SHOW_ID = 58  # The Office (US) on tvsubtitles.net
    BASE = "https://www.tvsubtitles.net"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

    def fetch(url: str) -> str | None:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception as e:
            print(f"  Request failed ({url}): {e}")
            return None

    # Step 1: season page → find episode link by position
    season_url = f"{BASE}/tvshow-{SHOW_ID}-{season}.html"
    print(f"\nFetching tvsubtitles.net season page: {season_url}")
    html = fetch(season_url)
    if not html:
        return False

    soup = BeautifulSoup(html, "html.parser")
    ep_links = [
        str(a["href"]) for a in soup.find_all("a", href=True)
        if re.match(r"episode-\d+\.html$", str(a["href"]))
        and not re.match(r"episode-\d+-\d+\.html$", str(a["href"]))
    ]
    ep_links.reverse()  # page lists episodes newest-first
    if episode > len(ep_links):
        print(f"  Only {len(ep_links)} episodes listed for season {season}")
        return False

    ep_url = f"{BASE}/{ep_links[episode - 1]}"

    # Step 2: episode page → find English subtitle link
    print(f"  Episode page: {ep_url}")
    ep_html = fetch(ep_url)
    if not ep_html:
        return False

    ep_soup = BeautifulSoup(ep_html, "html.parser")
    en_sub_href: str | None = None
    for a in ep_soup.find_all("a", href=True):
        href = str(a["href"])
        if not re.match(r"/subtitle-\d+\.html$", href):
            continue
        row_text = (a.find_parent() or a).get_text(separator=" ").lower()
        if "english" in row_text or "en.png" in str(a.find_parent()):
            en_sub_href = href
            break
    if not en_sub_href:
        # fallback: first subtitle link
        for a in ep_soup.find_all("a", href=True):
            if re.match(r"/subtitle-\d+\.html$", str(a["href"])):
                en_sub_href = str(a["href"])
                break
    if not en_sub_href:
        print("  No subtitle links found on episode page")
        return False

    sub_id = re.search(r"\d+", en_sub_href).group()  # type: ignore[union-attr]

    # Step 3: download page → reconstruct filename from obfuscated JS vars
    dl_url = f"{BASE}/download-{sub_id}.html"
    print(f"  Download page: {dl_url}")
    dl_html = fetch(dl_url)
    if not dl_html:
        return False

    parts = re.findall(r"var s(\d+)\s*=\s*'([^']*)'", dl_html)
    if not parts:
        print("  Could not parse download filename from JS")
        return False
    import urllib.parse
    filename = "".join(v for _, v in sorted(parts, key=lambda x: int(x[0])))
    zip_url = f"{BASE}/{urllib.parse.quote(filename)}"

    # Step 4: download ZIP and extract SRT
    print(f"  Downloading: {zip_url}")
    try:
        req = urllib.request.Request(zip_url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as r:
            zip_data = r.read()
    except Exception as e:
        print(f"  ZIP download failed: {e}")
        return False

    try:
        with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
            srt_names = [n for n in zf.namelist() if n.lower().endswith(".srt")]
            if not srt_names:
                print("  No .srt file found in ZIP")
                return False
            output_path.write_bytes(zf.read(srt_names[0]))
            print(f"  Saved: {output_path} (from {srt_names[0]})")
            return True
    except Exception as e:
        print(f"  Failed to extract ZIP: {e}")
        return False


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


def auto_map_speakers(base_url: str, ep_id: int, secret: str) -> None:
    """Fetch speaker-map suggestions and auto-apply high-confidence matches."""
    import urllib.request
    headers = {"x-internal-secret": secret}

    req = urllib.request.Request(
        f"{base_url}/api/admin/staging/{ep_id}/speaker-map",
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req) as r:
            data = json.loads(r.read())
    except Exception as e:
        print(f"  WARNING: Could not fetch speaker map: {e}")
        return

    mappings = data.get("mappings", [])
    auto = {m["stagingName"]: m["suggestedName"]
            for m in mappings
            if m.get("suggestedName") and m.get("suggestedScore", 0) >= 0.5}
    unresolved = [m["stagingName"] for m in mappings if m["stagingName"] not in auto]

    if auto:
        payload = json.dumps({"mapping": auto}).encode()
        req2 = urllib.request.Request(
            f"{base_url}/api/admin/staging/{ep_id}/speaker-map",
            data=payload,
            headers={**headers, "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req2) as r:
            json.loads(r.read())
        print(f"  Auto-mapped {len(auto)} speaker(s):")
        for old, new in auto.items():
            print(f"    {old} → {new}")
    else:
        print("  No high-confidence speaker matches found")

    if unresolved:
        print(f"  ⚠ {len(unresolved)} speaker(s) need manual mapping: {', '.join(unresolved)}")
    else:
        print("  ✓ All speakers mapped")


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
# Whisper transcription
# ---------------------------------------------------------------------------

def transcribe_words_with_whisper(mp4_path: str, output_dir: Path, basename: str, model: str = "base") -> list[dict]:
    """Transcribe audio with faster-whisper using word-level timestamps.

    Returns [{word, start, end}] for every spoken word.
    Results are cached in <basename>.whisper-words.json.
    """
    cache_path = output_dir / f"{basename}.whisper-words.json"
    if cache_path.exists():
        print(f"\nWhisper word timestamps already exist: {cache_path}")
        data = json.loads(cache_path.read_text(encoding="utf-8"))
        print(f"  {len(data)} words loaded from cache")
        return data

    print(f"\nTranscribing with Whisper (model={model}, word timestamps) — this may take a few minutes...")
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("  ERROR: faster-whisper not installed.")
        return []

    whisper_model = WhisperModel(model, device="cpu", compute_type="int8")
    segments_iter, info = whisper_model.transcribe(
        mp4_path, language="en", beam_size=5, word_timestamps=True
    )

    words = []
    duration = info.duration
    for seg in segments_iter:
        for w in (seg.words or []):
            words.append({"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)})
        if words:
            print(f"\r  {words[-1]['start']:6.1f}s / {duration:.0f}s  ({len(words)} words)", end="", flush=True)
    print()

    cache_path.write_text(json.dumps(words, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  Saved: {cache_path} ({len(words)} words)")
    return words


def align_transcript_to_whisper(transcript: list[dict], words: list[dict]) -> list[dict]:
    """Align transcript lines to Whisper word timestamps using global sequence alignment.

    Flattens both sequences to word lists, runs SequenceMatcher to find the
    longest common subsequence of words, maps matched words back to quote indices
    to get start times, then interpolates timestamps for unmatched quotes.
    """
    from difflib import SequenceMatcher

    # Flatten transcript to (normalized_word, quote_idx) pairs
    t_flat: list[tuple[str, int]] = []
    for q_idx, entry in enumerate(transcript):
        for w in normalize_text(entry["text"]).split():
            if w:
                t_flat.append((w, q_idx))

    if not t_flat or not words:
        return [{**e, "start": None, "end": None, "match_method": None} for e in transcript]

    t_words_only = [w for w, _ in t_flat]
    w_words_norm = [normalize_text(w["word"]) for w in words]

    # Global alignment: find matching blocks between transcript words and Whisper words
    sm = SequenceMatcher(None, t_words_only, w_words_norm, autojunk=False)

    # Build map: transcript flat word index → whisper word index
    t_to_w: dict[int, int] = {}
    for block in sm.get_matching_blocks():
        for i in range(block.size):
            t_to_w[block.a + i] = block.b + i

    # For each quote, find the whisper word index of its first matched word
    quote_w_idx: dict[int, int] = {}
    for t_idx, (_, q_idx) in enumerate(t_flat):
        if t_idx in t_to_w and q_idx not in quote_w_idx:
            quote_w_idx[q_idx] = t_to_w[t_idx]

    n_matched = len(quote_w_idx)
    print(f"  Aligned: {n_matched}/{len(transcript)} quotes matched to Whisper words")

    # Build results with matched timestamps
    results: list[dict] = []
    for q_idx, entry in enumerate(transcript):
        if q_idx in quote_w_idx:
            w_idx = quote_w_idx[q_idx]
            results.append({**entry, "start": words[w_idx]["start"], "end": words[w_idx]["end"], "match_method": "aligned"})
        else:
            results.append({**entry, "start": None, "end": None, "match_method": "interpolated"})

    # Interpolate missing timestamps between known anchors
    idxs = sorted(quote_w_idx.keys())
    for i, q_idx in enumerate(idxs):
        prev_q = idxs[i - 1] if i > 0 else None
        next_q = idxs[i + 1] if i < len(idxs) - 1 else None

        # Fill gap before first anchor
        if i == 0 and q_idx > 0:
            t0 = results[q_idx]["start"]
            for j in range(q_idx):
                frac = j / q_idx
                results[j]["start"] = round(t0 * frac, 3)
                results[j]["end"] = round(t0 * frac, 3)

        # Fill gap after last anchor
        if i == len(idxs) - 1 and q_idx < len(results) - 1:
            t_last = results[q_idx]["start"]
            remaining = len(results) - q_idx - 1
            last_word_time = words[-1]["end"]
            for j in range(1, remaining + 1):
                frac = j / (remaining + 1)
                t = round(t_last + frac * (last_word_time - t_last), 3)
                results[q_idx + j]["start"] = t
                results[q_idx + j]["end"] = t

        # Fill gap between two anchors
        if next_q is not None:
            t_a = results[q_idx]["start"]
            t_b = results[next_q]["start"]
            gap = next_q - q_idx
            for j in range(1, gap):
                frac = j / gap
                t = round(t_a + frac * (t_b - t_a), 3)
                results[q_idx + j]["start"] = t
                results[q_idx + j]["end"] = t

    return results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def split_long_clips(clips: list[dict], all_quotes: list[dict], max_duration: float = 110.0) -> list[dict]:
    """Split any clip longer than max_duration at the largest natural gap near the midpoint."""
    changed = True
    while changed:
        changed = False
        for i, clip in enumerate(clips):
            st = clip.get("startTime") or 0
            et = clip.get("endTime") or 0
            if (et - st) <= max_duration:
                continue

            seq_start = clip["sequenceStart"]
            seq_end = clip["sequenceEnd"]
            clip_quotes = sorted(
                [q for q in all_quotes if seq_start <= q["sequence"] <= seq_end and q.get("startTime") is not None],
                key=lambda q: q["startTime"],
            )
            if len(clip_quotes) < 2:
                continue

            mid = st + (et - st) / 2

            # Prefer a quote near the midpoint that follows a gap of at least 1s
            best_q = None
            best_diff = float("inf")
            for j in range(1, len(clip_quotes)):
                gap = clip_quotes[j]["startTime"] - clip_quotes[j - 1]["startTime"]
                if gap < 1.0:
                    continue
                diff = abs(clip_quotes[j]["startTime"] - mid)
                if diff < best_diff:
                    best_diff, best_q = diff, clip_quotes[j]

            # Fallback: split at the middle quote if no natural gap found
            if not best_q:
                best_q = clip_quotes[len(clip_quotes) // 2]

            split_time = best_q["startTime"]
            split_seq = best_q["sequence"]
            c1 = {**clip, "sequenceEnd": split_seq - 1, "endTime": round(split_time, 3)}
            c2 = {"sequenceStart": split_seq, "sequenceEnd": clip["sequenceEnd"],
                  "startTime": round(split_time, 3), "endTime": clip.get("endTime")}
            clips = clips[:i] + [c1, c2] + clips[i + 1:]
            print(f"  Split long clip ({et-st:.0f}s) at {split_time:.1f}s → {split_time-st:.0f}s + {et-split_time:.0f}s")
            changed = True
            break

    for i, c in enumerate(clips):
        c["index"] = i + 1
    return clips


def merge_short_clips(clips: list[dict], min_duration: float = 15.0) -> list[dict]:
    """Merge any clip shorter than min_duration seconds into a neighboring clip."""
    changed = True
    while changed:
        changed = False
        for i, clip in enumerate(clips):
            s, e = clip.get("startTime"), clip.get("endTime")
            if s is None or e is None or (e - s) >= min_duration:
                continue
            # Pick neighbor: prefer the shorter one; fall back to whichever exists
            if i == 0:
                nb = 1
            elif i == len(clips) - 1:
                nb = i - 1
            else:
                pd = (clips[i-1].get("endTime", 0) - clips[i-1].get("startTime", 0))
                nd = (clips[i+1].get("endTime", 0) - clips[i+1].get("startTime", 0))
                nb = i - 1 if pd <= nd else i + 1
            lo, hi = min(i, nb), max(i, nb)
            ms = clips[lo].get("startTime") or clips[hi].get("startTime")
            me = clips[hi].get("endTime") or clips[lo].get("endTime")
            merged: dict = {"sequenceStart": clips[lo]["sequenceStart"], "sequenceEnd": clips[hi]["sequenceEnd"]}
            if ms is not None: merged["startTime"] = ms
            if me is not None: merged["endTime"] = me
            clips = clips[:lo] + [merged] + clips[hi+1:]
            print(f"  Merged short clip ({e-s:.1f}s) into neighbor → {len(clips)} clips remain")
            changed = True
            break  # restart scan after each merge

    for i, clip in enumerate(clips):
        clip["index"] = i + 1
    return clips


def main():
    parser = argparse.ArgumentParser(description="Process The Office episode into staging")
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--episode", type=int, required=True)
    parser.add_argument("--no-transcript", action="store_true", help="Skip transcript download")
    parser.add_argument("--no-convert", action="store_true", help="Skip MP4 conversion")
    parser.add_argument("--regen-quotes", action="store_true", help="Regenerate quotes JSON")
    parser.add_argument("--no-whisper", action="store_true", help="Skip Whisper; fall back to embedded SRT / tvsubtitles.net")
    parser.add_argument("--whisper-model", default="base", help="Whisper model size: tiny, base, small, medium, large-v3 (default: base)")
    parser.add_argument("--srt-offset", type=float, default=0.0, help="Seconds to add to SRT timestamps (only used with --no-whisper)")
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

    # Step 3: convert to MP4 (needed before Whisper)
    mp4_file = episode_dir / f"{basename}.mp4"
    if mp4_file.exists():
        print(f"\nMP4 already exists: {mp4_file}")
    elif not args.no_convert:
        convert_full_mp4(str(mkv), episode_dir, basename)

    if not mp4_file.exists():
        print("ERROR: MP4 not found — cannot create staging episode")
        sys.exit(1)

    # Step 4: Whisper word timestamps (or fall back to SRT)
    whisper_words: list[dict] = []
    srt_entries: list[dict] = []  # only used in fallback path
    if not args.no_whisper:
        whisper_words = transcribe_words_with_whisper(str(mp4_file), episode_dir, basename, model=args.whisper_model)
        if not whisper_words:
            print("  WARNING: Whisper produced no words — falling back to SRT")
    if not whisper_words:
        # Fallback: embedded SRT or tvsubtitles.net
        srt_path_str: str | None = None
        srt_file = episode_dir / f"{basename}.srt"
        if srt_file.exists():
            print(f"SRT already exists: {srt_file}")
            srt_path_str = str(srt_file)
        else:
            srt_path_str = extract_subtitles(str(mkv), episode_dir, basename)
            if not srt_path_str:
                if download_srt_from_tvsubtitles(season, episode, srt_file):
                    srt_path_str = str(srt_file)
        if srt_path_str:
            raw = parse_srt(srt_path_str)
            raw = [e for e in raw if e["start"] > 5]
            srt_entries = combine_srt_sentences(raw)
            if srt_offset:
                srt_entries = [{**e, "start": e["start"] + srt_offset, "end": e["end"] + srt_offset} for e in srt_entries]

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

        if whisper_words:
            print(f"  Timing source: Whisper word timestamps ({len(whisper_words)} words)")
            matched = align_transcript_to_whisper(transcript_entries, whisper_words)
        elif srt_entries:
            print(f"  Timing source: SRT ({len(srt_entries)} segments)")
            matched = match_transcript_to_srt(transcript_entries, srt_entries)
        else:
            print("  No timing source available — quotes will have no timestamps")
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

    # Step 8: push clip boundaries (scene-based if breaks exist, else single clip)
    quotes_data = json.loads(quotes_path.read_text(encoding="utf-8"))
    all_quotes = quotes_data["quotes"]

    if True:
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

        clips = split_long_clips(clips, all_quotes, max_duration=110.0)
        clips = merge_short_clips(clips, min_duration=15.0)

        # Always start from second 0
        if clips:
            clips[0]["startTime"] = 0.0

        # Trim cold open if aligned Whisper timestamps show a large gap (theme song)
        if len(clips) >= 2:
            last_aligned_end = next(
                (all_quotes[j]["endTime"] for j in range(clips[0]["sequenceEnd"], clips[0]["sequenceStart"] - 1, -1)
                 if all_quotes[j].get("matchMethod") == "aligned" and all_quotes[j].get("endTime") is not None),
                None
            )
            first_aligned_start = next(
                (all_quotes[j]["startTime"] for j in range(clips[1]["sequenceStart"], clips[1]["sequenceEnd"] + 1)
                 if all_quotes[j].get("matchMethod") == "aligned" and all_quotes[j].get("startTime") is not None),
                None
            )
            if last_aligned_end and first_aligned_start:
                gap = first_aligned_start - last_aligned_end
                print(f"  Cold open: last aligned word ends at {last_aligned_end:.1f}s, next scene starts at {first_aligned_start:.1f}s (gap {gap:.1f}s)")
                if gap > 15:
                    clips[0]["endTime"] = round(last_aligned_end + 1.0, 3)
                    print(f"  Cold open trimmed to {clips[0]['endTime']}s (theme song gap detected)")

        print(f"\n=== Pushing {len(clips)} scene-based clip boundaries ===")
        has_timestamps = any(c.get("startTime") is not None for c in clips)
        if not has_timestamps:
            print("  (no timestamps — clip times will need to be set in the staging editor)")
        push_clips_to_staging(base_url, ep_id, clips, secret)

    print(f"\n=== Auto-mapping speakers ===")
    auto_map_speakers(base_url, ep_id, secret)

    print(f"\n✓ Done! Review at /admin/staging/{ep_id}")


if __name__ == "__main__":
    main()
