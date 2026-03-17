from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

from rich_import import flatten_outline_sections, make_section_id, normalize_text


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_document_id(filename: str, normalized_markdown: str) -> str:
    digest = hashlib.sha256(f"{filename}\n{normalized_markdown}".encode("utf-8")).hexdigest()[:16]
    return f"doc-{digest}"


def hierarchy_quality_for_outline(root_sections: list[dict[str, Any]]) -> tuple[str, float]:
    sections = flatten_outline_sections(root_sections)
    if not sections:
        return "none", 0.0
    if len(sections) >= 3:
        return "strong", 0.92
    if len(sections) >= 1:
        return "partial", 0.72
    return "weak", 0.45


def summarize_provenance_pages(blocks: list[dict[str, Any]]) -> list[int]:
    pages = {
        int(source["page_start"])
        for block in blocks
        for source in [block.get("source") or {}]
        if source.get("page_start") is not None
    }
    return sorted(pages)


def serialize_blocks(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    serialized: list[dict[str, Any]] = []
    for block in blocks:
        source = block.get("source") or {}
        payload = {
            "block_type": block.get("block_type"),
            "document_order": int(block.get("order") or 0),
            "page_start": source.get("page_start"),
            "page_end": source.get("page_end"),
            "source_ref": source.get("ref"),
        }
        if block.get("block_type") == "heading":
            heading = block.get("heading") or {}
            payload["section_number"] = heading.get("section_number")
            payload["section_title"] = heading.get("section_title")
            payload["text"] = block.get("text")
        elif block.get("block_type") == "text":
            payload["text"] = block.get("text")
        elif block.get("block_type") == "table":
            payload["rows"] = block.get("rows") or []
        elif block.get("block_type") == "image":
            payload["caption"] = block.get("caption") or ""
        serialized.append(payload)
    return serialized


def serialize_objects(alignment_decisions: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    tables: list[dict[str, Any]] = []
    images: list[dict[str, Any]] = []
    for decision in alignment_decisions:
        target = tables if decision.get("type") == "table" else images
        target.append(
            {
                "object_id": decision.get("object_id"),
                "type": decision.get("type"),
                "caption": decision.get("caption") or "",
                "page": decision.get("page"),
                "document_order": decision.get("document_order"),
                "source_ref": decision.get("source_ref"),
                "attached_section_id": decision.get("attached_section_id"),
                "attachment_confidence": decision.get("attachment_confidence"),
                "attachment_method": decision.get("attachment_method"),
                "debug_reason": decision.get("debug_reason"),
                "rows": decision.get("rows") or [],
                "nearby_text_before": decision.get("nearby_text_before") or "",
                "nearby_text_after": decision.get("nearby_text_after") or "",
            }
        )
    return {"tables": tables, "images": images}


def serialize_sections(root_sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sections = flatten_outline_sections(root_sections)
    for section in sections:
        section["section_id"] = make_section_id(section.get("section_number"), section.get("section_title"))
    return sections


def validate_structured_document_artifact(payload: dict[str, Any]) -> dict[str, Any]:
    required_top_level = {
        "artifact_type",
        "document_id",
        "source",
        "metadata",
        "cleaned_text",
        "hierarchy",
        "objects",
        "blocks",
        "enrichments",
        "provenance",
    }
    missing = sorted(required_top_level - set(payload))
    if missing:
        raise ValueError(f"Structured artifact missing fields: {', '.join(missing)}")
    if payload.get("artifact_type") != "structured_document_v1":
        raise ValueError("Structured artifact has unsupported artifact_type")
    source = payload.get("source") or {}
    metadata = payload.get("metadata") or {}
    cleaned_text = payload.get("cleaned_text") or {}
    hierarchy = payload.get("hierarchy") or {}
    objects = payload.get("objects") or {}
    enrichments = payload.get("enrichments") or {}
    provenance = payload.get("provenance") or {}
    if not source.get("filename"):
        raise ValueError("Structured artifact source.filename is required")
    if not metadata.get("document_type"):
        raise ValueError("Structured artifact metadata.document_type is required")
    if "full_text" not in cleaned_text:
        raise ValueError("Structured artifact cleaned_text.full_text is required")
    if not isinstance(hierarchy.get("sections"), list):
        raise ValueError("Structured artifact hierarchy.sections must be a list")
    if not isinstance(hierarchy.get("root_sections"), list):
        raise ValueError("Structured artifact hierarchy.root_sections must be a list")
    if not isinstance(objects.get("tables"), list) or not isinstance(objects.get("images"), list):
        raise ValueError("Structured artifact objects.tables and objects.images must be lists")
    if not isinstance(payload.get("blocks"), list):
        raise ValueError("Structured artifact blocks must be a list")
    if "pws" not in enrichments:
        raise ValueError("Structured artifact enrichments.pws is required")
    if not isinstance(provenance.get("source_pages"), list):
        raise ValueError("Structured artifact provenance.source_pages must be a list")
    for section in hierarchy.get("sections") or []:
        if not section.get("section_id"):
            raise ValueError("Each hierarchy section requires section_id")
        if "section_title" not in section:
            raise ValueError("Each hierarchy section requires section_title")
    return payload


def build_structured_document_artifact(
    *,
    filename: str,
    normalized_markdown: str,
    root_sections: list[dict[str, Any]],
    blocks: list[dict[str, Any]],
    heading_anchors: list[dict[str, Any]],
    alignment_decisions: list[dict[str, Any]],
    unplaced_objects: list[dict[str, Any]],
) -> dict[str, Any]:
    document_id = build_document_id(filename, normalized_markdown)
    hierarchy_quality, hierarchy_confidence = hierarchy_quality_for_outline(root_sections)
    serialized_sections = serialize_sections(root_sections)
    serialized_objects = serialize_objects(alignment_decisions)
    source_pages = summarize_provenance_pages(blocks)
    payload = {
        "artifact_type": "structured_document_v1",
        "document_id": document_id,
        "source": {
            "filename": filename,
            "mime_type": None,
            "sha256": None,
        },
        "metadata": {
            "document_type": "pws_sow",
            "document_type_confidence": 0.9 if serialized_sections else 0.55,
            "page_count": max(source_pages) if source_pages else None,
            "ingested_at": utc_timestamp(),
        },
        "cleaned_text": {
            "full_text": normalized_markdown,
            "cleaning_profile": "pws_clean_v2",
        },
        "hierarchy": {
            "quality": hierarchy_quality,
            "confidence": hierarchy_confidence,
            "sections": serialized_sections,
            "root_sections": root_sections,
        },
        "objects": serialized_objects,
        "blocks": serialize_blocks(blocks),
        "enrichments": {
            "pws": {
                "applied": True,
                "confidence": 0.93 if serialized_sections else 0.6,
                "heading_profile": "pws_headings_v2",
                "alignment_profile": "pws_alignment_v1",
                "requirements_detected": any(
                    "requirement" in normalize_text(section.get("section_title") or "").lower()
                    for section in serialized_sections
                ),
                "heading_anchors": heading_anchors,
                "section_alignment_debug": alignment_decisions,
                "unplaced_object_ids": [obj.get("object_id") for obj in unplaced_objects],
            }
        },
        "provenance": {
            "parser": "docling_plus_pws_rules",
            "parser_version": "v1",
            "source_pages": source_pages,
        },
    }
    return validate_structured_document_artifact(payload)
