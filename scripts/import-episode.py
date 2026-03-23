#!/usr/bin/env python3
"""
Match a foreverdreaming transcript to SRT timestamps and assign to clips.

Outputs a preview JSON for review — does NOT write to the database.

Usage:
  uv run --with beautifulsoup4 scripts/import-episode.py \\
    --manifest clips/s01e01/s01e01-manifest.json \\
    --srt clips/s01e01/s01e01.srt \\
    --transcript clip_prep/transcripts/s01e01.html

  # Use --clips if manifest not yet written (still cutting):
  uv run --with beautifulsoup4 scripts/import-episode.py \\
    --clips clips/s01e01/s01e01-clips.json --basename s01e01 ...
"""

import argparse
import json
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from difflib import SequenceMatcher
from pathlib import Path


# ---------------------------------------------------------------------------
# Text helpers
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

def clean(text: str) -> str:
    """Decode Unicode punctuation and strip stage directions."""
    text = text.translate(_UNICODE_MAP)
    text = re.sub(r"\s*\([^)]*\)", "", text)   # strip (stage directions)
    text = re.sub(r"\s*\[[^\]]*\]", "", text)   # strip [brackets]
    text = re.sub(r"[♪♫]+", "", text)           # strip music notes
    text = re.sub(r"\s{2,}", " ", text)          # collapse extra spaces
    return text.strip()

def normalize(text: str) -> str:
    """Lowercase, strip punctuation/symbols — for matching only."""
    text = text.lower()
    text = re.sub(r"[♪♫]", "", text)
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


# ---------------------------------------------------------------------------
# SRT parser
# ---------------------------------------------------------------------------

def parse_srt(path: str) -> list[dict]:
    """
    Parse SRT file into entries: {start, end, text}.

    - Pure music lines (♪♪) are skipped.
    - Multi-speaker lines (starting with -) are split into separate entries
      sharing the same timestamp.
    """
    raw = Path(path).read_text(encoding="utf-8", errors="replace")
    entries = []

    def to_sec(h, m, s, ms):
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000

    for block in re.split(r"\n\s*\n", raw.strip()):
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
        end   = to_sec(*m.groups()[4:])

        # Join dialogue lines, strip HTML tags
        raw_text = " ".join(lines[2:]).strip()
        raw_text = re.sub(r"<[^>]+>", "", raw_text).strip()

        # Split multi-speaker lines: "- Line one - Line two"
        if re.match(r"^-\s", raw_text):
            parts = re.split(r"\s*-\s+", raw_text)
            for part in parts:
                part = clean(part.strip())
                if part:
                    entries.append({"start": start, "end": end, "text": part})
        else:
            text = clean(raw_text.lstrip("- ").strip())
            if text:
                entries.append({"start": start, "end": end, "text": text})

    return entries


# ---------------------------------------------------------------------------
# Transcript parser (foreverdreaming HTML)
# ---------------------------------------------------------------------------

def parse_transcript(path: str) -> list[dict]:
    """
    Parse foreverdreaming transcript HTML into {speaker, text} pairs.

    Rules:
    - "Speaker: dialogue" starts a new speaker.
    - Lines without a speaker prefix continue the previous speaker.
    - (Stage directions) and [bracketed text] are stripped.
    - Lines that are purely stage directions or empty are skipped.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("ERROR: beautifulsoup4 not installed. Add --with beautifulsoup4 to uv run.")
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
    # Matches an inline speaker switch mid-line, e.g. "...home. Patty: Mm-hmm..."
    # All words must start uppercase so "Come staggering home. Patty:" doesn't greedily match.
    INLINE_SPEAKER_RE = re.compile(r"((?:[A-Z][A-Za-z'.]*)(?:\s+[A-Z][A-Za-z'.]*){0,3}):\s*")

    def emit_with_inline_splits(text: str, speaker: str | None) -> str | None:
        """Split text on inline 'Speaker: ...' markers, emit entries, return last speaker."""
        tokens = INLINE_SPEAKER_RE.split(text)
        # tokens: [pre_text, spk1, text1, spk2, text2, ...]
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
        # Strip HTML tags and decode entities
        text = re.sub(r"<[^>]+>", "", part)
        for ent, ch in [("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                        ("&quot;", '"'), ("&#39;", "'"), ("&nbsp;", " ")]:
            text = text.replace(ent, ch)

        text = clean(text.strip())

        if not text:
            continue

        m = SPEAKER_RE.match(text)
        if m:
            current_speaker = m.group(1).strip()
            dialogue = m.group(2).strip()
            if dialogue:
                current_speaker = emit_with_inline_splits(dialogue, current_speaker)
            # else: "Speaker:" alone — next lines will be attributed to them
        elif current_speaker and text:
            current_speaker = emit_with_inline_splits(text, current_speaker)

    return entries


# ---------------------------------------------------------------------------
# Matching: character-level difflib + positional interpolation
# ---------------------------------------------------------------------------

def build_char_index(entries: list[dict]) -> tuple[str, list[int]]:
    """
    Concatenate normalized entry texts into one string.
    Returns (full_string, position_to_entry_index).
    """
    chars: list[str] = []
    positions: list[int] = []
    for idx, entry in enumerate(entries):
        norm = normalize(entry["text"])
        for ch in norm:
            chars.append(ch)
            positions.append(idx)
        # Space separator between entries
        chars.append(" ")
        positions.append(idx)
    return "".join(chars), positions


def _token_overlap(a: str, b: str) -> float:
    """Fraction of words in a that appear in b (normalized)."""
    wa = set(normalize(a).split())
    wb = set(normalize(b).split())
    if not wa:
        return 0.0
    return len(wa & wb) / len(wa)


def match_to_srt(
    transcript: list[dict],
    srt: list[dict],
    min_match_chars: int = 12,
) -> list[dict]:
    """
    Three-pass matching:

    Pass 1 — difflib character-level alignment:
      Concatenate all transcript text and all SRT text into two long strings.
      SequenceMatcher finds common substrings (anchors).
      Each anchor gives us: transcript_idx → srt_idx → timestamp.

    Pass 2 — local fuzzy search for positional lines:
      For lines not anchored by difflib, search SRT entries in a window around
      the interpolated position for the best word-overlap match. Takes the best
      hit above a threshold; falls back to pure interpolation otherwise.

    Pass 3 — positional interpolation fallback:
      Any remaining unmatched lines get the interpolated SRT index.
    """
    t_str, t_pos = build_char_index(transcript)
    s_str, s_pos = build_char_index(srt)

    matcher = SequenceMatcher(None, t_str, s_str, autojunk=False)

    # Pass 1: anchor points from difflib
    assignments: dict[int, int] = {}  # t_idx → s_idx
    methods: dict[int, str] = {}
    for i, j, n in matcher.get_matching_blocks():
        if n < min_match_chars:
            continue
        if i >= len(t_pos) or j >= len(s_pos):
            continue
        t_idx = t_pos[i]
        s_idx = s_pos[j]
        if t_idx not in assignments:
            assignments[t_idx] = s_idx
            methods[t_idx] = "difflib"

    n_anchors = len(assignments)

    N, M = len(transcript), len(srt)
    anchors = sorted([(-1, -1)] + list(assignments.items()) + [(N, M)])

    def interpolated_s_idx(t_idx: int) -> int:
        prev_a = (-1, -1)
        next_a = (N, M)
        for a in anchors:
            if a[0] < t_idx:
                prev_a = a
            elif a[0] > t_idx:
                next_a = a
                break
        t_span = next_a[0] - prev_a[0]
        s_span = next_a[1] - prev_a[1]
        if t_span <= 0 or s_span <= 0:
            return -1
        frac = (t_idx - prev_a[0]) / t_span
        return max(0, min(M - 1, round(prev_a[1] + frac * s_span)))

    # Pass 2: local fuzzy search within a window around the interpolated position
    WINDOW = 8          # search ±8 SRT entries around interpolated index
    FUZZY_THRESHOLD = 0.4  # min word-overlap fraction to accept a fuzzy match

    for t_idx in range(N):
        if t_idx in assignments:
            continue
        base = interpolated_s_idx(t_idx)
        if base < 0:
            continue

        t_text = transcript[t_idx]["text"]
        best_score = -1.0
        best_s = base
        lo = max(0, base - WINDOW)
        hi = min(M - 1, base + WINDOW)
        for s_idx in range(lo, hi + 1):
            score = _token_overlap(t_text, srt[s_idx]["text"])
            if score > best_score:
                best_score = score
                best_s = s_idx

        if best_score >= FUZZY_THRESHOLD:
            assignments[t_idx] = best_s
            methods[t_idx] = "fuzzy"
        else:
            assignments[t_idx] = base
            methods[t_idx] = "positional"

    # Build result list
    results = []
    for t_idx, entry in enumerate(transcript):
        if t_idx in assignments:
            s_idx = assignments[t_idx]
            srt_e = srt[s_idx]
            method = methods.get(t_idx, "positional")
            results.append({
                **entry,
                "start": srt_e["start"],
                "end": srt_e["end"],
                "srt_text": srt_e["text"],
                "match_method": method,
            })
        else:
            results.append({**entry, "start": None, "end": None, "srt_text": None, "match_method": None})

    return results, n_anchors




# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Match transcript to SRT timestamps and output quotes JSON")
    parser.add_argument("--basename", required=True, help="Episode basename, e.g. s01e01")
    parser.add_argument("--srt", required=True, help="SRT subtitle file")
    parser.add_argument("--transcript", required=True, help="Saved foreverdreaming HTML")
    parser.add_argument("--output", help="Output quotes JSON path (default: clip_prep/<basename>/<basename>-quotes.json)")
    parser.add_argument("--min-match", type=int, default=12,
                        help="Minimum char length for a difflib anchor match (default: 12)")
    args = parser.parse_args()

    basename = args.basename
    output_path = args.output or str(Path("clip_prep") / basename / f"{basename}-quotes.json")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    print(f"\n=== Episode Quote Matching: {basename} ===\n")

    srt = parse_srt(args.srt)
    print(f"SRT:        {len(srt)} entries")

    transcript = parse_transcript(args.transcript)
    print(f"Transcript: {len(transcript)} lines")

    print(f"\nMatching...")
    matched, n_anchors = match_to_srt(transcript, srt, args.min_match)
    n_fuzzy = sum(1 for m in matched if m.get("match_method") == "fuzzy")
    n_pos   = sum(1 for m in matched if m.get("match_method") == "positional")
    n_none  = sum(1 for m in matched if m.get("match_method") is None)
    print(f"  {n_anchors} difflib, {n_fuzzy} fuzzy, {n_pos} positional, {n_none} unmatched")

    quotes = [
        {
            "speaker":     m["speaker"],
            "text":        m["text"],
            "startTime":   m.get("start"),
            "endTime":     m.get("end"),
            "matchMethod": m.get("match_method"),
            "sequence":    i,
        }
        for i, m in enumerate(matched)
    ]

    output = {
        "basename":    basename,
        "totalQuotes": len(quotes),
        "unmatched":   n_none,
        "quotes":      quotes,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nOutput: {output_path}")

    # Sample
    print("\n--- Sample ---")
    for q in quotes[:10]:
        method = (q.get("matchMethod") or "?")[0].upper()
        ts = f"{q['startTime']:.1f}s" if q["startTime"] else "?"
        print(f"  [{method}] {ts:>8}  {q['speaker']}: {q['text'][:65]}")


if __name__ == "__main__":
    main()
