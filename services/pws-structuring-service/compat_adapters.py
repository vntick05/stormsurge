from __future__ import annotations

from pathlib import Path
from typing import Any

from import_cleaner import prepare_outline_markdown
from outline_view import build_generic_outline, build_outline
from rich_import import flatten_outline_sections, make_section_id


def _combined_objects(artifact: dict[str, Any]) -> list[dict[str, Any]]:
    objects = artifact.get("objects") or {}
    combined = [*(objects.get("tables") or []), *(objects.get("images") or [])]
    return sorted(combined, key=lambda item: int(item.get("document_order") or 0))


def _unplaced_objects(artifact: dict[str, Any]) -> list[dict[str, Any]]:
    return [item for item in _combined_objects(artifact) if not item.get("attached_section_id")]


def _rebuilt_outline_hierarchy(artifact: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    source = artifact.get("source") or {}
    filename = source.get("filename") or "Imported Document"
    metadata = artifact.get("metadata") or {}
    cleaned_text = (artifact.get("cleaned_text") or {}).get("full_text") or ""
    if metadata.get("document_type") != "pws_sow" or not cleaned_text.strip():
        hierarchy = artifact.get("hierarchy") or {}
        return hierarchy.get("root_sections") or [], hierarchy.get("sections") or []

    prepared_markdown = prepare_outline_markdown(cleaned_text)
    outline = build_outline(prepared_markdown or cleaned_text)
    if not outline and cleaned_text.strip():
        outline = build_generic_outline(prepared_markdown or cleaned_text, Path(filename).stem or "Imported Document")
    if not outline:
        hierarchy = artifact.get("hierarchy") or {}
        return hierarchy.get("root_sections") or [], hierarchy.get("sections") or []

    sections = flatten_outline_sections(outline)
    for section in sections:
        section["section_id"] = make_section_id(section.get("section_number"), section.get("section_title"))
    return outline, sections


def structured_artifact_to_merged_import_payload(artifact: dict[str, Any]) -> dict[str, Any]:
    source = artifact.get("source") or {}
    root_sections, sections = _rebuilt_outline_hierarchy(artifact)
    enrichments = ((artifact.get("enrichments") or {}).get("pws")) or {}
    return {
        "filename": source.get("filename") or "unknown-document",
        "format": "merged_pws_import_v1",
        "document_id": artifact.get("document_id"),
        "root_sections": root_sections,
        "sections": sections,
        "rich_blocks": artifact.get("blocks") or [],
        "heading_anchors": enrichments.get("heading_anchors") or [],
        "rich_objects": _combined_objects(artifact),
        "alignment_debug": enrichments.get("section_alignment_debug") or [],
        "unplaced_artifacts": _unplaced_objects(artifact),
        "structured_artifact": artifact,
    }
