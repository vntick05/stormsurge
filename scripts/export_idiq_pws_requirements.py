#!/usr/bin/env python3
import argparse
import csv
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path


POSTGRES_CONTAINER = "perfect-rfp-postgres"
POSTGRES_DB = "gov_rfp"
POSTGRES_USER = "gov_rfp"
SOURCE_DOCUMENT = "Strata Base IDIQ PWS.docx"

HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+(\d+(?:\.\d+)*)\s+(.*\S)\s*$")
TRIGGER_RE = re.compile(r"\b(shall|must|required|requires|is required to)\b", re.IGNORECASE)
TABLE_LINK_RE = re.compile(r"^\[[^\]]+\]\(\.\)\s*$")
HTML_COMMENT_RE = re.compile(r"<!--.*?-->")
TAG_RE = re.compile(r"<[^>]+>")
CLASSIFICATION_RE = re.compile(r"^\((?:U(?:\/\/FOUO)?|C|S|TS(?:\/\/SCI)?)\)\s*")


@dataclass
class Section:
    number: str
    title: str
    body_lines: list[str]


def fetch_normalized_markdown(project_id: str) -> str:
    sql = (
        "select normalized_markdown "
        "from document_normalizations "
        f"where project_id = '{project_id}' and filename = '{SOURCE_DOCUMENT}' "
        "order by updated_at desc limit 1;"
    )
    cmd = [
        "docker",
        "exec",
        POSTGRES_CONTAINER,
        "psql",
        "-U",
        POSTGRES_USER,
        "-d",
        POSTGRES_DB,
        "-At",
        "-c",
        sql,
    ]
    result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return result.stdout


def clean_title(raw_title: str) -> str:
    title = TAG_RE.sub("", raw_title)
    title = title.replace("&amp;", "&").strip()
    title = CLASSIFICATION_RE.sub("", title).strip()
    return title


def remap_section_number(section_number: str) -> str:
    parts = section_number.split(".")
    try:
        top_level = int(parts[0])
    except ValueError:
        return section_number
    if top_level >= 3:
        parts[0] = str(top_level - 2)
    return ".".join(parts)


def clean_line(raw_line: str) -> str:
    line = HTML_COMMENT_RE.sub("", raw_line).strip()
    line = TAG_RE.sub("", line)
    line = line.replace("&amp;", "&")
    line = line.replace("\u00a0", " ")
    return line.strip()


def split_sections(markdown: str) -> list[Section]:
    sections: list[Section] = []
    current: Section | None = None

    for raw_line in markdown.splitlines():
        line = clean_line(raw_line)
        if not line:
            if current is not None:
                current.body_lines.append("")
            continue
        if TABLE_LINK_RE.match(line):
            continue

        heading_match = HEADING_RE.match(line)
        if heading_match:
            number = remap_section_number(heading_match.group(1))
            title = clean_title(heading_match.group(2))
            current = Section(number=number, title=title, body_lines=[])
            sections.append(current)
            continue

        if current is not None:
            current.body_lines.append(line)

    return sections


def normalize_sentence(text: str) -> str:
    text = text.replace("•", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_requirement_sentences(body_lines: list[str]) -> list[tuple[str, str]]:
    text = "\n".join(body_lines)
    text = text.replace("\n\n", "\n")
    candidates: list[str] = []

    for block in re.split(r"\n{2,}", text):
        block = block.strip()
        if not block:
            continue
        if block.startswith("[") and block.endswith("](.)"):
            continue

        split_parts = re.split(r"(?<=[.;)])\s+(?=[A-Z(])", block)
        if len(split_parts) == 1:
            split_parts = [block]
        candidates.extend(split_parts)

    requirements: list[tuple[str, str]] = []
    seen: set[str] = set()
    for candidate in candidates:
        sentence = normalize_sentence(candidate)
        if len(sentence) < 20:
            continue
        trigger_match = TRIGGER_RE.search(sentence)
        if not trigger_match:
            continue
        lowered = sentence.lower()
        if "table of contents" in lowered or "figures" in lowered:
            continue
        if sentence in seen:
            continue
        seen.add(sentence)
        requirements.append((trigger_match.group(1).lower(), sentence))
    return requirements


def hierarchy_columns(section_number: str, section_title: str) -> dict[str, str]:
    parts = section_number.split(".")
    values: dict[str, str] = {
        "level_1_number": "",
        "level_1_title": "",
        "level_2_number": "",
        "level_2_title": "",
        "level_3_number": "",
        "level_3_title": "",
        "section_number": section_number,
        "section_title": section_title,
        "hierarchy_path": section_number,
    }
    if len(parts) >= 1:
        values["level_1_number"] = parts[0]
    if len(parts) >= 2:
        values["level_2_number"] = ".".join(parts[:2])
    if len(parts) >= 3:
        values["level_3_number"] = ".".join(parts[:3])
    return values


def assign_titles(rows: list[dict[str, str]]) -> None:
    title_by_number: dict[str, str] = {}
    for row in rows:
        title_by_number[row["section_number"]] = row["section_title"]
    for row in rows:
        if row["level_1_number"]:
            row["level_1_title"] = title_by_number.get(row["level_1_number"], "")
        if row["level_2_number"]:
            row["level_2_title"] = title_by_number.get(row["level_2_number"], "")
        if row["level_3_number"]:
            row["level_3_title"] = title_by_number.get(row["level_3_number"], "")


def build_rows(project_id: str, markdown: str) -> list[dict[str, str]]:
    sections = split_sections(markdown)
    rows: list[dict[str, str]] = []
    for section in sections:
        if section.number == "1" and "Table of Contents" in section.title:
            continue
        if section.number == "2" and section.title == "Figures":
            continue

        requirements = extract_requirement_sentences(section.body_lines)
        for index, (trigger, sentence) in enumerate(requirements, start=1):
            row = {
                "project_id": project_id,
                "source_document": SOURCE_DOCUMENT,
                "requirement_id": f"{section.number}-{index:03d}",
                "trigger_keyword": trigger,
                "requirement_text": sentence,
            }
            row.update(hierarchy_columns(section.number, section.title))
            rows.append(row)

    assign_titles(rows)
    return rows


def write_csv(rows: list[dict[str, str]], output_path: Path) -> None:
    fieldnames = [
        "project_id",
        "source_document",
        "level_1_number",
        "level_1_title",
        "level_2_number",
        "level_2_title",
        "level_3_number",
        "level_3_title",
        "section_number",
        "section_title",
        "hierarchy_path",
        "requirement_id",
        "trigger_keyword",
        "requirement_text",
    ]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Export IDIQ PWS requirements to CSV.")
    parser.add_argument("project_id")
    parser.add_argument(
        "--output",
        default="/home/admin/perfect-rfp-trt/outputs/idiq_pws_requirements.csv",
    )
    args = parser.parse_args()

    markdown = fetch_normalized_markdown(args.project_id)
    if not markdown.strip():
        raise SystemExit("No normalized markdown found for the IDIQ PWS.")

    rows = build_rows(args.project_id, markdown)
    if not rows:
        raise SystemExit("No requirement-like statements found in the IDIQ PWS.")

    write_csv(rows, Path(args.output))
    print(f"wrote {len(rows)} rows to {args.output}")


if __name__ == "__main__":
    main()
