#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright", "beautifulsoup4", "anthropic"]
# ///
"""
Full episode import pipeline — downloads, converts, matches quotes, and creates
a staging episode in the DB ready for editing at /admin/staging.

Usage:
  uv run --with playwright,beautifulsoup4 scripts/process-episode.py --season 1 --episode 3

Steps (auto-skipped if output files already exist):
  1. Download MKV from archive.org        → clip_prep/s01e03/s01e03.mkv
  2. Download transcript from foreverdreaming → clip_prep/s01e03/s01e03.html
  3. Extract embedded SRT from MKV        → clip_prep/s01e03/s01e03.srt
  4. Convert MKV to full MP4              → clip_prep/s01e03/s01e03.mp4
  5. Fetch episode metadata from thesimpsonsapi.com
  6. Match transcript to SRT timestamps   → clip_prep/s01e03/s01e03-quotes.json
  7. AI clip boundary suggestion (Claude) → clip_prep/s01e03/s01e03-ai-clips.json
  8. Create StagingEpisode in DB + push AI clips → /admin/staging/{id}

Requirements:
  playwright, beautifulsoup4  — pip/uv dependencies
  ffmpeg                      — available via WinGet or PATH

First-time playwright setup:
  uv run --with playwright playwright install chromium
"""

import argparse
import json
import math
import re
import shutil
import subprocess
import sys
from difflib import SequenceMatcher
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


# ---------------------------------------------------------------------------
# ffmpeg helpers
# ---------------------------------------------------------------------------

def find_ffmpeg(name: str) -> str:
    """Find ffmpeg/ffprobe, checking PATH then common WinGet install location."""
    found = shutil.which(name)
    if found:
        return found
    winget = Path.home() / "AppData/Local/Microsoft/WinGet/Packages"
    for d in winget.glob(f"Gyan.FFmpeg_*/{name}-*-full_build/bin/{name}.exe"):
        return str(d)
    raise FileNotFoundError(
        f"{name} not found in PATH or WinGet packages. Install with: winget install Gyan.FFmpeg"
    )


def extract_subtitles(mkv_path: str, output_dir: str, basename: str) -> str | None:
    """Extract first subtitle stream from MKV. Returns SRT path or None."""
    print("Checking for embedded subtitles...")

    probe = subprocess.run(
        [find_ffmpeg("ffprobe"), "-v", "quiet", "-print_format", "json", "-show_streams", mkv_path],
        capture_output=True, text=True,
    )
    if probe.returncode != 0:
        print("  ffprobe failed — skipping subtitle extraction.")
        return None

    info = json.loads(probe.stdout)
    sub_streams = [s for s in info.get("streams", []) if s.get("codec_type") == "subtitle"]
    if not sub_streams:
        print("  No embedded subtitle streams found.")
        return None

    srt_path = str(Path(output_dir) / f"{basename}.srt")
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


# ---------------------------------------------------------------------------
# SRT parsing
# ---------------------------------------------------------------------------

def parse_srt(srt_path: str) -> list[dict]:
    """Parse SRT into list of {start, end, text} dicts (times in seconds)."""
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
# Text helpers (for transcript/quote matching)
# ---------------------------------------------------------------------------

_UNICODE_MAP = str.maketrans({
    "\u2018": "'", "\u2019": "'", "\u02bc": "'",
    "\u201c": '"', "\u201d": '"',
    "\u2013": "-", "\u2014": "-", "\u2015": "-",
    "\u2026": "...",
    "\u00e9": "e", "\u00e8": "e", "\u00ea": "e",
    "\u00e0": "a", "\u00e2": "a",
    "\u00f4": "o", "\u00f6": "o",
    "\u00fb": "u", "\u00fc": "u",
    "\u00e7": "c", "\u00ef": "i", "\u00e6": "ae",
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
    text = re.sub(r"[♪♫]", "", text)
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Transcript parser (foreverdreaming HTML)
# ---------------------------------------------------------------------------

def parse_transcript(path: str) -> list[dict]:
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("ERROR: beautifulsoup4 not installed. Run: uv run --with beautifulsoup4,playwright ...")
        sys.exit(1)

    html = Path(path).read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")
    content = (
        soup.find("div", class_="content")
        or soup.find("div", class_="postbody")
        or soup.find("div", id=re.compile(r"post", re.I))
        or soup.body
    )
    raw_html = str(content) if content else html
    parts = re.split(r"<br\s*/?>", raw_html, flags=re.IGNORECASE)

    entries = []
    current_speaker: str | None = None
    SPEAKER_RE = re.compile(r"^((?:[A-Z][A-Za-z'.]+)(?:\s+[A-Za-z'.]+){0,3}):\s*(.*)$")
    INLINE_SPEAKER_RE = re.compile(r"((?:[A-Z][A-Za-z'.]*)(?:\s+[A-Z][A-Za-z'.]*){0,3}):\s*")

    def emit_with_inline_splits(text: str, speaker: str | None) -> str | None:
        tokens = INLINE_SPEAKER_RE.split(text)
        current = speaker
        pre = tokens[0].strip()
        if pre and current:
            entries.append({"speaker": current, "text": pre})
        i = 1
        while i + 1 < len(tokens):
            spk = tokens[i].strip()
            txt = tokens[i + 1].strip()
            current = spk
            if txt:
                entries.append({"speaker": current, "text": txt})
            i += 2
        return current

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
                current_speaker = emit_with_inline_splits(dialogue, current_speaker)

    return entries


# ---------------------------------------------------------------------------
# Transcript → SRT matching
# ---------------------------------------------------------------------------

def _build_char_index(entries: list[dict]) -> tuple[str, list[int]]:
    chars: list[str] = []
    positions: list[int] = []
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


def match_transcript_to_srt(transcript: list[dict], srt: list[dict], min_match_chars: int = 12):
    t_str, t_pos = _build_char_index(transcript)
    s_str, s_pos = _build_char_index(srt)
    matcher = SequenceMatcher(None, t_str, s_str, autojunk=False)

    assignments: dict[int, int] = {}
    methods: dict[int, str] = {}
    for i, j, n in matcher.get_matching_blocks():
        if n < min_match_chars or i >= len(t_pos) or j >= len(s_pos):
            continue
        t_idx = t_pos[i]
        if t_idx not in assignments:
            assignments[t_idx] = s_pos[j]
            methods[t_idx] = "difflib"

    n_anchors = len(assignments)
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

    WINDOW, FUZZY_THRESHOLD = 8, 0.4
    for t_idx in range(N):
        if t_idx in assignments: continue
        base = interpolated(t_idx)
        if base < 0: continue
        best_score, best_s = -1.0, base
        for s_idx in range(max(0, base - WINDOW), min(M - 1, base + WINDOW) + 1):
            score = _token_overlap(transcript[t_idx]["text"], srt[s_idx]["text"])
            if score > best_score:
                best_score, best_s = score, s_idx
        assignments[t_idx] = best_s
        methods[t_idx] = "fuzzy" if best_score >= FUZZY_THRESHOLD else "positional"

    results = []
    for t_idx, entry in enumerate(transcript):
        if t_idx in assignments:
            s = srt[assignments[t_idx]]
            results.append({**entry, "start": s["start"], "end": s["end"], "match_method": methods.get(t_idx)})
        else:
            results.append({**entry, "start": None, "end": None, "match_method": None})
    return results, n_anchors


def generate_quotes(basename: str, srt_path: str, transcript_path: str, output_path: Path) -> bool:
    """Match transcript to SRT and write quotes JSON. Returns True on success."""
    print(f"\n=== Generating quotes: {basename} ===")

    srt = parse_srt(srt_path)
    print(f"  SRT:        {len(srt)} entries")

    transcript = parse_transcript(transcript_path)
    print(f"  Transcript: {len(transcript)} lines")

    matched, n_anchors = match_transcript_to_srt(transcript, srt)
    n_fuzzy = sum(1 for m in matched if m.get("match_method") == "fuzzy")
    n_pos   = sum(1 for m in matched if m.get("match_method") == "positional")
    n_none  = sum(1 for m in matched if m.get("match_method") is None)
    print(f"  Matched: {n_anchors} difflib, {n_fuzzy} fuzzy, {n_pos} positional, {n_none} unmatched")

    quotes = [
        {"speaker": m["speaker"], "text": m["text"], "startTime": m.get("start"),
         "endTime": m.get("end"), "matchMethod": m.get("match_method"), "sequence": i}
        for i, m in enumerate(matched)
    ]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({"basename": basename, "totalQuotes": len(quotes),
                   "unmatched": n_none, "quotes": quotes}, f, indent=2, ensure_ascii=False)
    print(f"  Saved: {output_path}")

    print("\n  Sample:")
    for q in quotes[:5]:
        ts = f"{q['startTime']:.1f}s" if q["startTime"] else "?"
        print(f"    {ts:>8}  {q['speaker']}: {q['text'][:65]}")
    return True


# ---------------------------------------------------------------------------
# SRT-based clip boundary detection
# ---------------------------------------------------------------------------

def clips_from_srt(
    srt: list[dict],
    min_dur: float,
    max_dur: float,
    gap_threshold: float,
    buffer: float,
) -> list[tuple[float, float]]:
    """
    Group SRT entries into clips by finding dialogue gaps.

    A gap > gap_threshold seconds between entries is treated as a potential
    clip boundary. Clips are kept within [min_dur, max_dur] seconds.
    buffer is added before the first and after the last subtitle in each clip.
    """
    if not srt:
        return []

    clips: list[tuple[float, float]] = []
    group: list[dict] = [srt[0]]

    for entry in srt[1:]:
        gap = entry["start"] - group[-1]["end"]
        current_dur = group[-1]["end"] - group[0]["start"]

        # Break here if: gap is big enough AND clip is long enough
        # OR clip would exceed max_dur even without a gap
        if (gap >= gap_threshold and current_dur >= min_dur) or (current_dur >= max_dur):
            clips.append((group[0]["start"], group[-1]["end"]))
            group = [entry]
        else:
            group.append(entry)

    if group:
        clips.append((group[0]["start"], group[-1]["end"]))

    # Apply buffer and split any clip still over max_dur
    final: list[tuple[float, float]] = []
    for start, end in clips:
        start = max(0.0, start - buffer)
        end = end + buffer
        dur = end - start
        if dur > max_dur:
            n = math.ceil(dur / max_dur)
            chunk = dur / n
            for i in range(n):
                final.append((round(start + i * chunk, 3), round(start + (i + 1) * chunk, 3)))
        else:
            final.append((round(start, 3), round(end, 3)))

    # Absorb short clips into previous
    result: list[tuple[float, float]] = []
    for start, end in final:
        if end - start < min_dur and result:
            prev_start, _ = result[-1]
            result[-1] = (prev_start, end)
        else:
            result.append((start, end))

    return result


# ---------------------------------------------------------------------------
# PySceneDetect fallback
# ---------------------------------------------------------------------------


def detect_scenes(mkv_path: str, threshold: float) -> list[tuple[float, float]]:
    """Run PySceneDetect and return (start, end) tuples in seconds."""
    try:
        from scenedetect import open_video, SceneManager
        from scenedetect.detectors import ContentDetector
    except ImportError:
        print("PySceneDetect not installed. Run: uv run --with scenedetect[opencv]")
        sys.exit(1)

    print(f"Detecting scenes with PySceneDetect (threshold={threshold})...")
    video = open_video(mkv_path)
    manager = SceneManager()
    manager.add_detector(ContentDetector(threshold=threshold))
    manager.detect_scenes(video, show_progress=True)
    scene_list = manager.get_scene_list()
    scenes = [(s[0].get_seconds(), s[1].get_seconds()) for s in scene_list]
    print(f"  Found {len(scenes)} scenes.")
    return scenes


def merge_scenes(scenes: list[tuple[float, float]], min_dur: float, max_dur: float) -> list[tuple[float, float]]:
    """Merge PySceneDetect scenes into target-length clips."""
    if not scenes:
        return []

    clips: list[tuple[float, float]] = []
    current_start, current_end = scenes[0]
    for scene_start, scene_end in scenes[1:]:
        if scene_end - current_start <= max_dur:
            current_end = scene_end
        else:
            clips.append((current_start, current_end))
            current_start, current_end = scene_start, scene_end
    clips.append((current_start, current_end))

    split: list[tuple[float, float]] = []
    for start, end in clips:
        dur = end - start
        if dur > max_dur:
            n = math.ceil(dur / max_dur)
            chunk = dur / n
            for i in range(n):
                split.append((start + i * chunk, start + (i + 1) * chunk))
        else:
            split.append((start, end))

    result: list[tuple[float, float]] = []
    for start, end in split:
        if end - start < min_dur and result:
            prev_start, _ = result[-1]
            result[-1] = (prev_start, end)
        else:
            result.append((start, end))
    return result


# ---------------------------------------------------------------------------
# ffmpeg clip cutting
# ---------------------------------------------------------------------------

def cut_clips(
    mkv_path: str,
    clips: list[tuple[float, float]],
    output_dir: str,
    basename: str,
) -> list[dict]:
    """Cut clips from MKV with ffmpeg. Returns manifest entries."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    manifest: list[dict] = []

    for i, (start, end) in enumerate(clips, 1):
        filename = f"{basename}_{i:03d}.mp4"
        out_path = str(Path(output_dir) / filename)
        duration = end - start
        print(f"  [{i:3d}/{len(clips)}] {start:7.1f}s – {end:7.1f}s  ({duration:.1f}s)  → {filename}")

        result = subprocess.run(
            [
                find_ffmpeg("ffmpeg"), "-y",
                "-ss", str(start),
                "-i", mkv_path,
                "-t", str(duration),
                "-c:v", "libx264", "-crf", "18", "-preset", "fast",
                "-c:a", "aac", "-b:a", "192k", "-ac", "2",
                out_path,
            ],
            capture_output=True, text=True,
        )

        if result.returncode != 0:
            print(f"    WARNING: ffmpeg failed for clip {i}")
            print(result.stderr[-500:])
        else:
            manifest.append({
                "index": i,
                "start": round(start, 3),
                "end": round(end, 3),
                "duration": round(duration, 3),
                "file": filename,
            })

    return manifest


# ---------------------------------------------------------------------------
# AI clip boundary suggestion via Claude
# ---------------------------------------------------------------------------

_AI_CLIP_PROMPT = """\
You are segmenting a Simpsons episode transcript into video clips for a searchable clip library.

Given the transcript below, identify logical clip boundaries and return ONLY a JSON array — no explanation, no markdown, no preamble.

RULES:
- First clip must start at the very beginning and end after the couch gag completes
- Last clip must end before the closing credits begin
- Cut on story logic, not time — each clip should be a self-contained scene or beat
- A clip ends when the scene genuinely changes: location shift, significant time jump, or a complete story beat that resolves before something new begins
- Do NOT cut within a continuous scene just because it's getting long — only cut if there's a real narrative break
- Do NOT cut between lines that are part of the same exchange or joke
- A typical episode will produce 15–25 clips; some long scenes may be a single clip
- Only split a long scene if there is a clear mid-scene beat that fully resolves before the next one begins — not just a topic shift

OUTPUT FORMAT — return only this, nothing else:
[
  {{
    "clip_number": 1,
    "start_time": "00:00:00",
    "end_time": "00:01:45",
    "description": "Cold open through couch gag",
    "duration_seconds": 105
  }},
  ...
]

TRANSCRIPT:
{transcript}"""


def _hhmmss_to_seconds(s: str) -> float:
    """Parse HH:MM:SS, MM:SS, or SS to seconds."""
    parts = s.strip().split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    if len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return float(s)


def suggest_clip_boundaries(quotes_path: Path, env: dict, ai_clips_path: Path) -> list[dict] | None:
    """Call Claude to suggest clip boundaries. Returns list of {index, startTime, endTime} or None."""
    if ai_clips_path.exists():
        print(f"\nAI clips already exist: {ai_clips_path}")
        data = json.loads(ai_clips_path.read_text(encoding="utf-8"))
        return data.get("clips")

    api_key = env.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("\nSkipping AI clip suggestion: ANTHROPIC_API_KEY not set in .env.local")
        return None

    try:
        import anthropic as _anthropic
    except ImportError:
        print("\nSkipping AI clip suggestion: anthropic package not installed.")
        return None

    quotes = json.loads(quotes_path.read_text(encoding="utf-8")).get("quotes", [])
    lines = []
    for q in quotes:
        t = q.get("startTime")
        if t is None:
            continue
        h, m, s = int(t // 3600), int((t % 3600) // 60), t % 60
        lines.append(f"[{h:02d}:{m:02d}:{s:05.2f}] {q.get('speaker', '')}: {q.get('text', '')}")

    if not lines:
        print("\nSkipping AI clip suggestion: no timestamped quotes found.")
        return None

    print(f"\n=== AI clip boundary suggestion ===")
    print(f"  Sending {len(lines)} lines to Claude ({len(''.join(lines))//1000}k chars)...")

    transcript = "\n".join(lines)
    prompt = _AI_CLIP_PROMPT.format(transcript=transcript)

    client = _anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()

    # Extract JSON array from response (handle optional ```json``` fences)
    start_idx = raw.find("[")
    end_idx = raw.rfind("]") + 1
    if start_idx == -1 or end_idx == 0:
        print(f"  ERROR: Could not find JSON array in response:\n{raw[:500]}")
        return None

    try:
        suggestions = json.loads(raw[start_idx:end_idx])
    except json.JSONDecodeError as e:
        print(f"  ERROR: Failed to parse Claude response as JSON: {e}")
        print(f"  Raw response (first 500 chars): {raw[:500]}")
        return None

    clips = [
        {
            "index": i,
            "startTime": _hhmmss_to_seconds(c["start_time"]),
            "endTime": _hhmmss_to_seconds(c["end_time"]),
        }
        for i, c in enumerate(suggestions, 1)
    ]

    ai_clips_path.write_text(
        json.dumps({"suggestions": suggestions, "clips": clips}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"  Got {len(clips)} clips  (avg {sum(c['endTime']-c['startTime'] for c in clips)/len(clips):.0f}s each)")
    print(f"  Saved: {ai_clips_path}")
    return clips


def push_clips_to_staging(base_url: str, ep_id: int, clips: list[dict], secret: str) -> None:
    """PUT clip boundaries to the staging API."""
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
    print(f"  ✓ Pushed {len(clips)} clip boundaries to staging episode {ep_id}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def get_duration(mkv_path: str) -> float | None:
    """Return video duration in seconds via ffprobe, or None on failure."""
    try:
        result = subprocess.run(
            [find_ffmpeg("ffprobe"), "-v", "quiet", "-print_format", "json",
             "-show_entries", "format=duration", mkv_path],
            capture_output=True, text=True,
        )
        info = json.loads(result.stdout)
        return float(info["format"]["duration"])
    except Exception:
        return None


def convert_full_mp4(mkv_path: str, output_dir: str, basename: str) -> str:
    """Convert entire MKV to a single MP4 for browser playback, with progress."""
    import time
    out_path = str(Path(output_dir) / f"{basename}.mp4")

    total = get_duration(mkv_path)
    if total:
        print(f"Converting full episode to MP4  (total: {int(total//60)}m{int(total%60):02d}s)...")
    else:
        print(f"Converting full episode to MP4...")

    proc = subprocess.Popen(
        [
            find_ffmpeg("ffmpeg"), "-y",
            "-i", mkv_path,
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k", "-ac", "2",
            "-progress", "pipe:1", "-nostats",
            out_path,
        ],
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
        elif line == "progress=end" or line.startswith("progress="):
            if total and total > 0:
                pct = min(100.0, out_time_s / total * 100)
                elapsed = time.time() - start_time
                eta = (elapsed / pct * (100 - pct)) if pct > 0 else 0
                print(f"\r  {pct:5.1f}%  elapsed {int(elapsed//60)}m{int(elapsed%60):02d}s  ETA {int(eta//60)}m{int(eta%60):02d}s   ", end="", flush=True)

    proc.wait()
    print()
    if proc.returncode != 0:
        print(f"  ERROR: ffmpeg failed (re-run with --no-convert skipped to see ffmpeg output)")
        sys.exit(1)
    print(f"  → {out_path}")
    return out_path


# ---------------------------------------------------------------------------
# MKV download from archive.org
# ---------------------------------------------------------------------------

ARCHIVE_ITEM = "thesimpletons2"
ARCHIVE_BASE = f"https://archive.org/download/{ARCHIVE_ITEM}"
def load_env(project_root: Path) -> dict:
    """Read key=value pairs from .env.local."""
    env = {}
    env_file = project_root / ".env.local"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def fetch_episode_metadata(season: int, episode: int) -> dict:
    """Fetch episode metadata from thesimpsonsapi.com.
    The API ignores query params, so we paginate through all episodes
    counting by season until we find the target.
    """
    import urllib.request
    print(f"\nFetching episode metadata for S{season:02d}E{episode:02d}...")

    page = 1
    current_season = 1
    current_ep = 0

    while True:
        url = f"https://thesimpsonsapi.com/api/episodes?page={page}&limit=25"
        with urllib.request.urlopen(url) as r:
            data = json.loads(r.read())
        results = data.get("results", [])
        if not results:
            raise ValueError(f"No episode found for S{season:02d}E{episode:02d} — ran out of pages")

        for ep in results:
            ep_season = ep.get("season", current_season)
            if ep_season != current_season:
                current_season = ep_season
                current_ep = 0
            current_ep += 1
            if current_season == season and current_ep == episode:
                title = ep.get("name", "")
                air_date = ep.get("airdate") or None
                print(f"  Title    : {title}")
                print(f"  Air date : {air_date}")
                return {"title": title, "air_date": air_date, "production_code": None}

        page += 1


def create_staging_episode(
    project_root: Path,
    basename: str,
    season: int,
    episode: int,
    title: str,
    air_date: str | None,
    production_code: str | None,
    video_path: str,
    quotes_path: str,
) -> int:
    """POST to /api/admin/staging to create the StagingEpisode. Returns its id."""
    import urllib.request

    payload = json.dumps({
        "basename": basename,
        "season": season,
        "episodeNumber": episode,
        "title": title,
        "airDate": air_date,
        "productionCode": production_code,
    }).encode()

    # Read AUTH_URL from .env.local to know where the dev server is
    env = load_env(project_root)
    base_url = env.get("AUTH_URL", "http://localhost:3000").rstrip("/")
    url = f"{base_url}/api/admin/staging"

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


def download_mkv(season: int, episode: int, output_dir: Path) -> str:
    """Download MKV for the given season/episode from archive.org. Returns local path."""
    import urllib.request

    target_stem = f"S{season:02d}E{episode:02d}"
    dest = output_dir / f"s{season:02d}e{episode:02d}.mkv"

    if dest.exists():
        print(f"MKV already exists: {dest}")
        return str(dest)

    print(f"\nFetching archive.org file list for {ARCHIVE_ITEM}...")
    meta_url = f"https://archive.org/metadata/{ARCHIVE_ITEM}"
    with urllib.request.urlopen(meta_url) as r:
        import json as _json
        meta = _json.loads(r.read())

    # Find the MKV file matching season/episode
    files = meta.get("files", [])
    match = next(
        (f for f in files if target_stem.lower() in f["name"].lower() and f["name"].endswith(".mkv")),
        None,
    )
    if not match:
        print(f"  ERROR: No MKV found for {target_stem} in archive.org/{ARCHIVE_ITEM}")
        sys.exit(1)

    remote_path = match["name"]
    url = f"{ARCHIVE_BASE}/{remote_path}"
    size_mb = int(match.get("size", 0)) / 1024 / 1024
    print(f"  Found: {remote_path} ({size_mb:.0f} MB)")
    print(f"  Downloading to {dest} ...")

    output_dir.mkdir(parents=True, exist_ok=True)

    def progress(block, block_size, total):
        if total > 0:
            pct = min(100, block * block_size * 100 // total)
            print(f"\r  {pct}%", end="", flush=True)

    urllib.request.urlretrieve(url, str(dest), reporthook=progress)
    print(f"\r  Done.        ")
    return str(dest)


# ---------------------------------------------------------------------------
# Transcript download
# ---------------------------------------------------------------------------

FORUM_URL = "https://transcripts.foreverdreaming.org/viewforum.php?f=431&sk=t&sd=a"


def download_transcript(season: int, episode: int, output_path: Path) -> bool:
    """Download transcript HTML from foreverdreaming.org. Returns True on success."""
    if output_path.exists():
        print(f"Transcript already exists: {output_path}")
        return True

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed — skipping transcript download.")
        print("Run: uv run --with playwright playwright install chromium")
        return False

    # Accept several formats: 01x03, 1x03, 01x3, 1x3
    targets = {
        f"{season:02d}x{episode:02d}",
        f"{season}x{episode:02d}",
        f"{season:02d}x{episode}",
        f"{season}x{episode}",
    }
    print(f"\nSearching for transcript (season={season}, episode={episode})...")

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
            # Wait for forum topic links to appear (handles Anubis JS challenge)
            try:
                page.wait_for_selector("a[href*='viewtopic']", timeout=30000)
            except Exception:
                print("    WARNING: timed out waiting for topic links")

            # Only look at topic links (href contains viewtopic) — much faster than all <a> tags
            topic_links = page.locator("a[href*='viewtopic']").all()
            print(f"    {len(topic_links)} topic links on page")

            for link in topic_links:
                try:
                    text = link.inner_text(timeout=1000).strip()
                except Exception:
                    continue
                text_lower = text.lower()
                if any(t in text_lower for t in targets):
                    href = link.get_attribute("href") or ""
                    if href.startswith("http"):
                        topic_url = href
                    else:
                        topic_url = f"https://transcripts.foreverdreaming.org/{href.lstrip('./')}"
                    print(f"  Found: {text!r}")
                    break

            if topic_url:
                break

            if page.locator("a[rel='next']").count() == 0:
                print(f"  No more pages — episode not found.")
                # Print a sample of what was on the last page to help debug
                sample = []
                for link in topic_links[:5]:
                    try:
                        sample.append(link.inner_text(timeout=500).strip())
                    except Exception:
                        pass
                if sample:
                    print(f"  Sample titles from last page: {sample}")
                browser.close()
                return False

            start += 25

        print(f"  Downloading transcript page...")
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
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Process MKV episode into MP4 clips")
    parser.add_argument("mkv", nargs="?", default=None,
                        help="Path to input MKV file (omit to download from archive.org)")
    parser.add_argument("--season", type=int, default=None, help="Season number (e.g. 4)")
    parser.add_argument("--episode", type=int, default=None, help="Episode number (e.g. 17)")
    parser.add_argument("--output-dir", default=None,
                        help="Directory for output (default: ./clip_prep/<basename>)")
    parser.add_argument("--regen-quotes", action="store_true",
                        help="Delete cached quotes JSON, regenerate from transcript+SRT, and replace quotes in existing staging episode")
    parser.add_argument("--no-transcript", action="store_true",
                        help="Skip transcript download")
    parser.add_argument("--no-download", action="store_true",
                        help="Skip MKV download from archive.org")
    parser.add_argument("--no-convert", action="store_true",
                        help="Skip MP4 conversion (use existing clip_prep/<basename>/<basename>.mp4)")
    # Full-MP4 mode (new workflow)
    parser.add_argument("--full-mp4", action="store_true",
                        help="Convert entire MKV to one MP4 for the admin editor (no splitting)")
    # Clip-splitting mode options
    parser.add_argument("--min-clip", type=float, default=20.0,
                        help="Minimum clip duration in seconds (default: 20)")
    parser.add_argument("--max-clip", type=float, default=60.0,
                        help="Maximum clip duration in seconds (default: 60)")
    parser.add_argument("--gap", type=float, default=2.5,
                        help="Silence gap in seconds that triggers a clip break (default: 2.5)")
    parser.add_argument("--buffer", type=float, default=0.5,
                        help="Seconds of padding before/after each clip (default: 0.5)")
    parser.add_argument("--no-srt-clips", action="store_true",
                        help="Skip SRT-based clipping, use PySceneDetect instead")
    parser.add_argument("--no-subtitles", action="store_true",
                        help="Skip subtitle extraction")
    parser.add_argument("--no-ai-clips", action="store_true",
                        help="Skip AI clip boundary suggestion")
    parser.add_argument("--regen-ai-clips", action="store_true",
                        help="Delete cached AI clips JSON and re-run Claude suggestion")
    parser.add_argument("--threshold", type=float, default=30.0,
                        help="PySceneDetect threshold (default: 30, lower = more cuts)")
    parser.add_argument("--clips", default=None,
                        help="Path to existing clips JSON to skip detection and re-cut")
    args = parser.parse_args()

    if not args.season or not args.episode:
        if not args.mkv:
            print("Error: provide --season and --episode, or a path to an MKV file.")
            sys.exit(1)

    basename = f"s{args.season:02d}e{args.episode:02d}" if (args.season and args.episode) else Path(args.mkv).stem

    # All episode files live under clip_prep/<basename>/
    episode_dir = Path(args.output_dir or f"clip_prep/{basename}")
    episode_dir.mkdir(parents=True, exist_ok=True)

    # Download MKV if not provided
    if args.mkv:
        mkv_path = str(Path(args.mkv).resolve())
        if not Path(mkv_path).exists():
            print(f"Error: file not found: {mkv_path}")
            sys.exit(1)
    else:
        mkv_path = download_mkv(args.season, args.episode, episode_dir)

    # -------------------------------------------------------------------
    # --full-mp4 mode: convert whole episode for admin editor
    # -------------------------------------------------------------------
    if args.full_mp4 or (args.season and args.episode):
        print(f"\n=== Full-MP4 mode: {Path(mkv_path).name} ===")
        print(f"  Basename   : {basename}")
        print(f"  Output dir : {episode_dir}")

        # Step 1: download transcript
        transcript_path = episode_dir / f"{basename}.html"
        if not args.no_transcript and args.season and args.episode:
            download_transcript(args.season, args.episode, transcript_path)

        # Step 2: extract embedded SRT
        srt_file = episode_dir / f"{basename}.srt"
        if srt_file.exists():
            print(f"SRT already exists: {srt_file}")
            srt_path = str(srt_file)
        elif not args.no_subtitles:
            srt_path = extract_subtitles(mkv_path, str(episode_dir), basename)
        else:
            srt_path = None

        # Step 3: convert to single MP4
        mp4_file = episode_dir / f"{basename}.mp4"
        if mp4_file.exists():
            print(f"MP4 already exists: {mp4_file}")
            mp4_path = str(mp4_file)
        else:
            mp4_path = convert_full_mp4(mkv_path, str(episode_dir), basename)

        print(f"\n=== Media ready ===")
        print(f"  Video      : {mp4_path}")
        if srt_path:
            print(f"  SRT        : {srt_path}")
        if transcript_path.exists():
            print(f"  Transcript : {transcript_path}")

        # Step 4: episode metadata
        project_root = Path(__file__).resolve().parent.parent
        env = load_env(project_root)
        ep_meta = {"title": "", "air_date": None, "production_code": None}
        if args.season and args.episode:
            try:
                ep_meta = fetch_episode_metadata(args.season, args.episode)
            except Exception as e:
                print(f"  WARNING: metadata lookup failed: {e}")

        # Step 5: generate quotes JSON
        quotes_path = episode_dir / f"{basename}-quotes.json"
        if args.regen_quotes and quotes_path.exists():
            print(f"\n--regen-quotes: deleting cached quotes JSON...")
            quotes_path.unlink()
        if quotes_path.exists():
            print(f"\nQuotes JSON already exists: {quotes_path}")
        elif srt_path and transcript_path.exists():
            generate_quotes(basename, srt_path, str(transcript_path), quotes_path)
        else:
            if not srt_path:
                print("\nWARNING: No SRT — cannot generate quotes.")
            if not transcript_path.exists():
                print(f"WARNING: Transcript not found at {transcript_path}")

        # Step 6: AI clip boundary suggestion
        ai_clips_path = episode_dir / f"{basename}-ai-clips.json"
        if args.regen_ai_clips and ai_clips_path.exists():
            print(f"\n--regen-ai-clips: deleting cached AI clips...")
            ai_clips_path.unlink()
        ai_clips = None
        if not args.no_ai_clips and quotes_path.exists():
            ai_clips = suggest_clip_boundaries(quotes_path, env, ai_clips_path)

        # Step 7: create or update StagingEpisode in DB
        if args.regen_quotes and quotes_path.exists():
            import urllib.request as _ur
            env = load_env(project_root)
            base_url = env.get("AUTH_URL", "http://localhost:3000").rstrip("/")
            secret = env.get("INTERNAL_API_SECRET", "")
            # Look up existing staging episode by basename
            try:
                req = _ur.Request(
                    f"{base_url}/api/admin/staging?basename={basename}",
                    headers={"x-internal-secret": secret},
                )
                with _ur.urlopen(req) as r:
                    ep_data = json.loads(r.read())
                ep_id = ep_data["id"]
                print(f"\n--regen-quotes: replacing quotes for staging episode id={ep_id}...")
                put_req = _ur.Request(
                    f"{base_url}/api/admin/staging/{ep_id}/quotes",
                    data=b"{}",
                    headers={"Content-Type": "application/json", "x-internal-secret": secret},
                    method="PUT",
                )
                with _ur.urlopen(put_req) as r:
                    result = json.loads(r.read())
                print(f"  ✓ Replaced quotes: {result.get('total')} total")
                print(f"  {base_url}/admin/staging/{ep_id}")
            except Exception as e:
                print(f"  WARNING: Could not replace quotes: {e}")
            return

        if quotes_path.exists() and ep_meta.get("title"):
            import urllib.error as _ue
            import urllib.request as _ur

            base_url = env.get("AUTH_URL", "http://localhost:3000").rstrip("/")
            secret = env.get("INTERNAL_API_SECRET", "")
            ep_id = None

            try:
                ep_id = create_staging_episode(
                    project_root=project_root,
                    basename=basename,
                    season=args.season,
                    episode=args.episode,
                    title=ep_meta["title"],
                    air_date=ep_meta.get("air_date"),
                    production_code=ep_meta.get("production_code"),
                    video_path=mp4_path,
                    quotes_path=str(quotes_path),
                )
            except _ue.HTTPError as e:
                if e.code == 409:
                    # Staging episode already exists — look up its id
                    try:
                        req = _ur.Request(
                            f"{base_url}/api/admin/staging?basename={basename}",
                            headers={"x-internal-secret": secret},
                        )
                        with _ur.urlopen(req) as r:
                            ep_id = json.loads(r.read())["id"]
                        print(f"  Staging episode already exists (id={ep_id})")
                    except Exception as lookup_err:
                        print(f"\nWARNING: Could not look up existing staging episode: {lookup_err}")
                else:
                    print(f"\nWARNING: Could not create staging episode: {e}")
                    print(f"  Make sure the dev server is running, then go to /admin/staging/new")
            except Exception as e:
                print(f"\nWARNING: Could not create staging episode: {e}")
                print(f"  Make sure the dev server is running, then go to /admin/staging/new")

            if ep_id is not None:
                if ai_clips:
                    try:
                        push_clips_to_staging(base_url, ep_id, ai_clips, secret)
                    except Exception as e:
                        print(f"  WARNING: Could not push AI clips: {e}")

                print(f"\n✓ Episode ready for editing:")
                print(f"  {base_url}/admin/staging/{ep_id}")
        elif not quotes_path.exists():
            print(f"\nQuotes JSON missing — run import-episode.py manually, then create staging episode at /admin/staging/new")

        return

    # -------------------------------------------------------------------
    # Original clip-splitting mode
    # -------------------------------------------------------------------
    output_dir = str(episode_dir)

    print(f"\n=== Processing: {Path(mkv_path).name} ===")
    print(f"  Output dir : {output_dir}")
    print(f"  Basename   : {basename}")
    print(f"  Clip range : {args.min_clip}–{args.max_clip}s")
    print()

    # Step 1: subtitles
    srt_path = None
    if not args.no_subtitles:
        srt_path = extract_subtitles(mkv_path, output_dir, basename)
    print()

    # Step 2: clip boundaries
    clips_json_path = str(Path(output_dir) / f"{basename}-clips.json")

    if args.clips:
        print(f"Loading clips from {args.clips}...")
        with open(args.clips) as f:
            clips = [tuple(c) for c in json.load(f)]
        print(f"  Loaded {len(clips)} clips.")

    elif srt_path and not args.no_srt_clips:
        print(f"Building clip boundaries from SRT (gap={args.gap}s, buffer={args.buffer}s)...")
        srt = parse_srt(srt_path)
        print(f"  {len(srt)} subtitle entries")
        clips = clips_from_srt(srt, args.min_clip, args.max_clip, args.gap, args.buffer)
        print(f"  → {len(clips)} clips")
        with open(clips_json_path, "w") as f:
            json.dump(clips, f, indent=2)
        print(f"  Clip boundaries saved to {clips_json_path}")

    else:
        print("No SRT available — falling back to PySceneDetect...")
        scenes = detect_scenes(mkv_path, args.threshold)
        scenes_path = str(Path(output_dir) / f"{basename}-scenes.json")
        with open(scenes_path, "w") as f:
            json.dump(scenes, f, indent=2)
        print(f"  Scenes saved to {scenes_path}")
        clips = merge_scenes(scenes, args.min_clip, args.max_clip)
        print(f"  → {len(clips)} clips after merging")
        with open(clips_json_path, "w") as f:
            json.dump(clips, f, indent=2)

    print()

    # Step 3: cut MP4s
    print(f"Cutting {len(clips)} clips with ffmpeg...")
    manifest = cut_clips(mkv_path, clips, output_dir, basename)
    print()

    # Step 4: write manifest
    manifest_path = str(Path(output_dir) / f"{basename}-manifest.json")
    with open(manifest_path, "w") as f:
        json.dump({
            "basename": basename,
            "source": mkv_path,
            "subtitles": srt_path,
            "clip_method": "srt" if (srt_path and not args.no_srt_clips) else "scenedetect",
            "clip_count": len(manifest),
            "clips": manifest,
        }, f, indent=2)

    print(f"Done! {len(manifest)} clips → {output_dir}/")
    print(f"Manifest:  {manifest_path}")
    if srt_path:
        print(f"Subtitles: {srt_path}")


if __name__ == "__main__":
    main()
