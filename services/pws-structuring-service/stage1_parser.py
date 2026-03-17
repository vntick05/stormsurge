import json
import re
from typing import Any


MULTISPACE_PATTERN = re.compile(r"[ \t]{2,}")
DOC_REF_PATTERN = re.compile(r"^#/([a-z_]+)/(\d+)$")
CLASSIFICATION_PREFIX_PATTERN = re.compile(
    r"^(?:\((?:U|C|S|TS|FOUO|U//FOUO|U/FOUO|S//NF|TS//SI//NF)\)\s*)+",
    re.IGNORECASE,
)
NUMBERED_HEADING_PATTERN = re.compile(
    r"^(?P<number>\d+(?:\.\d+)*)\.?\s+(?P<title>.+)$"
)
SECTION_HEADING_PATTERN = re.compile(
    r"^(?P<label>SECTION)\s+(?P<number>[A-Z0-9IVX.\-]+)\s*[-.:]?\s*(?P<title>.*)$",
    re.IGNORECASE,
)
APPENDIX_HEADING_PATTERN = re.compile(
    r"^(?P<label>APPENDIX|ATTACHMENT|EXHIBIT|CDRL|CLIN)\s+(?P<number>[A-Z0-9.\-]+)\s*[-.:]?\s*(?P<title>.*)$",
    re.IGNORECASE,
)
TOC_HEADING_PATTERN = re.compile(r"^(table of contents|contents)$", re.IGNORECASE)
TOC_ENTRY_PATTERN = re.compile(
    r"^(?P<number>(?:appendix\s+[A-Z]|attachment\s+\d+|\d+(?:\.\d+)*))\s+(?P<title>.+?)\s+(?P<page>[A-Z]?\-?\d+)$",
    re.IGNORECASE,
)
DOT_LEADER_PAGE_PATTERN = re.compile(r"[.·…\s]{3,}[A-Z]?\-?\d+\s*$")
PAGE_ONLY_PATTERN = re.compile(r"^\s*(page\s+)?[A-Z]?\-?\d+\s*$", re.IGNORECASE)
DATE_ONLY_PATTERN = re.compile(
    r"^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},\s+\d{4}$",
    re.IGNORECASE,
)
LINE_NUMBER_ONLY_PATTERN = re.compile(r"^\s*\d{1,4}\s*$")
LINE_NUMBER_PREFIX_PATTERN = re.compile(r"^\s*\d{1,4}(?:\s{2,}|\t+)(?=\S)")


def normalize_text(text: str) -> str:
    cleaned_lines: list[str] = []
    for raw_line in text.replace("\r", "\n").split("\n"):
        if LINE_NUMBER_ONLY_PATTERN.match(raw_line):
            continue
        stripped_prefix = LINE_NUMBER_PREFIX_PATTERN.sub("", raw_line)
        cleaned_lines.append(stripped_prefix)
    normalized = MULTISPACE_PATTERN.sub(" ", " ".join(cleaned_lines)).strip()
    if not normalized:
        return ""
    if (
        NUMBERED_HEADING_PATTERN.match(normalized)
        or SECTION_HEADING_PATTERN.match(normalized)
        or APPENDIX_HEADING_PATTERN.match(normalized)
        or TOC_HEADING_PATTERN.match(normalized)
        or TOC_ENTRY_PATTERN.match(normalized)
        or PAGE_ONLY_PATTERN.match(normalized)
        or DATE_ONLY_PATTERN.match(normalized)
    ):
        return normalized
    return re.sub(r"^\d{1,4}\s+(?=\S)", "", normalized).strip()


def strip_classification_prefix(text: str) -> str:
    stripped = CLASSIFICATION_PREFIX_PATTERN.sub("", text).strip()
    return stripped or text.strip()


def parse_docling_ref(ref: str) -> tuple[str, int] | None:
    match = DOC_REF_PATTERN.match(ref)
    if match is None:
        return None
    return match.group(1), int(match.group(2))


def resolve_docling_node(structured_document: dict[str, Any], ref: str) -> tuple[str, dict[str, Any]] | None:
    parsed = parse_docling_ref(ref)
    if parsed is None:
        return None
    collection_name, index = parsed
    collection = structured_document.get(collection_name)
    if not isinstance(collection, list) or index >= len(collection):
        return None
    node = collection[index]
    if not isinstance(node, dict):
        return None
    singular = collection_name[:-1] if collection_name.endswith("s") else collection_name
    return singular, node


def extract_page_number(node: dict[str, Any]) -> int | None:
    candidates = node.get("prov") or node.get("provenance") or []
    if isinstance(candidates, dict):
        candidates = [candidates]
    pages: list[int] = []
    if isinstance(candidates, list):
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            for key in ("page_no", "page", "page_number"):
                value = candidate.get(key)
                if isinstance(value, int):
                    pages.append(value)
    return min(pages) if pages else None


def extract_docling_text_blocks(structured_document: dict[str, Any]) -> list[dict[str, Any]]:
    body = structured_document.get("body", {})
    body_children = body.get("children", [])
    blocks: list[dict[str, Any]] = []
    source_order = 0

    def visit_ref(ref: str) -> None:
        nonlocal source_order
        resolved = resolve_docling_node(structured_document, ref)
        if resolved is None:
            return
        node_type, node = resolved
        if node_type == "group":
            for child in node.get("children", []):
                child_ref = child.get("$ref")
                if child_ref:
                    visit_ref(child_ref)
            return
        if node_type not in {"text", "table"}:
            return

        if node_type == "table":
            return

        text = normalize_text(str(node.get("text", "")))
        if not text:
            return

        formatting = node.get("formatting") or {}
        blocks.append(
            {
                "text_exact": text,
                "source_order": source_order,
                "source_page": extract_page_number(node),
                "label": node.get("label", "text"),
                "bold": bool(formatting.get("bold")),
            }
        )
        source_order += 1

    for child in body_children:
        child_ref = child.get("$ref")
        if child_ref:
            visit_ref(child_ref)

    return blocks


def extract_markdown_blocks(markdown: str) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    source_order = 0
    for raw_line in markdown.splitlines():
        stripped_line = raw_line.strip()
        markdown_heading_level = stripped_line.count("#") if stripped_line.startswith("#") else 0
        line = normalize_text(raw_line)
        if not line:
            continue
        if markdown_heading_level:
            line = line.lstrip("#").strip()
        if not line:
            continue
        blocks.append(
            {
                "text_exact": line,
                "source_order": source_order,
                "source_page": None,
                "label": "markdown",
                "bold": bool(markdown_heading_level),
                "markdown_heading_level": markdown_heading_level,
            }
        )
        source_order += 1
    return blocks


def is_toc_entry(text: str) -> bool:
    if TOC_ENTRY_PATTERN.match(text):
        return True
    if "\t" in text and re.search(r"\t[A-Z]?\-?\d+\s*$", text):
        return True
    return bool(DOT_LEADER_PAGE_PATTERN.search(text))


def looks_like_heading(block: dict[str, Any]) -> tuple[bool, dict[str, Any] | None]:
    text = block["text_exact"]
    normalized = strip_classification_prefix(text)
    if PAGE_ONLY_PATTERN.match(text) or DATE_ONLY_PATTERN.match(text):
        return False, {"reason": "page_or_date"}
    if TOC_HEADING_PATTERN.match(text):
        return False, {"reason": "toc_heading"}
    if is_toc_entry(text):
        return False, {"reason": "toc_entry"}

    appendix_match = APPENDIX_HEADING_PATTERN.match(normalized)
    if appendix_match:
        label = appendix_match.group("label").upper()
        number = f"{label} {appendix_match.group('number').upper()}".strip()
        title = appendix_match.group("title").strip() or number
        if len(title.split()) > 18:
            return False, {"reason": "appendix_heading_too_long"}
        if block.get("label") == "markdown" and not block.get("markdown_heading_level"):
            return False, {"reason": "markdown_plain_text"}
        return True, {
            "section_number": number,
            "section_title": title,
            "tree_kind": label,
            "detection_method": "appendix_pattern",
        }

    section_match = SECTION_HEADING_PATTERN.match(normalized)
    if section_match:
        number = section_match.group("number").upper()
        title = section_match.group("title").strip() or number
        return True, {
            "section_number": number,
            "section_title": title,
            "tree_kind": "SECTION",
            "detection_method": "section_pattern",
        }

    numbered_match = NUMBERED_HEADING_PATTERN.match(normalized)
    if numbered_match:
        title = numbered_match.group("title").strip()
        if not title:
            return False, {"reason": "empty_numbered_heading"}
        if len(title.split()) > 18:
            return False, {"reason": "numbered_heading_too_long"}
        if block.get("label") == "markdown" and not block.get("markdown_heading_level"):
            return False, {"reason": "markdown_plain_text"}
        return True, {
            "section_number": numbered_match.group("number"),
            "section_title": title,
            "tree_kind": "MAIN",
            "detection_method": "numbered_pattern",
        }

    return False, {"reason": "no_heading_match"}


def parent_section_number(section_number: str, tree_kind: str) -> str | None:
    if tree_kind in {"APPENDIX", "ATTACHMENT", "EXHIBIT", "CDRL", "CLIN", "SECTION"}:
        return None
    if "." not in section_number:
        return None
    return section_number.rsplit(".", 1)[0]


def section_depth(section_number: str, tree_kind: str) -> int:
    if tree_kind in {"APPENDIX", "ATTACHMENT", "EXHIBIT", "CDRL", "CLIN", "SECTION"}:
        return 1
    return len(section_number.split("."))


def _build_stage1_from_blocks(
    *,
    filename: str,
    blocks: list[dict[str, Any]],
    source_kind: str,
) -> dict[str, Any]:
    sections: list[dict[str, Any]] = []
    rejected_candidates: list[dict[str, Any]] = []
    seen_keys: set[tuple[str, int]] = set()
    parent_warnings: list[str] = []

    for block in blocks:
        is_heading, parsed = looks_like_heading(block)
        if not is_heading:
            rejected_candidates.append(
                {
                    "source_order": block["source_order"],
                    "text_exact": block["text_exact"],
                    "reason": parsed["reason"] if parsed else "unknown",
                }
            )
            continue

        section_number = str(parsed["section_number"])
        tree_kind = str(parsed["tree_kind"])
        dedupe_key = (section_number, block["source_order"])
        if dedupe_key in seen_keys:
            continue
        seen_keys.add(dedupe_key)
        parent_number = parent_section_number(section_number, tree_kind)
        if parent_number is not None and not any(
            item["section_number"] == parent_number for item in sections
        ):
            parent_warnings.append(
                f"Missing parent '{parent_number}' for section '{section_number}'"
            )
        sections.append(
            {
                "section_number": section_number,
                "section_title": parsed["section_title"],
                "parent_section_number": parent_number,
                "depth": section_depth(section_number, tree_kind),
                "source_order": block["source_order"],
                "source_page": block["source_page"],
                "heading_text_exact": block["text_exact"],
                "tree_kind": tree_kind,
                "detection_method": parsed["detection_method"],
            }
        )

    return {
        "stage": "stage1_section_tree",
        "filename": filename,
        "source_kind": source_kind,
        "sections": sections,
        "audit": {
            "input_block_count": len(blocks),
            "accepted_section_count": len(sections),
            "rejected_candidate_count": len(rejected_candidates),
            "parent_warning_count": len(parent_warnings),
            "parent_warnings": parent_warnings,
            "rejected_candidates_preview": rejected_candidates[:25],
        },
    }


def build_stage1_section_tree(
    *,
    filename: str,
    structured_document: dict[str, Any] | None = None,
    normalized_markdown: str | None = None,
) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    if structured_document:
        candidates.append(
            _build_stage1_from_blocks(
                filename=filename,
                blocks=extract_docling_text_blocks(structured_document),
                source_kind="docling_structured_document",
            )
        )
    if normalized_markdown:
        candidates.append(
            _build_stage1_from_blocks(
                filename=filename,
                blocks=extract_markdown_blocks(normalized_markdown),
                source_kind="normalized_markdown",
            )
        )
    if not candidates:
        raise ValueError("Either structured_document or normalized_markdown is required")

    selected = max(
        candidates,
        key=lambda item: (
            len(item["sections"]),
            -item["audit"]["parent_warning_count"],
        ),
    )
    selected["audit"]["candidate_sources"] = [
        {
            "source_kind": item["source_kind"],
            "accepted_section_count": len(item["sections"]),
            "parent_warning_count": item["audit"]["parent_warning_count"],
        }
        for item in candidates
    ]
    return selected


def load_stage1_input(payload: dict[str, Any]) -> tuple[str, dict[str, Any] | None, str | None]:
    filename = str(payload.get("filename") or "uploaded-pws.bin")
    structured_document = payload.get("structured_document")
    if structured_document is None and "docling_structured_document" in payload:
        structured_document = payload.get("docling_structured_document")
    normalized_markdown = payload.get("normalized_markdown")
    if normalized_markdown is None and "markdown" in payload:
        normalized_markdown = payload.get("markdown")
    if isinstance(structured_document, str):
        structured_document = json.loads(structured_document)
    if structured_document is not None and not isinstance(structured_document, dict):
        raise ValueError("structured_document must be a JSON object")
    if normalized_markdown is not None and not isinstance(normalized_markdown, str):
        raise ValueError("normalized_markdown must be a string")
    return filename, structured_document, normalized_markdown
