#!/usr/bin/env python3

from __future__ import annotations

import argparse
from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "pws-structuring-service"))
from import_cleaner import prepare_outline_markdown  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare a cleaned PWS text file for StormSurge V4 outline import.")
    parser.add_argument("input_file", type=Path)
    parser.add_argument("output_file", type=Path)
    args = parser.parse_args()

    text = args.input_file.read_text(encoding="utf-8", errors="ignore")
    args.output_file.write_text(prepare_outline_markdown(text), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
