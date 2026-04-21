#!/usr/bin/env python3
"""Batch import The Office Season 2, episodes 11–22."""

import subprocess
import sys
from pathlib import Path

SEASON = 2
START = 11
END = 22

failed = []

for ep in range(START, END + 1):
    print(f"\n{'='*60}")
    print(f"  Starting S{SEASON:02d}E{ep:02d} ({ep - START + 1}/{END - START + 1})")
    print(f"{'='*60}\n")
    result = subprocess.run(
        ["uv", "run", "scripts/process-office-episode.py",
         "--season", str(SEASON), "--episode", str(ep)],
        cwd=Path(__file__).resolve().parent.parent,
    )
    if result.returncode != 0:
        print(f"\nERROR: S{SEASON:02d}E{ep:02d} failed (exit {result.returncode}) — continuing.")
        failed.append(ep)

if failed:
    print(f"\n⚠ Failed episodes: {', '.join(f'E{e:02d}' for e in failed)}")
else:
    print(f"\n✓ All episodes S{SEASON:02d}E{START:02d}–E{END:02d} imported successfully.")
