from __future__ import annotations

from pathlib import Path
from typing import Any

from import_cleaner import extract_docx_hierarchy_text, prepare_outline_markdown
from outline_view import build_generic_outline, build_outline, count_outline_stats


TEXT_SUFFIXES = {".txt", ".md", ".markdown"}


def build_section_index(
    sections: list[dict[str, Any]],
    parent_id: str | None = None,
) -> list[dict[str, Any]]:
    index: list[dict[str, Any]] = []
    for position, section in enumerate(sections, start=1):
        section_id = str(section.get("id") or section.get("section_id") or f"section-{position}")
        children = section.get("children") or []
        entry = {
            "section_id": section_id,
            "section_number": section.get("section_number"),
            "title": section.get("section_title"),
            "level": len(str(section.get("section_number") or "").split(".")),
            "parent_id": parent_id,
            "child_count": len(children),
        }
        index.append(entry)
        index.extend(build_section_index(children, parent_id=section_id))
    return index


def extract_hierarchy_source(
    filename: str,
    content: bytes,
    docling_markdown: str | None = None,
) -> tuple[str, str]:
    suffix = Path(filename).suffix.lower()

    if suffix == ".docx":
        extracted = extract_docx_hierarchy_text(content)
        if extracted and extracted.strip():
            return extracted, "docx_xml"

    if suffix in TEXT_SUFFIXES:
        return content.decode("utf-8", errors="ignore"), "plain_text"

    if docling_markdown and docling_markdown.strip():
        return docling_markdown, "docling_markdown"

    return content.decode("utf-8", errors="ignore"), "binary_fallback"


def build_pws_hierarchy_artifact(
    filename: str,
    content: bytes,
    docling_markdown: str | None = None,
    source_text_override: str | None = None,
    source_kind_override: str | None = None,
) -> dict[str, Any]:
    if source_text_override is not None:
        source_text = source_text_override
        source_kind = source_kind_override or "provided_text"
    else:
        source_text, source_kind = extract_hierarchy_source(filename, content, docling_markdown=docling_markdown)
    cleaned_markdown = prepare_outline_markdown(source_text)
    outline = build_outline(cleaned_markdown or source_text)
    if not outline and source_text.strip():
        outline = build_generic_outline(cleaned_markdown or source_text, Path(filename).stem or "Imported Document")

    return {
        "format": "pws_hierarchy_v1",
        "filename": filename,
        "source_kind": source_kind,
        "source_text": source_text,
        "cleaned_markdown": cleaned_markdown,
        "root_sections": outline,
        "section_index": build_section_index(outline),
        "stats": count_outline_stats(outline),
    }
