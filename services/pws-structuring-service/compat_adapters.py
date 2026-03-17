from __future__ import annotations

from typing import Any


def _combined_objects(artifact: dict[str, Any]) -> list[dict[str, Any]]:
    objects = artifact.get("objects") or {}
    combined = [*(objects.get("tables") or []), *(objects.get("images") or [])]
    return sorted(combined, key=lambda item: int(item.get("document_order") or 0))


def _unplaced_objects(artifact: dict[str, Any]) -> list[dict[str, Any]]:
    return [item for item in _combined_objects(artifact) if not item.get("attached_section_id")]


def structured_artifact_to_merged_import_payload(artifact: dict[str, Any]) -> dict[str, Any]:
    source = artifact.get("source") or {}
    hierarchy = artifact.get("hierarchy") or {}
    enrichments = ((artifact.get("enrichments") or {}).get("pws")) or {}
    return {
        "filename": source.get("filename") or "unknown-document",
        "format": "merged_pws_import_v1",
        "document_id": artifact.get("document_id"),
        "root_sections": hierarchy.get("root_sections") or [],
        "sections": hierarchy.get("sections") or [],
        "rich_blocks": artifact.get("blocks") or [],
        "heading_anchors": enrichments.get("heading_anchors") or [],
        "rich_objects": _combined_objects(artifact),
        "alignment_debug": enrichments.get("section_alignment_debug") or [],
        "unplaced_artifacts": _unplaced_objects(artifact),
        "structured_artifact": artifact,
    }
