from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from io import BytesIO
from zipfile import BadZipFile, ZipFile


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
NUMBER_PREFIX_RE = re.compile(r"^(?P<number>\d+(?:\.\d+)*)\s+")
CLASSIFICATION_PREFIX_RE = re.compile(r"^\s*\((?:U|C|S|TS|FOUO|U//FOUO|U/FOUO)\)\s*", re.IGNORECASE)
CLASSIFICATION_INLINE_RE = re.compile(r"\(\s*(?:U|C|S|TS|FOUO|U//FOUO|U/FOUO)\s*\)", re.IGNORECASE)
LINE_ONLY_NUMBER_RE = re.compile(r"^\s*\d{1,4}\s*$")
LINE_NUMBER_PREFIX_RE = re.compile(r"^\s*\d{3,4}\s+(?=\S)")
BROKEN_WRAP_RE = re.compile(r"(?<=[a-z])\n(?=[A-Z][a-z])")
SUB_BULLET_RE = re.compile(r"^\s*[o]\s+")
INDENTED_BULLET_RE = re.compile(r"^(?P<indent>\s+)[-*]\s+(?P<body>.+)$")
TOP_LEVEL_BULLET_RE = re.compile(r"^[-*]\s+(?P<body>.+)$")
INLINE_O_BULLET_RE = re.compile(r"\s+o\s+(?=[A-Z])")
CONTINUATION_LINE_RE = re.compile(r"^[A-Z][A-Za-z0-9(]")
PARAGRAPHISH_END_RE = re.compile(r"[A-Za-z0-9),]$")
NON_HEADING_PREFIX_RE = re.compile(r"^(?:Figure|Table)\b", re.IGNORECASE)
CONTRACTOR_SHALL_RE = re.compile(r"^The Contractor Shall:?$", re.IGNORECASE)
WORD_ARTIFACT_FRAGMENT_RE = re.compile(
    r"(?:Error!\s*Reference source not found\.?|"
    r"Error!\s*Bookmark not defined\.?|"
    r"Error!\s*No table of contents entries found\.?)",
    re.IGNORECASE,
)
TRAILING_PAGE_DIGITS_RE = re.compile(r"^(?P<title>.*?)(?P<page>\d{1,3})$")
APPENDICES_LINE_RE = re.compile(r"^Appendices\b", re.IGNORECASE)
GENERIC_REQUIREMENTS_TITLE_RE = re.compile(r"^The following requirements apply\b", re.IGNORECASE)


def _is_probable_heading_line(line: str) -> bool:
    return bool(APPENDIX_HEADING_RE.match(line) or SECTION_HEADING_RE.match(line) or PLAIN_SECTION_HEADING_RE.match(line))


def clean_line(raw_line: str) -> str:
    source = raw_line.replace("\r", "").rstrip()
    if not source.strip():
        return ""
    if LINE_ONLY_NUMBER_RE.match(source):
        return ""
    line = LINE_NUMBER_PREFIX_RE.sub("", source).rstrip()
    leading = len(line) - len(line.lstrip(" "))
    core = line.lstrip(" ")
    if not core:
        return ""
    if LINE_ONLY_NUMBER_RE.match(core):
        return ""
    line = core
    if CLASSIFICATION_BANNER_RE.match(line):
        return ""
    if FIGURE_CLASSIFICATION_RE.match(line):
        return ""
    if APPENDICES_LINE_RE.match(line):
        return ""
    line = IMAGE_MARKER_RE.sub(" ", line)
    line = CLASSIFICATION_INLINE_RE.sub("", line)
    line = REMOVED_FOR_CLASSIFICATION_RE.sub("", line)
    line = WORD_ARTIFACT_FRAGMENT_RE.sub(" ", line)
    line = re.sub(r"Figure is UNCLASSIFIED(?:\/\/FOUO)?\s*", "", line, flags=re.IGNORECASE)
    normalized = re.sub(r"\s+", " ", line).strip()
    if not normalized:
        return ""
    if leading and TOP_LEVEL_BULLET_RE.match(normalized):
        return f"{' ' * leading}{normalized}"
    return normalized


def strip_trailing_page_digits(title: str) -> str:
    stripped = str(title or "").strip()
    match = TRAILING_PAGE_DIGITS_RE.match(stripped)
    if match and any(char.isalpha() for char in match.group("title")):
        return match.group("title").strip()
    return stripped


def extract_heading_map(lines: list[str]) -> list[tuple[str, str]]:
    heading_map: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for line in lines:
        match = SECTION_HEADING_RE.match(line) or PLAIN_SECTION_HEADING_RE.match(line)
        if not match:
            continue
        number = match.group("number")
        title = strip_trailing_page_digits(CLASSIFICATION_PREFIX_RE.sub("", match.group("title")).strip())
        if not title:
            continue
        item = (title, number)
        if item in seen:
            continue
        seen.add(item)
        heading_map.append(item)

    heading_map.sort(key=lambda item: len(item[0]), reverse=True)
    return heading_map


def has_nearby_body_text(lines: list[str], start_index: int, window: int = 8) -> bool:
    for offset in range(1, window + 1):
        index = start_index + offset
        if index >= len(lines):
            break
        line = lines[index]
        if not line:
            continue
        if APPENDICES_LINE_RE.match(line):
            continue
        if heading_to_markdown(line):
            continue
        if normalize_bullet(line).startswith(("- ", "  - ")):
            return True
        return True
    return False


def drop_front_matter(lines: list[str], heading_map: list[tuple[str, str]] | None = None) -> list[str]:
    heading_map = heading_map or []
    for index, line in enumerate(lines):
        if TOC_DOT_LEADER_RE.search(line):
            continue
        if SECTION_HEADING_RE.match(line) or PLAIN_SECTION_HEADING_RE.match(line):
            if (line.startswith("1 ") or line.startswith("1.1 ")) and has_nearby_body_text(lines, index):
                return lines[index:]
    for index, line in enumerate(lines):
        for title, number in heading_map:
            if "." in number:
                continue
            if line == title and has_nearby_body_text(lines, index):
                return lines[index:]
    for index, line in enumerate(lines):
        if find_inline_heading_match(line, heading_map) is not None:
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
            if (SECTION_HEADING_RE.match(line) or PLAIN_SECTION_HEADING_RE.match(line)) and (
                line.startswith("1 ") or line.startswith("1.1 ")
            ):
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
    if match is None:
        prefix_match = NUMBER_PREFIX_RE.match(line)
        if prefix_match:
            number = prefix_match.group("number")
            remainder = line[prefix_match.end() :].strip()
            if remainder:
                depth = min(number.count(".") + 1, 6)
                return f"{'#' * depth} {number} {strip_trailing_page_digits(CLASSIFICATION_PREFIX_RE.sub('', remainder).strip())}".strip()
    if not match:
        return None

    number = match.group("number")
    title = strip_trailing_page_digits(CLASSIFICATION_PREFIX_RE.sub("", match.group("title")).strip())
    if NON_HEADING_PREFIX_RE.match(title) or title.lower().startswith("table is unclassified"):
        return None
    depth = min(number.count(".") + 1, 6)
    return f"{'#' * depth} {number} {title}".strip()


def normalize_bullet(line: str) -> str:
    indented_match = INDENTED_BULLET_RE.match(line)
    if indented_match:
        body = CLASSIFICATION_PREFIX_RE.sub("", indented_match.group("body")).strip()
        body = CLASSIFICATION_INLINE_RE.sub("", body).strip()
        return f"{indented_match.group('indent')}- {body}".rstrip()

    stripped = CLASSIFICATION_PREFIX_RE.sub("", line).strip()
    stripped = CLASSIFICATION_INLINE_RE.sub("", stripped).strip()
    if stripped.startswith("· "):
        return f"- {stripped[2:].strip()}"
    if stripped.startswith("• "):
        return f"- {stripped[2:].strip()}"
    if SUB_BULLET_RE.match(stripped):
        return f"  - {SUB_BULLET_RE.sub('', stripped).strip()}"
    return stripped


def find_inline_heading_match(line: str, heading_map: list[tuple[str, str]]) -> tuple[int, str, str] | None:
    for title, number in heading_map:
        match = re.search(rf"(?<![A-Za-z0-9]){re.escape(title)}\s+", line)
        if match is not None and match.start() <= 24:
            return match.start(), title, number
    if line.count("Appendix ") >= 2:
        for title, number in heading_map:
            if "." in number:
                continue
            match = re.search(rf"(?<![A-Za-z0-9]){re.escape(title)}\s+", line)
            if match is not None:
                return match.start(), title, number
    return None


def infer_missing_parent_headings(lines: list[str]) -> list[str]:
    output: list[str] = []
    index = 0

    while index < len(lines):
        line = lines[index]
        next_line = lines[index + 1] if index + 1 < len(lines) else ""
        candidate_heading_line = next_line
        skip_count = 0
        if CONTRACTOR_SHALL_RE.match(next_line):
            candidate_heading_line = lines[index + 2] if index + 2 < len(lines) else ""
            skip_count = 1
        next_heading_match = SECTION_HEADING_RE.match(candidate_heading_line) or PLAIN_SECTION_HEADING_RE.match(candidate_heading_line) or NUMBER_PREFIX_RE.match(candidate_heading_line)

        if (
            line
            and not heading_to_markdown(line)
            and not normalize_bullet(line).startswith(("- ", "  - "))
            and next_heading_match
            and (skip_count == 1 or CONTRACTOR_SHALL_RE.match(next_line))
        ):
            next_number = next_heading_match.group("number")
            parts = next_number.split(".")
            if len(parts) >= 3:
                synthesized_number = ".".join(parts[:-1])
                seen_same_number = False
                for previous_line in reversed(output[-12:]):
                    previous_heading_match = SECTION_HEADING_RE.match(previous_line) or PLAIN_SECTION_HEADING_RE.match(previous_line) or NUMBER_PREFIX_RE.match(previous_line)
                    previous_number = previous_heading_match.group("number") if previous_heading_match else ""
                    if synthesized_number == previous_number:
                        seen_same_number = True
                        break
                if not seen_same_number:
                    output.append(f"{synthesized_number} {line}")
                else:
                    output.append(line)
                index += 1 + skip_count
                continue

        output.append(line)
        index += 1

    return output


def synthesize_title_parents_from_child_headings(lines: list[str]) -> list[str]:
    output: list[str] = []
    index = 0

    while index < len(lines):
        line = lines[index]
        next_index = index + 1
        while next_index < len(lines) and not lines[next_index]:
            next_index += 1
        next_line = lines[next_index] if next_index < len(lines) else ""
        following_index = next_index + 1
        while following_index < len(lines) and not lines[following_index]:
            following_index += 1
        following_line = lines[following_index] if following_index < len(lines) else ""

        if (
            line
            and not heading_to_markdown(line)
            and not normalize_bullet(line).startswith(("- ", "  - "))
            and len(line.split()) <= 6
            and CONTRACTOR_SHALL_RE.match(next_line)
        ):
            next_heading_match = SECTION_HEADING_RE.match(following_line) or PLAIN_SECTION_HEADING_RE.match(following_line) or NUMBER_PREFIX_RE.match(following_line)
            if next_heading_match:
                parts = next_heading_match.group("number").split(".")
                if len(parts) >= 3:
                    title_line = line
                    if GENERIC_REQUIREMENTS_TITLE_RE.match(line):
                        for previous in reversed(output[-6:]):
                            previous_text = str(previous or "").strip()
                            if not previous_text or heading_to_markdown(previous_text) or normalize_bullet(previous_text).startswith(("- ", "  - ")):
                                continue
                            if len(previous_text.split()) <= 6:
                                title_line = previous_text
                                break
                    output.append(f"{'.'.join(parts[:-1])} {title_line}")
                    index = next_index + 1
                    continue

        output.append(line)
        index += 1

    return output


def promote_embedded_section_titles(lines: list[str]) -> list[str]:
    output: list[str] = []
    index = 0

    while index < len(lines):
        line = lines[index]
        next_index = index + 1
        while next_index < len(lines) and not lines[next_index]:
            next_index += 1
        next_line = lines[next_index] if next_index < len(lines) else ""

        # Promote only the nearest short title immediately preceding a generic
        # "The following requirements apply..." block.
        if line and GENERIC_REQUIREMENTS_TITLE_RE.match(line):
            following_index = next_index
            while following_index < len(lines) and not lines[following_index]:
                following_index += 1
            following_line = lines[following_index] if following_index < len(lines) else ""
            child_index = following_index + 1
            while child_index < len(lines) and not lines[child_index]:
                child_index += 1
            child_line = lines[child_index] if child_index < len(lines) else ""
            child_match = SECTION_HEADING_RE.match(child_line) or PLAIN_SECTION_HEADING_RE.match(child_line) or NUMBER_PREFIX_RE.match(child_line)
            if CONTRACTOR_SHALL_RE.match(following_line) and child_match:
                title_candidate = None
                title_candidate_index = None
                for offset, previous in enumerate(reversed(output[-6:])):
                    previous_text = str(previous or "").strip()
                    if not previous_text:
                        continue
                    if heading_to_markdown(previous_text) or normalize_bullet(previous_text).startswith(("- ", "  - ")):
                        break
                    if len(previous_text.split()) <= 6:
                        title_candidate = previous_text
                        title_candidate_index = len(output) - 1 - offset
                        break
                if title_candidate:
                    parts = child_match.group("number").split(".")
                    if len(parts) >= 3:
                        synthesized = f"{'.'.join(parts[:-1])} {title_candidate}"
                        if title_candidate_index is not None:
                            output[title_candidate_index] = synthesized
                        else:
                            output.append(synthesized)
                        index += 1
                        continue

        output.append(line)
        index += 1

    return output


def split_inline_heading_bodies(lines: list[str], heading_map: list[tuple[str, str]]) -> list[str]:
    if not heading_map:
        return lines

    output: list[str] = []
    for line in lines:
        replaced = False
        if heading_to_markdown(line) or normalize_bullet(line).startswith(("- ", "  - ")):
            output.append(line)
            continue
        inline_match = find_inline_heading_match(line, heading_map)
        if inline_match is not None:
            start_index, title, number = inline_match
            remainder = line[start_index + len(title) :].strip()
            output.append(f"{number} {title}")
            if remainder:
                output.append(remainder)
            replaced = True
        if not replaced:
            output.append(line)
    return output


def synthesize_standalone_headings(lines: list[str], heading_map: list[tuple[str, str]]) -> list[str]:
    if not heading_map:
        return lines

    by_title = {title: number for title, number in heading_map}
    output: list[str] = []

    for index, line in enumerate(lines):
        number = by_title.get(line)
        next_line = lines[index + 1] if index + 1 < len(lines) else ""
        following_line = lines[index + 2] if index + 2 < len(lines) else ""
        previous_non_empty = ""
        for previous in reversed(output):
            if previous:
                previous_non_empty = previous
                break
        if (
            not number
            and line
            and CONTRACTOR_SHALL_RE.match(next_line)
        ):
            next_heading_match = SECTION_HEADING_RE.match(following_line) or PLAIN_SECTION_HEADING_RE.match(following_line)
            if next_heading_match:
                parts = next_heading_match.group("number").split(".")
                if len(parts) >= 3:
                    number = ".".join(parts[:-1])
        if (
            number
            and not heading_to_markdown(line)
            and next_line
            and (
                (CONTRACTOR_SHALL_RE.match(next_line) and following_line)
                or (not heading_to_markdown(next_line) and not normalize_bullet(next_line).startswith(("- ", "  - ")))
            )
            and previous_non_empty != f"{number} {line}"
        ):
            output.append(f"{number} {line}")
            continue
        output.append(line)

    return output


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
        if previous.startswith("#") and CONTINUATION_LINE_RE.match(line) and len(previous) >= 80:
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
        if CONTRACTOR_SHALL_RE.match(line):
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
        indent = len(normalized) - len(normalized.lstrip(" "))
        normalized = CLASSIFICATION_PREFIX_RE.sub("", normalized.lstrip(" "))
        normalized = CLASSIFICATION_INLINE_RE.sub("", normalized).strip()
        normalized = re.sub(r"\s+", " ", normalized).strip()
        if not normalized:
            continue
        if indent and TOP_LEVEL_BULLET_RE.match(normalized):
            normalized = f"{' ' * indent}{normalized}"
        for expanded in expand_inline_o_bullets(normalized):
            expanded_indent = len(expanded) - len(expanded.lstrip(" "))
            expanded = re.sub(r"\s+", " ", expanded).strip()
            if expanded_indent and TOP_LEVEL_BULLET_RE.match(expanded):
                expanded = f"{' ' * expanded_indent}{expanded}"
            if not expanded:
                continue
            output.append(expanded)
            previous_blank = False

    return merge_wrapped_lines(output)


def drop_markdown_front_matter(lines: list[str]) -> list[str]:
    for index, line in enumerate(lines):
        stripped = line.strip()
        if re.match(r"^#+\s+1(?:\.0+)?\s+", stripped):
            return lines[index:]
        if re.match(r"^#+\s+1\.1\s+", stripped):
            return lines[index:]
    return lines


def has_strong_explicit_hierarchy(lines: list[str], window: int = 120) -> bool:
    explicit_heading_count = 0
    top_level_heading_count = 0

    for line in lines[:window]:
        match = SECTION_HEADING_RE.match(line) or PLAIN_SECTION_HEADING_RE.match(line)
        if not match:
            continue
        explicit_heading_count += 1
        if "." not in match.group("number"):
            top_level_heading_count += 1

    return top_level_heading_count >= 2 or explicit_heading_count >= 4


def prepare_outline_markdown(text: str) -> str:
    normalized_text = text or ""
    cleaned_lines = [clean_line(line) for line in normalized_text.splitlines()]
    heading_map = extract_heading_map(cleaned_lines)
    cleaned_lines = drop_tables_of_contents(cleaned_lines)
    cleaned_lines = drop_front_matter(cleaned_lines, heading_map=heading_map)
    cleaned_lines = promote_embedded_section_titles(cleaned_lines)
    if not has_strong_explicit_hierarchy(cleaned_lines):
        cleaned_lines = synthesize_standalone_headings(cleaned_lines, heading_map)
        cleaned_lines = split_inline_heading_bodies(cleaned_lines, heading_map)
    cleaned_lines = synthesize_title_parents_from_child_headings(cleaned_lines)
    cleaned_lines = infer_missing_parent_headings(cleaned_lines)
    cleaned_lines = synthesize_title_parents_from_child_headings(cleaned_lines)
    final_lines = transform_lines(cleaned_lines)
    final_lines = drop_markdown_front_matter(final_lines)
    if not final_lines:
        return ""
    return "\n".join(final_lines) + "\n"


def extract_docx_hierarchy_text(content: bytes) -> str | None:
    try:
        with ZipFile(BytesIO(content)) as archive:
            xml_bytes = archive.read("word/document.xml")
    except (BadZipFile, KeyError):
        return None

    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    root = ET.fromstring(xml_bytes)
    lines: list[str] = []

    for paragraph in root.findall(".//w:p", namespace):
        paragraph_properties = paragraph.find("./w:pPr", namespace)
        numbering = paragraph.find("./w:pPr/w:numPr", namespace)
        level_value = 0
        if numbering is not None:
            level = numbering.find("./w:ilvl", namespace)
            if level is not None:
                try:
                    level_value = int(level.attrib.get(f"{{{namespace['w']}}}val", "0"))
                except ValueError:
                    level_value = 0
        fragments: list[str] = []
        for text_node in paragraph.findall(".//w:t", namespace):
            if text_node.text:
                fragments.append(text_node.text)
        line = "".join(fragments).strip()
        if line:
            if numbering is not None and not _is_probable_heading_line(line):
                indent = "  " * max(level_value, 0)
                line = f"{indent}- {line}"
            lines.append(line)

    if not lines:
        return None
    return "\n".join(lines)
