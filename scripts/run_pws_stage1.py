#!/usr/bin/env python3
import json
import pathlib
import sys


REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
SERVICE_DIR = REPO_ROOT / "services" / "pws-structuring-service"
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from stage1_parser import build_stage1_section_tree, load_stage1_input


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: run_pws_stage1.py <artifact.json>", file=sys.stderr)
        return 2

    artifact_path = pathlib.Path(sys.argv[1]).resolve()
    payload = json.loads(artifact_path.read_text())
    nested_payload = payload.get("pws_extract")
    filename, structured_document, normalized_markdown = load_stage1_input(
        {
            "filename": payload.get("filename") or artifact_path.name,
            "docling_structured_document": payload.get("docling_structured_document"),
            "normalized_markdown": payload.get("normalized_markdown"),
        }
    )
    result = build_stage1_section_tree(
        filename=filename,
        structured_document=structured_document,
        normalized_markdown=normalized_markdown,
    )
    if nested_payload:
        result["comparison"] = {
            "existing_pws_extract_section_count": len(nested_payload.get("sections", [])),
            "existing_parse_mode": nested_payload.get("parse_mode_selected"),
        }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
