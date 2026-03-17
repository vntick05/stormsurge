from __future__ import annotations

from typing import Any


def _section_id(section_number: str | None, section_title: str | None, index: int) -> str:
    base = (section_number or section_title or f"section-{index}").lower()
    slug = "".join(char if char.isalnum() else "-" for char in base).strip("-")
    return f"section-{slug or index}"


def _hierarchy_quality(sections: list[dict[str, Any]], provider: str) -> tuple[str, float]:
    if not sections:
        return "weak", 0.35
    if provider.endswith("pws") or len(sections) >= 3:
        return "strong", 0.9
    return "partial", 0.7


def _root_sections_from_sections(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    stack: list[dict[str, Any]] = []

    for index, section in enumerate(sections):
        section_number = section.get("section_number")
        title = section.get("section_title") or section.get("section_heading") or f"Section {index + 1}"
        depth = max(len(str(section_number or "").split(".")), 1) if section_number else 1
        node = {
            "section_number": section_number,
            "section_title": title,
            "depth": depth,
            "children": [],
        }
        while stack and int(stack[-1]["depth"]) >= depth:
            stack.pop()
        if stack:
            stack[-1]["children"].append(node)
        else:
            nodes.append(node)
        stack.append(node)
    return nodes


def _flat_sections(root_sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    def visit(node: dict[str, Any], parent_section_number: str | None) -> None:
        section_number = node.get("section_number")
        section_title = node.get("section_title") or ""
        items.append(
            {
                "section_id": _section_id(section_number, section_title, len(items)),
                "section_number": section_number,
                "section_title": section_title,
                "depth": int(node.get("depth") or 1),
                "parent_section_number": parent_section_number,
            }
        )
        for child in node.get("children", []):
            if isinstance(child, dict) and child.get("section_title") is not None:
                visit(child, section_number)

    for root in root_sections:
        visit(root, None)
    return items


def _table_objects(tables: list[dict[str, Any]]) -> list[dict[str, Any]]:
    objects: list[dict[str, Any]] = []
    for index, table in enumerate(tables):
        objects.append(
            {
                "object_id": f"obj-table-{index}",
                "type": "table",
                "caption": "",
                "page": table.get("page_start"),
                "document_order": index,
                "source_ref": table.get("source_node_ref"),
                "attached_section_id": _section_id(table.get("section_number"), table.get("section_heading"), index)
                if table.get("section_heading") or table.get("section_number")
                else None,
                "attachment_confidence": float(table.get("confidence") or 0.6),
                "attachment_method": "section_record_link" if table.get("section_heading") else "unplaced",
                "debug_reason": "Derived from normalized table records.",
                "rows": [],
                "nearby_text_before": "",
                "nearby_text_after": "",
            }
        )
    return objects


def _block_records(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for block in blocks:
        items.append(
            {
                "block_type": block.get("block_type"),
                "document_order": int(block.get("document_order") or 0),
                "page_start": block.get("page_start"),
                "page_end": block.get("page_end"),
                "source_ref": block.get("source_block_ref"),
                "section_number": block.get("numbering_token"),
                "section_title": block.get("heading_title"),
                "text": block.get("normalized_text"),
                "caption": None,
                "rows": [],
            }
        )
    return items


def validate_structured_document_artifact(payload: dict[str, Any]) -> dict[str, Any]:
    required = {"artifact_type", "document_id", "source", "metadata", "cleaned_text", "hierarchy", "objects", "blocks", "enrichments", "provenance"}
    missing = sorted(required - set(payload))
    if missing:
        raise ValueError(f"Structured artifact missing fields: {', '.join(missing)}")
    if payload.get("artifact_type") != "structured_document_v1":
        raise ValueError("Unsupported structured artifact type")
    if not (payload.get("source") or {}).get("filename"):
        raise ValueError("source.filename is required")
    if not isinstance(((payload.get("hierarchy") or {}).get("sections")), list):
        raise ValueError("hierarchy.sections must be a list")
    if not isinstance(((payload.get("hierarchy") or {}).get("root_sections")), list):
        raise ValueError("hierarchy.root_sections must be a list")
    return payload


def build_structured_document_artifact(
    *,
    document_id: str,
    filename: str,
    content_sha256: str | None,
    provider: str,
    normalized_markdown: str,
    sections: list[dict[str, Any]],
    tables: list[dict[str, Any]],
    blocks: list[dict[str, Any]] | None,
    pws_artifacts: dict[str, Any] | None,
) -> dict[str, Any]:
    root_sections = _root_sections_from_sections(sections)
    flat_sections = _flat_sections(root_sections)
    hierarchy_quality, hierarchy_confidence = _hierarchy_quality(sections, provider)
    block_records = _block_records(blocks or [])
    table_objects = _table_objects(tables)
    image_objects: list[dict[str, Any]] = []
    source_pages = sorted(
        {
            int(page)
            for page in [*(block.get("page_start") for block in blocks or []), *(table.get("page_start") for table in tables)]
            if page is not None
        }
    )
    artifact = {
        "artifact_type": "structured_document_v1",
        "document_id": document_id,
        "source": {
            "filename": filename,
            "mime_type": None,
            "sha256": content_sha256,
        },
        "metadata": {
            "document_type": "pws_sow" if pws_artifacts is not None else "document",
            "document_type_confidence": 0.92 if pws_artifacts is not None else 0.6,
            "page_count": max(source_pages) if source_pages else None,
            "ingested_at": None,
        },
        "cleaned_text": {
            "full_text": normalized_markdown,
            "cleaning_profile": "pws_clean_v2" if pws_artifacts is not None else "docling_normalized_v1",
        },
        "hierarchy": {
            "quality": hierarchy_quality,
            "confidence": hierarchy_confidence,
            "sections": flat_sections,
            "root_sections": root_sections,
        },
        "objects": {
            "tables": table_objects,
            "images": image_objects,
        },
        "blocks": block_records,
        "enrichments": {
            "pws": {
                "applied": pws_artifacts is not None,
                "confidence": 0.93 if pws_artifacts is not None else 0.0,
                "heading_profile": "pws_headings_v2" if pws_artifacts is not None else None,
                "alignment_profile": "pws_alignment_v1" if pws_artifacts is not None else None,
                "requirements_detected": bool((pws_artifacts or {}).get("requirements")),
                "heading_anchors": [],
                "section_alignment_debug": [],
                "unplaced_object_ids": [],
            }
        },
        "provenance": {
            "parser": provider,
            "parser_version": "v1",
            "source_pages": source_pages,
        },
    }
    return validate_structured_document_artifact(artifact)
