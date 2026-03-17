#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import pathlib
import sys
from typing import Any


REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
SERVICE_DIR = REPO_ROOT / "services" / "pws-structuring-service"
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from rich_import import extract_structured_blocks, render_rich_markdown  # type: ignore
from stage1_parser import build_stage1_section_tree, load_stage1_input  # type: ignore


def load_source(path: pathlib.Path) -> tuple[str, dict[str, Any], str | None]:
    if path.suffix.lower() == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        filename, structured_document, normalized_markdown = load_stage1_input(
            {
                "filename": payload.get("filename") or path.name,
                "structured_document": payload.get("structured_document"),
                "docling_structured_document": payload.get("docling_structured_document"),
                "normalized_markdown": payload.get("normalized_markdown"),
                "markdown": payload.get("markdown"),
            }
        )
        if structured_document is None:
            raise ValueError("artifact JSON does not contain structured_document or docling_structured_document")
        return filename, structured_document, normalized_markdown

    try:
        from app import normalize_with_docling  # type: ignore
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Docling is not available in this Python environment. "
            "Run this script against an artifact JSON that already contains "
            "structured_document/docling_structured_document, or run it from the "
            "pws-structuring-service environment where Docling is installed."
        ) from exc

    content = path.read_bytes()
    markdown, structured_document = normalize_with_docling(path.name, content)
    return path.name, structured_document, markdown


def build_rich_payload(filename: str, structured_document: dict[str, Any], normalized_markdown: str | None) -> dict[str, Any]:
    blocks = extract_structured_blocks(structured_document)
    stage1 = build_stage1_section_tree(
        filename=filename,
        structured_document=structured_document,
        normalized_markdown=normalized_markdown,
    )
    return {
        "filename": filename,
        "stage": "rich_import_artifact_v1",
        "sections": stage1.get("sections", []),
        "blocks": blocks,
        "normalized_markdown": normalized_markdown,
        "structured_document": structured_document,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build a rich PWS markdown artifact that preserves headings, tables, and image placeholders from Docling structured output."
    )
    parser.add_argument("input_file", type=pathlib.Path, help="Original document (.docx/.pdf) or a stage artifact JSON")
    parser.add_argument("output_prefix", type=pathlib.Path, help="Output prefix without extension")
    args = parser.parse_args()

    filename, structured_document, normalized_markdown = load_source(args.input_file.resolve())
    payload = build_rich_payload(filename, structured_document, normalized_markdown)

    output_prefix = args.output_prefix.resolve()
    output_prefix.parent.mkdir(parents=True, exist_ok=True)

    rich_json_path = output_prefix.with_suffix(".rich.json")
    rich_md_path = output_prefix.with_suffix(".rich.md")

    rich_json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    rich_md_path.write_text(render_rich_markdown(payload["blocks"]), encoding="utf-8")

    print(
        json.dumps(
            {
                "filename": filename,
                "rich_json": str(rich_json_path),
                "rich_markdown": str(rich_md_path),
                "section_count": len(payload["sections"]),
                "block_count": len(payload["blocks"]),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
