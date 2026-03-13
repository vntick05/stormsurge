#!/usr/bin/env python3
import json
import re
import sys
import html
from pathlib import Path
from typing import Any


HEADING_PATTERN = re.compile(r"^(?P<hashes>#+)\s+(?P<body>.+)$")
NUMBERED_TITLE_PATTERN = re.compile(r"^(?P<section_number>\d+(?:\.\d+)*)\s+(?P<section_title>.+)$")
BULLET_PATTERN = re.compile(r"^[-*]\s+(?P<body>.+)$")
CLASSIFICATION_PREFIX_PATTERN = re.compile(
    r"^(?:\((?:U|C|S|TS|FOUO|U//FOUO|U/FOUO|S//NF|TS//SI//NF)\)\s*)+",
    re.IGNORECASE,
)
IMAGE_ONLY_PATTERN = re.compile(r"^<!--\s*image\s*-->$", re.IGNORECASE)


def normalize_text(text: str) -> str:
    return " ".join(html.unescape(text).replace("\r", "\n").split())


def clean_display_text(text: str) -> str:
    cleaned = normalize_text(text)
    cleaned = CLASSIFICATION_PREFIX_PATTERN.sub("", cleaned).strip()
    return cleaned


def parse_heading(line: str) -> dict[str, Any] | None:
    match = HEADING_PATTERN.match(line.strip())
    if match is None:
        return None
    body = normalize_text(match.group("body"))
    numbered = NUMBERED_TITLE_PATTERN.match(body)
    if numbered is None:
        return None
    section_number = numbered.group("section_number")
    section_title = numbered.group("section_title")
    return {
        "section_number": section_number,
        "section_title": section_title,
        "depth": len(section_number.split(".")),
        "markdown_level": len(match.group("hashes")),
        "children": [],
    }


def build_outline(markdown: str) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    stack: list[dict[str, Any]] = []
    current_section: dict[str, Any] | None = None
    current_paragraph: dict[str, Any] | None = None
    paragraph_index = 0
    bullet_index = 0
    paragraph_lines: list[str] = []

    def flush_paragraph() -> None:
        nonlocal current_paragraph, paragraph_index, paragraph_lines, bullet_index
        if current_section is None or not paragraph_lines:
            paragraph_lines = []
            return
        paragraph_index += 1
        bullet_index = 0
        current_paragraph = {
            "type": "paragraph",
            "id": f"{current_section['section_number']}.p{paragraph_index}",
            "text_exact": normalize_text(" ".join(paragraph_lines)),
            "children": [],
        }
        current_section["children"].append(current_paragraph)
        paragraph_lines = []

    for raw_line in markdown.splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            flush_paragraph()
            continue
        if IMAGE_ONLY_PATTERN.match(line.strip()):
            continue
        heading = parse_heading(line)
        if heading is not None:
            flush_paragraph()
            current_paragraph = None
            paragraph_index = 0
            bullet_index = 0
            while stack and stack[-1]["depth"] >= heading["depth"]:
                stack.pop()
            heading["parent_section_number"] = stack[-1]["section_number"] if stack else None
            if stack:
                stack[-1]["children"].append(heading)
            else:
                sections.append(heading)
            stack.append(heading)
            current_section = heading
            continue
        bullet = BULLET_PATTERN.match(line.strip())
        if bullet is not None:
            flush_paragraph()
            if current_section is None:
                continue
            bullet_index += 1
            bullet_record = {
                "type": "bullet",
                "id": f"{current_section['section_number']}.p{paragraph_index}.b{bullet_index}",
                "text_exact": normalize_text(bullet.group("body")),
            }
            if current_paragraph is None:
                current_paragraph = {
                    "type": "paragraph",
                    "id": f"{current_section['section_number']}.p{max(paragraph_index, 1)}",
                    "text_exact": "",
                    "children": [],
                }
                if not current_section["children"] or current_section["children"][-1] is not current_paragraph:
                    current_section["children"].append(current_paragraph)
            current_paragraph["children"].append(bullet_record)
            continue
        paragraph_lines.append(line.strip())

    flush_paragraph()
    return sections


def render_text(nodes: list[dict[str, Any]], indent: int = 0) -> list[str]:
    lines: list[str] = []
    prefix = "  " * indent
    for node in nodes:
        if node.get("type") == "paragraph":
            lines.append(f"{prefix}{node['id']}: {node['text_exact']}".rstrip())
            lines.extend(render_text(node.get("children", []), indent + 1))
            continue
        if node.get("type") == "bullet":
            lines.append(f"{prefix}{node['id']}: {node['text_exact']}")
            continue
        lines.append(f"{prefix}{node['section_number']} {node['section_title']}")
        lines.extend(render_text(node.get("children", []), indent + 1))
    return lines


def render_clean_text(nodes: list[dict[str, Any]], indent: int = 0) -> list[str]:
    lines: list[str] = []
    prefix = "  " * indent
    for node in nodes:
        if node.get("type") == "paragraph":
            text = clean_display_text(node["text_exact"])
            if text:
                lines.append(f"{prefix}{node['id']}: {text}".rstrip())
            lines.extend(render_clean_text(node.get("children", []), indent + 1))
            continue
        if node.get("type") == "bullet":
            text = clean_display_text(node["text_exact"])
            if text:
                lines.append(f"{prefix}{node['id']}: {text}")
            continue
        title = clean_display_text(node["section_title"])
        lines.append(f"{prefix}{node['section_number']} {title}".rstrip())
        lines.extend(render_clean_text(node.get("children", []), indent + 1))
    return lines


def render_direct_clean_text(nodes: list[dict[str, Any]], indent: int = 0) -> list[str]:
    lines: list[str] = []
    prefix = "  " * indent
    for node in nodes:
        if node.get("type") == "paragraph":
            text = clean_display_text(node["text_exact"])
            if text:
                lines.append(f"{prefix}{node['id']}: {text}".rstrip())
            for child in node.get("children", []):
                if child.get("type") != "bullet":
                    continue
                bullet_text = clean_display_text(child["text_exact"])
                if bullet_text:
                    lines.append(f"{prefix}  {child['id']}: {bullet_text}")
    return lines


def iter_sections(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    for node in nodes:
        if "section_number" not in node:
            continue
        sections.append(node)
        child_sections = [item for item in node.get("children", []) if "section_number" in item]
        sections.extend(iter_sections(child_sections))
    return sections


def find_section(nodes: list[dict[str, Any]], section_number: str) -> dict[str, Any] | None:
    for node in nodes:
        if node.get("section_number") == section_number:
            return node
        child = find_section([item for item in node.get("children", []) if "section_number" in item], section_number)
        if child is not None:
            return child
    return None


def main() -> int:
    if len(sys.argv) != 6:
        print(
            "usage: render_simple_pws_outline.py <demo-pws-extract.json> <output-json> <output-txt> <clean-output-txt> <sections-dir>",
            file=sys.stderr,
        )
        return 2
    source_path = Path(sys.argv[1]).resolve()
    output_json_path = Path(sys.argv[2]).resolve()
    output_txt_path = Path(sys.argv[3]).resolve()
    clean_output_txt_path = Path(sys.argv[4]).resolve()
    sections_dir = Path(sys.argv[5]).resolve()

    payload = json.loads(source_path.read_text())
    markdown = payload.get("normalized_markdown", "")
    outline = build_outline(markdown)
    section_3_1 = find_section(outline, "3.1")
    output = {
        "source_file": str(source_path),
        "format": "simple_pws_outline_v1",
        "root_sections": outline,
        "focus_section_3_1": section_3_1,
    }
    output_json_path.write_text(json.dumps(output, indent=2))

    lines = ["Simple PWS Outline", ""]
    lines.append("Full Outline")
    lines.append("")
    lines.extend(render_text(outline))
    lines.append("")
    lines.append("Focus: 3.1")
    lines.append("")
    if section_3_1 is not None:
        lines.extend(render_text([section_3_1]))
    output_txt_path.write_text("\n".join(lines))

    clean_lines = ["Simple PWS Outline Clean", ""]
    clean_lines.append("Full Outline")
    clean_lines.append("")
    clean_lines.extend(render_clean_text(outline))
    clean_lines.append("")
    clean_lines.append("Focus: 3.1")
    clean_lines.append("")
    if section_3_1 is not None:
        clean_lines.extend(render_clean_text([section_3_1]))
    clean_output_txt_path.write_text("\n".join(clean_lines))

    sections_dir.mkdir(parents=True, exist_ok=True)
    for section in iter_sections(outline):
        section_lines = [f"{section['section_number']} {clean_display_text(section['section_title'])}", ""]
        section_lines.extend(render_direct_clean_text(section.get("children", []), 1))
        (sections_dir / f"{section['section_number']}.txt").write_text("\n".join(section_lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
