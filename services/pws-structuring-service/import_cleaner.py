from __future__ import annotations

import re


CLASSIFICATION_BANNER_RE = re.compile(r"^\s*\(?Unclassified//FOUO\)?\s*$", re.IGNORECASE)
FIGURE_CLASSIFICATION_RE = re.compile(r"^\s*\(?Figure is UNCLASSIFIED(?:\/\/FOUO)?\)?\s*$", re.IGNORECASE)
REMOVED_FOR_CLASSIFICATION_RE = re.compile(r"\bRemoved for classification\b", re.IGNORECASE)
IMAGE_MARKER_RE = re.compile(r"\[image:\s*\]")
TOC_DOT_LEADER_RE = re.compile(r"\.{4,}\s*[A-Z]?\-?\d+\s*$")
TOC_HEADING_RE = re.compile(r"^\s*(?:\(U\)\s*)?Table of (Contents|Figures|Tables)\s*$", re.IGNORECASE)
APPENDIX_HEADING_RE = re.compile(
    r"^(Appendix\s+[A-Z])\s+\(U\)\s+(.+?)(?:\s+\d+)?$",
    re.IGNORECASE,
)
SECTION_HEADING_RE = re.compile(
    r"^(?P<number>\d+(?:\.\d+)*)\s+\(U\)\s+(?P<title>.+?)\s*$",
    re.IGNORECASE,
)
PLAIN_SECTION_HEADING_RE = re.compile(r"^(?P<number>\d+(?:\.\d+)*)\s+(?P<title>[A-Z][^\n]{0,420})$")
CLASSIFICATION_PREFIX_RE = re.compile(r"^\s*\((?:U|C|S|TS|FOUO|U//FOUO|U/FOUO)\)\s*", re.IGNORECASE)
CLASSIFICATION_INLINE_RE = re.compile(r"\(\s*(?:U|C|S|TS|FOUO|U//FOUO|U/FOUO)\s*\)", re.IGNORECASE)
LINE_ONLY_NUMBER_RE = re.compile(r"^\s*\d{1,4}\s*$")
LINE_NUMBER_PREFIX_RE = re.compile(r"^\s*\d{3,4}\s+(?=\S)")
BROKEN_WRAP_RE = re.compile(r"(?<=[a-z])\n(?=[A-Z][a-z])")
SUB_BULLET_RE = re.compile(r"^\s*[o]\s+")
INLINE_O_BULLET_RE = re.compile(r"\s+o\s+(?=[A-Z])")
CONTINUATION_LINE_RE = re.compile(r"^[A-Z][A-Za-z0-9(]")
PARAGRAPHISH_END_RE = re.compile(r"[A-Za-z0-9),]$")
NON_HEADING_PREFIX_RE = re.compile(r"^(?:Figure|Table)\b", re.IGNORECASE)


def clean_line(raw_line: str) -> str:
    line = raw_line.replace("\r", "").strip()
    if not line:
        return ""
    if LINE_ONLY_NUMBER_RE.match(line):
        return ""
    line = LINE_NUMBER_PREFIX_RE.sub("", line).strip()
    if CLASSIFICATION_BANNER_RE.match(line):
        return ""
    if FIGURE_CLASSIFICATION_RE.match(line):
        return ""
    line = IMAGE_MARKER_RE.sub(" ", line)
    line = CLASSIFICATION_INLINE_RE.sub("", line)
    line = REMOVED_FOR_CLASSIFICATION_RE.sub("", line)
    line = re.sub(r"Figure is UNCLASSIFIED(?:\/\/FOUO)?\s*", "", line, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", line).strip()


def drop_front_matter(lines: list[str]) -> list[str]:
    for index, line in enumerate(lines):
        if TOC_DOT_LEADER_RE.search(line):
            continue
        if SECTION_HEADING_RE.match(line) or PLAIN_SECTION_HEADING_RE.match(line):
            if line.startswith("1 ") or line.startswith("1.1 "):
                return lines[index:]
    return lines


def drop_tables_of_contents(lines: list[str]) -> list[str]:
    kept: list[str] = []
    skipping = False
    for line in lines:
        if TOC_HEADING_RE.match(line):
            skipping = True
            continue
        if skipping:
            if TOC_DOT_LEADER_RE.search(line):
                continue
            if (SECTION_HEADING_RE.match(line) or PLAIN_SECTION_HEADING_RE.match(line)) and line.startswith("1 "):
                skipping = False
                kept.append(line)
                continue
            if APPENDIX_HEADING_RE.match(line):
                continue
            if "Removed for Classification" in line or not line:
                continue
        else:
            kept.append(line)
    return kept


def heading_to_markdown(line: str) -> str | None:
    appendix = APPENDIX_HEADING_RE.match(line)
    if appendix:
        label = appendix.group(1).upper().replace("APPENDIX", "Appendix")
        title = CLASSIFICATION_PREFIX_RE.sub("", appendix.group(2)).strip()
        return f"# {label} {title}".strip()

    match = SECTION_HEADING_RE.match(line) or PLAIN_SECTION_HEADING_RE.match(line)
    if not match:
        return None

    number = match.group("number")
    title = CLASSIFICATION_PREFIX_RE.sub("", match.group("title")).strip()
    if NON_HEADING_PREFIX_RE.match(title) or title.lower().startswith("table is unclassified"):
        return None
    depth = min(number.count(".") + 1, 6)
    return f"{'#' * depth} {number} {title}".strip()


def normalize_bullet(line: str) -> str:
    stripped = CLASSIFICATION_PREFIX_RE.sub("", line).strip()
    stripped = CLASSIFICATION_INLINE_RE.sub("", stripped).strip()
    if stripped.startswith("· "):
        return f"- {stripped[2:].strip()}"
    if stripped.startswith("• "):
        return f"- {stripped[2:].strip()}"
    if SUB_BULLET_RE.match(stripped):
        return f"  - {SUB_BULLET_RE.sub('', stripped).strip()}"
    return stripped


def expand_inline_o_bullets(line: str) -> list[str]:
    parts = INLINE_O_BULLET_RE.split(line)
    if len(parts) == 1:
        return [line]
    first = parts[0].strip()
    expanded: list[str] = [first] if first else []
    for part in parts[1:]:
        item = part.strip()
        if item:
            expanded.append(f"  - {item}")
    return expanded


def merge_wrapped_lines(lines: list[str]) -> list[str]:
    merged: list[str] = []
    for line in lines:
        if not line:
            if merged and merged[-1] != "":
                merged.append("")
            continue
        if not merged or merged[-1] == "":
            merged.append(line)
            continue
        previous = merged[-1]
        if previous.startswith(("#", "- ", "  - ")) and CONTINUATION_LINE_RE.match(line) and len(previous) >= 80:
            merged[-1] = f"{previous} {line}".strip()
            continue
        if (
            not previous.startswith(("- ", "  - "))
            and PARAGRAPHISH_END_RE.search(previous)
            and CONTINUATION_LINE_RE.match(line)
            and not line.startswith(("#", "- ", "  - "))
        ):
            merged[-1] = f"{previous} {line}".strip()
            continue
        merged.append(line)
    while merged and merged[-1] == "":
        merged.pop()
    return merged


def transform_lines(lines: list[str]) -> list[str]:
    output: list[str] = []
    previous_blank = True

    for line in lines:
        if not line:
            if not previous_blank:
                output.append("")
            previous_blank = True
            continue

        if "Removed for Classification" in line or line.lower() == "table is unclassified":
            continue

        markdown_heading = heading_to_markdown(line)
        if markdown_heading is not None:
            if output and output[-1] != "":
                output.append("")
            output.append(markdown_heading)
            output.append("")
            previous_blank = True
            continue

        if TOC_DOT_LEADER_RE.search(line):
            continue

        normalized = normalize_bullet(line)
        normalized = CLASSIFICATION_PREFIX_RE.sub("", normalized).strip()
        normalized = CLASSIFICATION_INLINE_RE.sub("", normalized).strip()
        normalized = re.sub(r"\s+", " ", normalized).strip()
        if not normalized:
            continue
        for expanded in expand_inline_o_bullets(normalized):
            expanded = re.sub(r"\s+", " ", expanded).strip()
            if not expanded:
                continue
            output.append(expanded)
            previous_blank = False

    return merge_wrapped_lines(output)


def prepare_outline_markdown(text: str) -> str:
    normalized_text = BROKEN_WRAP_RE.sub(" ", text or "")
    cleaned_lines = [clean_line(line) for line in normalized_text.splitlines()]
    cleaned_lines = drop_tables_of_contents(cleaned_lines)
    cleaned_lines = drop_front_matter(cleaned_lines)
    final_lines = transform_lines(cleaned_lines)
    if not final_lines:
        return ""
    return "\n".join(final_lines) + "\n"
