#!/usr/bin/env python3
"""
Process an MKV episode file into MP4 clips ready for DB import.

Clip boundary strategy (in priority order):
  1. SRT-based  — groups subtitle entries by dialogue gaps (preferred)
  2. PySceneDetect — visual scene detection fallback when no SRT available

Steps:
  1. Extract embedded subtitles (SRT) from the MKV if present
  2. Detect clip boundaries (SRT gaps or PySceneDetect)
  3. Save clip list to JSON
  4. Cut each clip to MP4 with ffmpeg
  5. Write a JSON manifest (clip index, start/end times, output file)

Usage:
  uv run --with scenedetect[opencv] scripts/process-episode.py /path/to/s01e01.mkv --basename s01e01
  uv run --with scenedetect[opencv] scripts/process-episode.py /path/to/s01e01.mkv --basename s01e01 --clips clips/s01e01/s01e01-clips.json
  uv run --with scenedetect[opencv] scripts/process-episode.py /path/to/s01e01.mkv --basename s01e01 --no-srt-clips

Requirements:
  uv run --with scenedetect[opencv]   (only needed for PySceneDetect fallback)
  ffmpeg available via WinGet or PATH
"""

import argparse
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path


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
# Main
# ---------------------------------------------------------------------------

def convert_full_mp4(mkv_path: str, output_dir: str, basename: str) -> str:
    """Convert entire MKV to a single MP4 for browser playback (no splitting)."""
    out_path = str(Path(output_dir) / f"{basename}.mp4")
    print(f"Converting full episode to MP4...")
    result = subprocess.run(
        [
            find_ffmpeg("ffmpeg"), "-y",
            "-i", mkv_path,
            "-c:v", "libx264", "-crf", "18", "-preset", "fast",
            "-c:a", "aac", "-b:a", "192k", "-ac", "2",
            out_path,
        ],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"  ERROR: ffmpeg failed")
        print(result.stderr[-500:])
        sys.exit(1)
    print(f"  → {out_path}")
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Process MKV episode into MP4 clips")
    parser.add_argument("mkv", help="Path to input MKV file")
    parser.add_argument("--output-dir", default=None,
                        help="Directory for output (default: ./clip_prep/<basename> for --full-mp4, ./clips/<basename> otherwise)")
    parser.add_argument("--basename", default=None,
                        help="Base name for output files, e.g. s01e01 (default: MKV filename stem)")
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
    parser.add_argument("--threshold", type=float, default=30.0,
                        help="PySceneDetect threshold (default: 30, lower = more cuts)")
    parser.add_argument("--clips", default=None,
                        help="Path to existing clips JSON to skip detection and re-cut")
    args = parser.parse_args()

    mkv_path = str(Path(args.mkv).resolve())
    if not Path(mkv_path).exists():
        print(f"Error: file not found: {mkv_path}")
        sys.exit(1)

    basename = args.basename or Path(mkv_path).stem

    # -------------------------------------------------------------------
    # --full-mp4 mode: convert whole episode for admin editor
    # -------------------------------------------------------------------
    if args.full_mp4:
        output_dir = args.output_dir or str(Path("clip_prep") / basename)
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        print(f"\n=== Full-MP4 mode: {Path(mkv_path).name} ===")
        print(f"  Output dir : {output_dir}")
        print(f"  Basename   : {basename}")

        srt_path = None
        if not args.no_subtitles:
            srt_path = extract_subtitles(mkv_path, output_dir, basename)

        mp4_path = convert_full_mp4(mkv_path, output_dir, basename)

        print(f"\nDone!")
        print(f"  Video : {mp4_path}")
        if srt_path:
            print(f"  SRT   : {srt_path}")
        print()
        print("Next step:")
        print(f"  uv run --with beautifulsoup4 scripts/import-episode.py \\")
        print(f"    --srt {srt_path or '<srt_path>'} \\")
        print(f"    --transcript clip_prep/transcripts/{basename}.html \\")
        print(f"    --output clip_prep/{basename}/{basename}-quotes.json")
        return

    # -------------------------------------------------------------------
    # Original clip-splitting mode
    # -------------------------------------------------------------------
    output_dir = args.output_dir or str(Path("clips") / basename)
    Path(output_dir).mkdir(parents=True, exist_ok=True)

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
