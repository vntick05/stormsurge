import json
import re
from dataclasses import dataclass
from typing import Any, Callable


MULTISPACE_PATTERN = re.compile(r"[ \t]{2,}")
DOC_REF_PATTERN = re.compile(r"^#/([a-z_]+)/(\d+)$")
DECIMAL_HEADING_PATTERN = re.compile(r"^(?P<token>\d+(?:\.\d+)+)\s+(?P<title>.+)$")
SIMPLE_NUM_HEADING_PATTERN = re.compile(r"^(?P<token>\d+)\s+(?P<title>.+)$")
COMPOSITE_LIST_PATTERN = re.compile(
    r"^(?P<section>\d+(?:\.\d+)+)(?P<suffix>(?:\([A-Za-z0-9ivxIVX]+\))+)\s+(?P<body>.+)$"
)
SECTION_HEADING_PATTERN = re.compile(
    r"^(?P<label>SECTION)\s+(?P<token>[A-Z0-9IVX.\-]+)\s*[-.:]?\s*(?P<title>.*)$",
    re.IGNORECASE,
)
APPENDIX_HEADING_PATTERN = re.compile(
    r"^(?P<label>APPENDIX|ATTACHMENT|EXHIBIT|CDRL|CLIN)\s+(?P<token>[A-Z0-9.\-]+)\s*[-.:]?\s*(?P<title>.*)$",
    re.IGNORECASE,
)
PAREN_LIST_PATTERN = re.compile(r"^(?P<token>(?:\([A-Za-z0-9ivxIVX]+\))+)\s+(?P<body>.+)$")
BULLET_LIST_PATTERN = re.compile(r"^(?P<token>[-*•])\s+(?P<body>.+)$")
ALPHA_LIST_PATTERN = re.compile(r"^(?P<token>[A-Za-z]\.)\s+(?P<body>.+)$")
PAGE_NUMBER_PATTERN = re.compile(r"^\s*page\s+\d+\s*$", re.IGNORECASE)
DATE_ONLY_PATTERN = re.compile(r"^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},\s+\d{4}$", re.IGNORECASE)
CLASSIFICATION_PREFIX_PATTERN = re.compile(r"^(?:\((?:U|C|S|TS|FOUO|U//FOUO|U/FOUO|S//NF|TS//SI//NF)\)\s*)+", re.IGNORECASE)
CLASSIFICATION_ONLY_PATTERN = re.compile(r"^\(?[A-Z/]{1,12}\)?$")
DOT_LEADER_PAGE_PATTERN = re.compile(r"[.·…\s]{3,}[A-Z]?\-?\d+\s*$")
TRAILING_PAGE_NUMBER_PATTERN = re.compile(r"\s+\d+\s*$")
TOC_HEADING_PATTERN = re.compile(r"^(table of contents|contents|figures|appendices)$", re.IGNORECASE)
TOC_ENTRY_PATTERN = re.compile(
    r"^(?P<token>(?:appendix\s+[A-Z]|attachment\s+\d+|\d+(?:\.\d+)*))\s+(?P<title>.+?)\s+(?P<page>[A-Z]?\-?\d+)$",
    re.IGNORECASE,
)
REQUIREMENT_SPLIT_PATTERN = re.compile(r"(?<=[.;!?])\s+(?=[A-Z(])")
PARAGRAPH_SPLIT_PATTERN = re.compile(r"\n{2,}")
LINE_SPLIT_PATTERN = re.compile(r"\r?\n")
BOOKMARK_PATTERN = re.compile(r"\[bookmark:[^\]]+\]")
MARKDOWN_LINK_TOC_PATTERN = re.compile(r"^\[(?P<text>[^\]]+)\]\(\.\)$")
IMAGE_TAG_PATTERN = re.compile(r"^<!--\s*image\s*-->$", re.IGNORECASE)
INLINE_HEADING_SPLIT_PATTERN = re.compile(
    r"(?=(?:^|\s)(?:\(?[A-Z]{0,3}\)?\s*)?(?:APPENDIX|ATTACHMENT|SECTION|\d+(?:\.\d+)+|\d+)\s+[A-Z])",
    re.IGNORECASE,
)

MODALITY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("shall", re.compile(r"\bshall\b", re.IGNORECASE)),
    ("must", re.compile(r"\bmust\b", re.IGNORECASE)),
    ("required", re.compile(r"\b(required to|is required to|are required to|required)\b", re.IGNORECASE)),
    ("will", re.compile(r"\bwill\b", re.IGNORECASE)),
    ("informational", re.compile(r"\bmay\b", re.IGNORECASE)),
]
TASKING_PATTERN = re.compile(
    r"\b(perform|provide|submit|deliver|maintain|develop|prepare|support|coordinate|update|report|track|inspect|manage)\b",
    re.IGNORECASE,
)
TABLE_ACTION_PATTERN = re.compile(
    r"\b(provide|submit|deliver|maintain|develop|prepare|support|coordinate|update|inspect|manage)\b",
    re.IGNORECASE,
)
DELIVERABLE_PATTERN = re.compile(
    r"\b(deliverable|cdrl|report|plan|schedule|roadmap|status report|submission|data item)\b",
    re.IGNORECASE,
)
ACTOR_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("contractor", re.compile(r"\b(contractor|offeror)\b", re.IGNORECASE)),
    ("government", re.compile(r"\b(government|agency)\b", re.IGNORECASE)),
    ("cor", re.compile(r"\b(COR)\b", re.IGNORECASE)),
    ("pm", re.compile(r"\b(program manager|PM)\b", re.IGNORECASE)),
    ("co", re.compile(r"\b(contracting officer|CO)\b", re.IGNORECASE)),
]

ParseMode = str
PWS_PARSE_MODES = {
    "docling_structural",
    "hybrid_markdown_fill",
    "tika_fallback",
    "manual_review_required",
}


@dataclass
class SectionNode:
    section_record_id: str
    parent_section_record_id: str | None
    section_number: str
    section_title: str
    heading_path: str
    page_start: int | None
    page_end: int | None
    tree_kind: str
    source_block_id: str
    source_node_ref: str | None
    confidence: float
    extraction_method: str
    body_parts: list[str]
    body_sources: list[str]

    def to_record(self, document_id: str, project_id: str, filename: str, provider: str, content_sha256: str | None, index: int) -> dict[str, Any]:
        body_text_exact = "\n\n".join(part for part in self.body_parts if part).strip()
        return {
            "section_record_id": self.section_record_id,
            "document_id": document_id,
            "project_id": project_id,
            "filename": filename,
            "provider": provider,
            "content_sha256": content_sha256,
            "section_index": index,
            "section_number": self.section_number,
            "section_title": self.section_title,
            "section_path": self.heading_path,
            "section_heading": self.heading_path,
            "heading_path": self.heading_path,
            "body": body_text_exact,
            "body_text_exact": body_text_exact,
            "body_text_normalized": normalize_text(body_text_exact),
            "source_block_id": self.source_block_id,
            "parent_section_record_id": self.parent_section_record_id,
            "page_start": self.page_start,
            "page_end": self.page_end,
            "tree_kind": self.tree_kind,
            "parser_stage": "pws_structure",
            "source_node_ref": self.source_node_ref,
            "confidence": self.confidence,
            "extraction_method": self.extraction_method,
        }


def _strip_markdown_markup(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("**") and stripped.endswith("**") and len(stripped) > 4:
        stripped = stripped[2:-2].strip()
    match = MARKDOWN_LINK_TOC_PATTERN.match(stripped)
    if match:
        stripped = match.group("text").strip()
    return stripped


def normalize_text(text: str) -> str:
    return MULTISPACE_PATTERN.sub(" ", text.replace("\r", "\n").replace("\n", " ")).strip()


def clean_source_text(text: str) -> str:
    text = BOOKMARK_PATTERN.sub("", text or "")
    text = text.replace("[image: ]", "")
    return text


def strip_classification_prefix(text: str) -> str:
    stripped = CLASSIFICATION_PREFIX_PATTERN.sub("", text).strip()
    return stripped or text.strip()


def strip_trailing_page_artifacts(text: str) -> str:
    stripped = DOT_LEADER_PAGE_PATTERN.sub("", text).strip()
    if "\t" in text or DOT_LEADER_PAGE_PATTERN.search(text) or TOC_ENTRY_PATTERN.match(text):
        stripped = TRAILING_PAGE_NUMBER_PATTERN.sub("", stripped).strip()
    return stripped


def normalize_heading_candidate(text: str) -> str:
    normalized = normalize_text(clean_source_text(text))
    normalized = strip_classification_prefix(normalized)
    normalized = strip_trailing_page_artifacts(normalized)
    return normalized.strip(" -:\t")


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


def extract_page_span(node: dict[str, Any]) -> tuple[int | None, int | None]:
    page_numbers: list[int] = []
    candidates = node.get("prov") or node.get("provenance") or []
    if isinstance(candidates, dict):
        candidates = [candidates]
    if isinstance(candidates, list):
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            for key in ("page_no", "page", "page_number"):
                value = candidate.get(key)
                if isinstance(value, int):
                    page_numbers.append(value)
    if not page_numbers:
        return None, None
    return min(page_numbers), max(page_numbers)


def block_style_hints(node: dict[str, Any]) -> dict[str, Any]:
    formatting = node.get("formatting") or {}
    return {
        "label": node.get("label"),
        "bold": bool(formatting.get("bold")),
        "italic": bool(formatting.get("italic")),
    }


def docling_table_rows(table_node: dict[str, Any]) -> list[list[str]]:
    grid = table_node.get("data", {}).get("grid", [])
    rows: list[list[str]] = []
    for row in grid:
        if not isinstance(row, list):
            continue
        normalized_row = [normalize_text(cell.get("text", "")) if isinstance(cell, dict) else normalize_text(str(cell)) for cell in row]
        rows.append(normalized_row)
    return rows


def extract_docling_blocks(structured_document: dict[str, Any], document_id: str) -> list[dict[str, Any]]:
    body = structured_document.get("body", {})
    body_children = body.get("children", [])
    blocks: list[dict[str, Any]] = []
    order = 0

    def visit_ref(ref: str, parent_ref: str | None = None) -> None:
        nonlocal order
        resolved = resolve_docling_node(structured_document, ref)
        if resolved is None:
            return
        node_type, node = resolved
        if node_type == "group":
            for child in node.get("children", []):
                child_ref = child.get("$ref")
                if child_ref:
                    visit_ref(child_ref, ref)
            return
        page_start, page_end = extract_page_span(node)
        style_hints = block_style_hints(node)
        if node_type == "table":
            rows = docling_table_rows(node)
            table_lines = [" | ".join([cell for cell in row if cell]) for row in rows]
            raw_text = "\n".join(line for line in table_lines if line).strip()
            blocks.append(
                {
                    "block_id": f"{document_id}:block:{order}",
                    "document_order": order,
                    "block_type": "table",
                    "raw_text": raw_text,
                    "normalized_text": raw_text,
                    "page_start": page_start,
                    "page_end": page_end,
                    "style_hints": style_hints,
                    "numbering_token": None,
                    "heading_level": None,
                    "source_parser_origin": "docling",
                    "source_block_ref": ref,
                    "source_parent_ref": parent_ref,
                    "rows": rows,
                }
            )
            order += 1
            return
        if node_type == "text":
            raw_text = normalize_text(node.get("text", ""))
            if not raw_text:
                return
            blocks.append(
                {
                    "block_id": f"{document_id}:block:{order}",
                    "document_order": order,
                    "block_type": "text",
                    "raw_text": raw_text,
                    "normalized_text": raw_text,
                    "page_start": page_start,
                    "page_end": page_end,
                    "style_hints": style_hints,
                    "numbering_token": None,
                    "heading_level": None,
                    "source_parser_origin": "docling",
                    "source_block_ref": ref,
                    "source_parent_ref": parent_ref,
                }
            )
            order += 1

    for child in body_children:
        child_ref = child.get("$ref")
        if child_ref:
            visit_ref(child_ref)
    return blocks


def is_all_caps_heading(text: str) -> bool:
    letters = [char for char in text if char.isalpha()]
    if len(letters) < 6 or len(text) > 120:
        return False
    uppercase_ratio = sum(1 for char in letters if char.isupper()) / len(letters)
    return uppercase_ratio > 0.85


def is_noise_heading(text: str) -> bool:
    normalized = normalize_heading_candidate(text)
    if len(normalized) <= 1:
        return True
    if DATE_ONLY_PATTERN.match(normalized):
        return True
    if CLASSIFICATION_ONLY_PATTERN.match(normalized.upper()):
        return True
    return False


def decimal_heading_level(token: str) -> int:
    parts = token.split(".")
    if len(parts) == 2 and parts[-1] == "0":
        return 1
    return len(parts)


def simple_heading_level(token: str) -> int:
    return 1


def classify_text_block(block: dict[str, Any]) -> dict[str, Any]:
    text = block["normalized_text"]
    heading_text = normalize_heading_candidate(text)
    style_hints = block.get("style_hints") or {}
    label = (style_hints.get("label") or "").lower()
    if PAGE_NUMBER_PATTERN.match(text):
        return {"block_type": "page_break", "confidence": 0.99}
    if is_noise_heading(text):
        return {"block_type": "footer_or_header", "confidence": 0.99}
    match = APPENDIX_HEADING_PATTERN.match(heading_text)
    if match:
        title = match.group("title").strip() or f"{match.group('label').title()} {match.group('token')}"
        tree_kind = match.group("label").upper()
        block_type = "appendix_heading" if tree_kind == "APPENDIX" else "attachment_heading"
        return {
            "block_type": block_type,
            "heading_level": 1,
            "numbering_token": f"{tree_kind} {match.group('token')}",
            "heading_title": title,
            "tree_kind": tree_kind,
            "confidence": 0.99,
        }
    match = SECTION_HEADING_PATTERN.match(heading_text)
    if match:
        title = match.group("title").strip() or f"SECTION {match.group('token')}"
        return {
            "block_type": "heading",
            "heading_level": 1,
            "numbering_token": f"SECTION {match.group('token')}",
            "heading_title": title,
            "tree_kind": "MAIN",
            "confidence": 0.98,
        }
    match = DECIMAL_HEADING_PATTERN.match(heading_text)
    if match:
        return {
            "block_type": "heading",
            "heading_level": decimal_heading_level(match.group("token")),
            "numbering_token": match.group("token"),
            "heading_title": match.group("title").strip(),
            "tree_kind": "MAIN",
            "confidence": 0.97,
        }
    match = SIMPLE_NUM_HEADING_PATTERN.match(heading_text)
    if match and label in {"section_header", "text"}:
        return {
            "block_type": "heading",
            "heading_level": simple_heading_level(match.group("token")),
            "numbering_token": match.group("token"),
            "heading_title": match.group("title").strip(),
            "tree_kind": "MAIN",
            "confidence": 0.95,
        }
    match = COMPOSITE_LIST_PATTERN.match(text)
    if match:
        return {
            "block_type": "list_item",
            "numbering_token": f"{match.group('section')}{match.group('suffix')}",
            "list_level": match.group("suffix").count("("),
            "list_body": match.group("body").strip(),
            "confidence": 0.94,
        }
    match = PAREN_LIST_PATTERN.match(text)
    if match:
        return {
            "block_type": "list_item",
            "numbering_token": match.group("token"),
            "list_level": match.group("token").count("("),
            "list_body": match.group("body").strip(),
            "confidence": 0.93,
        }
    match = ALPHA_LIST_PATTERN.match(text)
    if match:
        return {
            "block_type": "list_item",
            "numbering_token": match.group("token"),
            "list_level": 1,
            "list_body": match.group("body").strip(),
            "confidence": 0.86,
        }
    match = BULLET_LIST_PATTERN.match(text)
    if match:
        return {
            "block_type": "list_item",
            "numbering_token": match.group("token"),
            "list_level": 1,
            "list_body": match.group("body").strip(),
            "confidence": 0.82,
        }
    if text.upper().startswith("NOTE:"):
        return {"block_type": "note", "confidence": 0.9}
    if style_hints.get("bold") and len(heading_text.split()) <= 14 and not is_noise_heading(heading_text):
        return {
            "block_type": "heading",
            "heading_level": 2,
            "numbering_token": heading_text,
            "heading_title": heading_text,
            "tree_kind": "MAIN",
            "confidence": 0.72,
        }
    if is_all_caps_heading(heading_text):
        return {
            "block_type": "heading",
            "heading_level": 2,
            "numbering_token": heading_text,
            "heading_title": heading_text.title(),
            "tree_kind": "MAIN",
            "confidence": 0.68,
        }
    return {"block_type": "paragraph", "confidence": 0.7}


def heading_title_text(block: dict[str, Any]) -> str:
    if block["block_type"] not in {"heading", "appendix_heading", "attachment_heading"}:
        return ""
    return normalize_heading_candidate(block.get("heading_title") or block.get("normalized_text") or "")


def is_toc_heading_block(block: dict[str, Any]) -> bool:
    title = heading_title_text(block)
    return bool(title and TOC_HEADING_PATTERN.match(title))


def is_toc_entry_block(block: dict[str, Any]) -> bool:
    if block["block_type"] not in {"heading", "list_item", "paragraph"}:
        return False
    text = normalize_text(block.get("raw_text") or block.get("normalized_text") or "")
    text = strip_classification_prefix(text)
    if not text:
        return False
    return TOC_ENTRY_PATTERN.match(text) is not None


def tag_front_matter_and_toc_blocks(blocks: list[dict[str, Any]]) -> None:
    toc_mode = False
    body_started = False
    for block in blocks:
        block["content_scope"] = "body"
        if block["block_type"] == "footer_or_header":
            block["content_scope"] = "front_matter"
            continue
        if not body_started and block["block_type"] in {"heading", "appendix_heading", "attachment_heading"}:
            title = heading_title_text(block)
            if title == "Performance Work Statement (PWS)" or DATE_ONLY_PATTERN.match(title):
                block["content_scope"] = "front_matter"
                continue
        if is_toc_heading_block(block):
            block["content_scope"] = "table_of_contents"
            toc_mode = True
            continue
        if toc_mode:
            if is_toc_entry_block(block):
                block["content_scope"] = "table_of_contents"
                continue
            if block["block_type"] == "heading" and block.get("numbering_token"):
                toc_mode = False
                body_started = True
            elif block["block_type"] in {"paragraph", "list_item"}:
                block["content_scope"] = "table_of_contents"
                continue
        if not body_started and block["block_type"] in {"heading", "appendix_heading", "attachment_heading"}:
            body_started = True
        elif not body_started:
            block["content_scope"] = "front_matter"


def stack_heading_level(item: dict[str, Any]) -> int:
    level = item.get("heading_level")
    return 1 if level is None else int(level)


def build_normalized_requirement(text: str) -> str:
    normalized = normalize_text(text)
    return re.sub(r"^\(?[A-Za-z0-9ivxIVX.\-]+\)?\s+", "", normalized)


def detect_modality(text: str) -> str:
    for label, pattern in MODALITY_PATTERNS:
        if pattern.search(text):
            return label
    return "informational"


def detect_actor(text: str) -> str | None:
    for label, pattern in ACTOR_PATTERNS:
        if pattern.search(text):
            return label
    return None


def detect_heading_gap(previous_token: str | None, current_token: str | None) -> bool:
    if not previous_token or not current_token:
        return False
    if "." not in previous_token or "." not in current_token:
        return False
    previous_parts = previous_token.split(".")
    current_parts = current_token.split(".")
    if len(previous_parts) != len(current_parts):
        return False
    if previous_parts[:-1] != current_parts[:-1]:
        return False
    try:
        return int(current_parts[-1]) > int(previous_parts[-1]) + 1
    except ValueError:
        return False


def split_requirement_fragments(text: str, block_type: str) -> list[str]:
    normalized = normalize_text(text)
    if not normalized:
        return []
    if block_type == "list_item":
        return [normalized]
    fragments = [fragment.strip() for fragment in REQUIREMENT_SPLIT_PATTERN.split(normalized) if fragment.strip()]
    return fragments or [normalized]


def is_likely_pws_document(filename: str, markdown: str | None = None) -> bool:
    normalized_name = filename.lower()
    if "pws" in normalized_name or "performance work statement" in normalized_name or "statement of work" in normalized_name:
        return True
    if "appendix" in normalized_name and markdown and "appendix" in markdown[:500].lower():
        return True
    if markdown:
        prefix = markdown[:2000].lower()
        if "performance work statement" in prefix and ("1.0" in prefix or "1 " in prefix or "appendix" in prefix):
            return True
    return False


def _line_heading_candidate(line: str) -> dict[str, Any] | None:
    text = normalize_heading_candidate(_strip_markdown_markup(line))
    if not text or is_noise_heading(text):
        return None
    appendix = APPENDIX_HEADING_PATTERN.match(text)
    if appendix:
        token = f"{appendix.group('label').upper()} {appendix.group('token')}"
        title = appendix.group("title").strip() or token
        return {
            "numbering_token": token,
            "heading_title": title,
            "heading_level": 1,
            "tree_kind": appendix.group("label").upper(),
        }
    section = SECTION_HEADING_PATTERN.match(text)
    if section:
        token = f"SECTION {section.group('token')}"
        title = section.group("title").strip() or token
        return {"numbering_token": token, "heading_title": title, "heading_level": 1, "tree_kind": "MAIN"}
    decimal = DECIMAL_HEADING_PATTERN.match(text)
    if decimal:
        return {
            "numbering_token": decimal.group("token"),
            "heading_title": decimal.group("title").strip(),
            "heading_level": decimal_heading_level(decimal.group("token")),
            "tree_kind": "MAIN",
        }
    simple = SIMPLE_NUM_HEADING_PATTERN.match(text)
    if simple and len(simple.group("title").split()) <= 12:
        return {
            "numbering_token": simple.group("token"),
            "heading_title": simple.group("title").strip(),
            "heading_level": 1,
            "tree_kind": "MAIN",
        }
    return None


def _looks_like_toc_or_noise(line: str) -> bool:
    normalized = normalize_heading_candidate(_strip_markdown_markup(line))
    if not normalized:
        return True
    if IMAGE_TAG_PATTERN.match(normalized):
        return True
    match = MARKDOWN_LINK_TOC_PATTERN.match(normalized)
    if match:
        normalized = match.group("text")
    return TOC_HEADING_PATTERN.match(normalized) is not None or TOC_ENTRY_PATTERN.match(normalized) is not None


def _choose_primary_pws_text(markdown: str | None, tika_text: str | None, docling_blocks: list[dict[str, Any]]) -> tuple[str, str]:
    if markdown and len(markdown.strip()) > 40:
        return markdown, "markdown"
    if tika_text and len(tika_text.strip()) > 40:
        return tika_text, "tika"
    docling_text = "\n\n".join(
        block["normalized_text"]
        for block in docling_blocks
        if block["block_type"] != "table" and block.get("content_scope") not in {"front_matter", "table_of_contents"}
    )
    return docling_text, "docling_text"


def _sectionize_pws_text(document_id: str, text: str, source_name: str) -> dict[str, Any]:
    blocks: list[dict[str, Any]] = []
    sections: list[SectionNode] = []
    section_links: list[dict[str, Any]] = []
    reviews: list[dict[str, Any]] = []
    order = 0
    current_stack: list[dict[str, Any]] = []
    current_section: SectionNode | None = None
    body_started = False
    toc_mode = False
    preamble: list[str] = []
    previous_heading_token: str | None = None
    prose_block_count = 0
    toc_signal_score = 0

    def add_review(text_value: str, reason: str = "unassigned_content") -> None:
        reviews.append(
            {
                "review_id": f"{document_id}:review:{len(reviews)}",
                "item_type": "orphan_content",
                "section_number": None,
                "heading_path": None,
                "raw_text": text_value,
                "source_block_id": f"{document_id}:{source_name}:review:{len(reviews)}",
                "source_page": None,
                "reason": reason,
                "confidence": 0.6,
            }
        )

    def attach_paragraph(text_value: str) -> None:
        nonlocal order, prose_block_count
        normalized = normalize_text(_strip_markdown_markup(text_value))
        if not normalized or _looks_like_toc_or_noise(normalized):
            return
        prose_block_count += 1
        block_type = "list_item" if PAREN_LIST_PATTERN.match(normalized) or BULLET_LIST_PATTERN.match(normalized) or ALPHA_LIST_PATTERN.match(normalized) else "paragraph"
        block_id = f"{document_id}:{source_name}:block:{order}"
        block = {
            "block_id": block_id,
            "document_order": len(blocks),
            "block_type": block_type,
            "raw_text": normalized,
            "normalized_text": normalized,
            "page_start": None,
            "page_end": None,
            "style_hints": {"label": source_name},
            "numbering_token": None,
            "heading_level": None,
            "source_parser_origin": source_name,
            "source_block_ref": None,
            "source_parent_ref": None,
            "content_scope": "body",
            "section_path": current_section.heading_path if current_section else "DOCUMENT",
            "section_heading": current_section.heading_path if current_section else "Document Body",
            "parent_block_id": current_section.source_block_id if current_section else None,
            "parser_stage": "pws_structure",
            "confidence": 0.8,
            "tree_kind": current_section.tree_kind if current_section else "MAIN",
        }
        blocks.append(block)
        order += 1
        if current_section is None:
            add_review(normalized)
            return
        current_section.body_parts.append(normalized)
        current_section.body_sources.append(block_id)
        section_links.append(
            {
                "link_id": f"{document_id}:link:{len(section_links)}",
                "document_id": document_id,
                "section_record_id": current_section.section_record_id,
                "block_id": block_id,
                "assignment_method": f"{source_name}_section_slice",
                "confidence": 0.82,
            }
        )

    for paragraph in _iter_source_paragraphs(text):
        cleaned = normalize_text(_strip_markdown_markup(paragraph))
        if not cleaned:
            continue
        heading = _line_heading_candidate(cleaned)
        if TOC_HEADING_PATTERN.match(cleaned.lower()):
            toc_mode = True
            toc_signal_score += 1
            continue
        if toc_mode and (TOC_ENTRY_PATTERN.match(cleaned) or MARKDOWN_LINK_TOC_PATTERN.match(paragraph)):
            toc_signal_score += 1
            continue
        if heading:
            body_started = True
            toc_mode = False
            level = int(heading["heading_level"])
            if heading["tree_kind"] != "MAIN":
                current_stack = []
            else:
                while current_stack and int(current_stack[-1]["heading_level"]) >= level:
                    current_stack.pop()
            parent = current_stack[-1] if current_stack else None
            number = heading["numbering_token"]
            title = heading["heading_title"]
            path = " > ".join([item["numbering_token"] for item in current_stack] + [number])
            if detect_heading_gap(previous_heading_token, number):
                reviews.append(
                    {
                        "review_id": f"{document_id}:review:{len(reviews)}",
                        "item_type": "heading_gap",
                        "section_number": number,
                        "heading_path": path,
                        "raw_text": cleaned,
                        "source_block_id": f"{document_id}:{source_name}:heading:{len(sections)}",
                        "source_page": None,
                        "reason": "heading_continuity_gap",
                        "confidence": 0.72,
                    }
                )
            previous_heading_token = number
            block_id = f"{document_id}:{source_name}:block:{order}"
            section = SectionNode(
                section_record_id=f"{document_id}:section:{len(sections)}",
                parent_section_record_id=parent["section_record_id"] if parent else None,
                section_number=number,
                section_title=title,
                heading_path=path,
                page_start=None,
                page_end=None,
                tree_kind=heading["tree_kind"],
                source_block_id=block_id,
                source_node_ref=None,
                confidence=0.9,
                extraction_method=f"{source_name}_section_slice",
                body_parts=[],
                body_sources=[],
            )
            sections.append(section)
            current_section = section
            current_stack.append(
                {
                    "section_record_id": section.section_record_id,
                    "heading_level": level,
                    "numbering_token": number,
                    "heading_title": title,
                }
            )
            blocks.append(
                {
                    "block_id": block_id,
                    "document_order": len(blocks),
                    "block_type": "heading" if heading["tree_kind"] == "MAIN" else "appendix_heading",
                    "raw_text": cleaned,
                    "normalized_text": cleaned,
                    "page_start": None,
                    "page_end": None,
                    "style_hints": {"label": source_name},
                    "numbering_token": number,
                    "heading_level": level,
                    "source_parser_origin": source_name,
                    "source_block_ref": None,
                    "source_parent_ref": None,
                    "content_scope": "body",
                    "section_path": path,
                    "section_heading": path,
                    "heading_title": title,
                    "parent_block_id": parent["section_record_id"] if parent else None,
                    "parser_stage": "pws_structure",
                    "confidence": 0.9,
                    "tree_kind": heading["tree_kind"],
                }
            )
            order += 1
            continue
        if not body_started:
            preamble.append(cleaned)
            continue
        attach_paragraph(cleaned)

    for paragraph in preamble:
        add_review(paragraph)

    assigned_chars = sum(len("\n\n".join(section.body_parts)) for section in sections)
    total_chars = len(clean_source_text(text))
    suspicious_empty = len([section for section in sections if not section.body_parts])
    body_signal_score = prose_block_count + len([section for section in sections if section.body_parts]) * 2
    return {
        "source_name": source_name,
        "blocks": blocks,
        "sections": sections,
        "section_links": section_links,
        "reviews": reviews,
        "metrics": {
            "section_count": len(sections),
            "heading_count": len(sections),
            "prose_block_count": prose_block_count,
            "suspicious_empty_section_count": suspicious_empty,
            "coverage_ratio": round(assigned_chars / total_chars, 4) if total_chars else 0.0,
            "orphan_content_count": len([review for review in reviews if review["reason"] == "unassigned_content"]),
            "toc_signal_score": toc_signal_score,
            "body_signal_score": body_signal_score,
        },
    }


def _split_chunk_into_paragraphs(chunk: str) -> list[str]:
    paragraphs: list[str] = []
    current_lines: list[str] = []

    def flush() -> None:
        if current_lines:
            paragraphs.append("\n".join(current_lines).strip())
            current_lines.clear()

    for raw_line in LINE_SPLIT_PATTERN.split(clean_source_text(chunk)):
        line = raw_line.strip()
        if not line:
            flush()
            continue
        if _looks_like_toc_or_noise(line):
            flush()
            continue
        heading = _line_heading_candidate(line)
        if heading is not None:
            flush()
            paragraphs.append(line)
            continue
        current_lines.append(line)
    flush()

    expanded: list[str] = []
    for paragraph in paragraphs:
        if _line_heading_candidate(paragraph) is not None:
            expanded.append(paragraph)
            continue
        parts = [part.strip() for part in INLINE_HEADING_SPLIT_PATTERN.split(paragraph) if part.strip()]
        if len(parts) <= 1:
            expanded.append(paragraph)
            continue
        for part in parts:
            expanded.append(part)
    return expanded


def _iter_source_paragraphs(text: str) -> list[str]:
    paragraphs: list[str] = []
    for chunk in PARAGRAPH_SPLIT_PATTERN.split(text or ""):
        paragraphs.extend(_split_chunk_into_paragraphs(chunk))
    return paragraphs


def _extract_text_structure(text: str, source_name: str, document_id: str) -> dict[str, Any]:
    blocks: list[dict[str, Any]] = []
    sections: list[SectionNode] = []
    section_links: list[dict[str, Any]] = []
    current_stack: list[dict[str, Any]] = []
    current_section: SectionNode | None = None
    total_chars = 0
    assigned_chars = 0
    order = 0
    previous_heading_token: str | None = None
    reviews: list[dict[str, Any]] = []
    toc_signal = 0
    prose_block_count = 0

    for paragraph in _iter_source_paragraphs(text):
        paragraph = clean_source_text(paragraph).strip()
        if not paragraph or _looks_like_toc_or_noise(paragraph):
            continue
        heading = _line_heading_candidate(paragraph)
        block_id = f"{document_id}:{source_name}:block:{order}"
        order += 1
        if TOC_HEADING_PATTERN.match(paragraph.lower()) or TOC_ENTRY_PATTERN.match(paragraph) or MARKDOWN_LINK_TOC_PATTERN.match(paragraph):
            toc_signal += 1
            continue
        if heading:
            level = int(heading["heading_level"])
            if heading["tree_kind"] in {"APPENDIX", "ATTACHMENT", "EXHIBIT", "CDRL", "CLIN"}:
                current_stack = []
            else:
                while current_stack and int(current_stack[-1]["heading_level"]) >= level:
                    current_stack.pop()
            parent = current_stack[-1] if current_stack else None
            number = heading["numbering_token"]
            path = " > ".join([item["numbering_token"] for item in current_stack] + [number])
            title_path = " > ".join([item["heading_title"] for item in current_stack] + [heading["heading_title"]])
            section = SectionNode(
                section_record_id=f"{document_id}:section:{len(sections)}",
                parent_section_record_id=parent["section_record_id"] if parent else None,
                section_number=number,
                section_title=heading["heading_title"],
                heading_path=path,
                page_start=None,
                page_end=None,
                tree_kind=heading["tree_kind"],
                source_block_id=block_id,
                source_node_ref=None,
                confidence=0.86 if source_name != "docling" else 0.95,
                extraction_method=f"{source_name}_structural",
                body_parts=[],
                body_sources=[],
            )
            if detect_heading_gap(previous_heading_token, number):
                reviews.append(
                    {
                        "review_id": f"{document_id}:review:{len(reviews)}",
                        "item_type": "heading_gap",
                        "section_number": number,
                        "heading_path": path,
                        "raw_text": paragraph,
                        "source_block_id": block_id,
                        "source_page": None,
                        "reason": "heading_continuity_gap",
                        "confidence": 0.72,
                    }
                )
            previous_heading_token = number
            sections.append(section)
            current_stack.append(
                {
                    "section_record_id": section.section_record_id,
                    "heading_level": level,
                    "numbering_token": number,
                    "heading_title": heading["heading_title"],
                }
            )
            current_section = section
            blocks.append(
                {
                    "block_id": block_id,
                    "document_order": len(blocks),
                    "block_type": "heading" if heading["tree_kind"] == "MAIN" else "appendix_heading",
                    "raw_text": paragraph,
                    "normalized_text": normalize_text(paragraph),
                    "page_start": None,
                    "page_end": None,
                    "style_hints": {"label": source_name},
                    "numbering_token": number,
                    "heading_level": level,
                    "source_parser_origin": source_name,
                    "source_block_ref": None,
                    "source_parent_ref": None,
                    "content_scope": "body",
                    "section_path": path,
                    "section_heading": title_path,
                    "heading_title": heading["heading_title"],
                    "parent_block_id": parent["section_record_id"] if parent else None,
                    "parser_stage": "pws_structure",
                    "confidence": section.confidence,
                    "tree_kind": heading["tree_kind"],
                }
            )
            continue

        block_type = "list_item" if PAREN_LIST_PATTERN.match(paragraph) or BULLET_LIST_PATTERN.match(paragraph) or ALPHA_LIST_PATTERN.match(paragraph) else "paragraph"
        prose_block_count += 1
        total_chars += len(paragraph)
        section_path = current_section.heading_path if current_section else "DOCUMENT"
        section_heading = current_section.heading_path if current_section else "Document Body"
        blocks.append(
            {
                "block_id": block_id,
                "document_order": len(blocks),
                "block_type": block_type,
                "raw_text": paragraph,
                "normalized_text": normalize_text(paragraph),
                "page_start": None,
                "page_end": None,
                "style_hints": {"label": source_name},
                "numbering_token": None,
                "heading_level": None,
                "source_parser_origin": source_name,
                "source_block_ref": None,
                "source_parent_ref": None,
                "content_scope": "body",
                "section_path": section_path,
                "section_heading": section_heading,
                "parent_block_id": current_section.source_block_id if current_section else None,
                "parser_stage": "pws_structure",
                "confidence": 0.78 if source_name != "docling" else 0.82,
                "tree_kind": current_section.tree_kind if current_section else "MAIN",
            }
        )
        if current_section is not None:
            current_section.body_parts.append(paragraph)
            current_section.body_sources.append(block_id)
            assigned_chars += len(paragraph)
            section_links.append(
                {
                    "link_id": f"{document_id}:link:{len(section_links)}",
                    "document_id": document_id,
                    "section_record_id": current_section.section_record_id,
                    "block_id": block_id,
                    "assignment_method": f"{source_name}_fill",
                    "confidence": 0.8,
                }
            )
        else:
            if sections:
                nearest = sections[-1]
                blocks[-1]["section_path"] = nearest.heading_path
                blocks[-1]["section_heading"] = nearest.heading_path
                blocks[-1]["parent_block_id"] = nearest.source_block_id
                nearest.body_parts.append(paragraph)
                nearest.body_sources.append(block_id)
                assigned_chars += len(paragraph)
                section_links.append(
                    {
                        "link_id": f"{document_id}:link:{len(section_links)}",
                        "document_id": document_id,
                        "section_record_id": nearest.section_record_id,
                        "block_id": block_id,
                        "assignment_method": f"{source_name}_nearest_heading_attach",
                        "confidence": 0.62,
                    }
                )
            else:
                reviews.append(
                    {
                        "review_id": f"{document_id}:review:{len(reviews)}",
                        "item_type": "orphan_content",
                        "section_number": None,
                        "heading_path": None,
                        "raw_text": paragraph,
                        "source_block_id": block_id,
                        "source_page": None,
                        "reason": "unassigned_content",
                        "confidence": 0.6,
                    }
                )

    coverage_ratio = round(assigned_chars / total_chars, 4) if total_chars else 0.0
    suspicious_empty = len([section for section in sections if not section.body_parts])
    body_signal = prose_block_count + len([section for section in sections if section.body_parts]) * 2
    return {
        "source_name": source_name,
        "blocks": blocks,
        "sections": sections,
        "section_links": section_links,
        "reviews": reviews,
        "metrics": {
            "section_count": len(sections),
            "heading_count": len(sections),
            "prose_block_count": prose_block_count,
            "suspicious_empty_section_count": suspicious_empty,
            "coverage_ratio": coverage_ratio,
            "orphan_content_count": len([review for review in reviews if review["reason"] == "unassigned_content"]),
            "toc_signal_score": toc_signal,
            "body_signal_score": body_signal,
        },
    }


def _build_docling_structure(document_id: str, project_id: str, filename: str, content_sha256: str | None, structured_document: dict[str, Any]) -> dict[str, Any]:
    raw_blocks = extract_docling_blocks(structured_document, document_id)
    classified_blocks: list[dict[str, Any]] = []
    for raw_block in raw_blocks:
        classification = classify_text_block(raw_block) if raw_block["block_type"] == "text" else {"block_type": "table", "confidence": 0.95}
        block = dict(raw_block)
        block["block_type"] = classification["block_type"]
        block["numbering_token"] = classification.get("numbering_token")
        block["heading_level"] = classification.get("heading_level")
        block["confidence"] = classification.get("confidence", 0.7)
        block["tree_kind"] = classification.get("tree_kind", "MAIN")
        block["parser_stage"] = "pws_dom"
        block["heading_title"] = classification.get("heading_title")
        block["list_body"] = classification.get("list_body")
        block["list_level"] = classification.get("list_level", 1)
        classified_blocks.append(block)
    tag_front_matter_and_toc_blocks(classified_blocks)

    sections: list[SectionNode] = []
    section_links: list[dict[str, Any]] = []
    blocks: list[dict[str, Any]] = []
    reviews: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []
    current_stack: list[dict[str, Any]] = []
    current_section: SectionNode | None = None
    current_list_parent_by_level: dict[int, str] = {}
    previous_heading_token: str | None = None
    total_char_total = 0
    assigned_char_total = 0
    prose_block_count = 0
    toc_signal_score = len([block for block in classified_blocks if block.get("content_scope") == "table_of_contents"])

    for block in classified_blocks:
        block["parent_block_id"] = None
        block["section_path"] = "DOCUMENT"
        block["section_heading"] = "Document Body"
        if block["block_type"] == "table":
            block["content_scope"] = "body"
        if block["block_type"] == "footer_or_header":
            blocks.append(block)
            continue
        if block.get("content_scope") in {"front_matter", "table_of_contents"}:
            blocks.append(block)
            continue

        if block["block_type"] in {"heading", "appendix_heading", "attachment_heading"}:
            heading_level = stack_heading_level(block)
            if block["tree_kind"] != "MAIN":
                current_stack = []
                current_list_parent_by_level = {}
            else:
                while current_stack and int(current_stack[-1]["heading_level"]) >= heading_level:
                    current_stack.pop()
            parent = current_stack[-1] if current_stack else None
            number = block.get("numbering_token") or (block.get("heading_title") or block["normalized_text"])
            title = block.get("heading_title") or block["normalized_text"]
            path = " > ".join([item["numbering_token"] for item in current_stack] + [number])
            title_path = " > ".join([item["heading_title"] for item in current_stack] + [title])
            section = SectionNode(
                section_record_id=f"{document_id}:section:{len(sections)}",
                parent_section_record_id=parent["section_record_id"] if parent else None,
                section_number=number,
                section_title=title,
                heading_path=path,
                page_start=block.get("page_start"),
                page_end=block.get("page_end"),
                tree_kind=block.get("tree_kind", "MAIN"),
                source_block_id=block["block_id"],
                source_node_ref=block.get("source_block_ref"),
                confidence=block["confidence"],
                extraction_method="docling_structural",
                body_parts=[],
                body_sources=[],
            )
            if detect_heading_gap(previous_heading_token, number):
                reviews.append(
                    {
                        "review_id": f"{document_id}:review:{len(reviews)}",
                        "item_type": "heading_gap",
                        "section_number": number,
                        "heading_path": path,
                        "raw_text": block["normalized_text"],
                        "source_block_id": block["block_id"],
                        "source_page": block.get("page_start"),
                        "reason": "heading_continuity_gap",
                        "confidence": 0.72,
                    }
                )
            previous_heading_token = number
            current_section = section
            sections.append(section)
            current_stack.append(
                {
                    "section_record_id": section.section_record_id,
                    "heading_level": heading_level,
                    "numbering_token": number,
                    "heading_title": title,
                    "source_block_id": block["block_id"],
                }
            )
            block["section_path"] = path
            block["section_heading"] = title_path
            block["parent_block_id"] = parent["source_block_id"] if parent else None
            if block["tree_kind"] != "MAIN":
                tables.append({"appendix_marker": section.section_record_id})
            blocks.append(block)
            continue

        total_char_total += len(block["normalized_text"])
        prose_block_count += 1 if block["block_type"] in {"paragraph", "list_item", "note"} else 0
        if current_section is not None:
            block["section_path"] = current_section.heading_path
            block["section_heading"] = current_section.heading_path
            block["parent_block_id"] = current_section.source_block_id
            if block["block_type"] == "list_item":
                list_level = int(block.get("list_level", 1))
                block["parent_block_id"] = current_list_parent_by_level.get(list_level - 1) or current_section.source_block_id
                current_list_parent_by_level[list_level] = block["block_id"]
                for level in list(current_list_parent_by_level):
                    if level > list_level:
                        current_list_parent_by_level.pop(level, None)
                block["normalized_text"] = block.get("list_body") or block["normalized_text"]
            else:
                current_list_parent_by_level = {}
            current_section.body_parts.append(block["normalized_text"])
            current_section.body_sources.append(block["block_id"])
            section_links.append(
                {
                    "link_id": f"{document_id}:link:{len(section_links)}",
                    "document_id": document_id,
                    "section_record_id": current_section.section_record_id,
                    "block_id": block["block_id"],
                    "assignment_method": "docling_stack_attach",
                    "confidence": block["confidence"],
                }
            )
            assigned_char_total += len(block["normalized_text"])
        else:
            reviews.append(
                {
                    "review_id": f"{document_id}:review:{len(reviews)}",
                    "item_type": "orphan_content",
                    "section_number": None,
                    "heading_path": None,
                    "raw_text": block["normalized_text"],
                    "source_block_id": block["block_id"],
                    "source_page": block.get("page_start"),
                    "reason": "unassigned_content",
                    "confidence": 0.6,
                }
            )
        blocks.append(block)

    metrics = {
        "section_count": len(sections),
        "heading_count": len(sections),
        "prose_block_count": prose_block_count,
        "suspicious_empty_section_count": len([section for section in sections if not section.body_parts]),
        "coverage_ratio": round(assigned_char_total / total_char_total, 4) if total_char_total else 0.0,
        "orphan_content_count": len([review for review in reviews if review["reason"] == "unassigned_content"]),
        "toc_signal_score": toc_signal_score,
        "body_signal_score": prose_block_count + len([section for section in sections if section.body_parts]) * 2,
    }
    return {
        "source_name": "docling",
        "blocks": blocks,
        "sections": sections,
        "section_links": section_links,
        "tables": [block for block in blocks if block["block_type"] == "table"],
        "reviews": reviews,
        "metrics": metrics,
    }


def _select_parse_mode(docling_metrics: dict[str, Any], markdown_metrics: dict[str, Any] | None, tika_metrics: dict[str, Any] | None) -> tuple[ParseMode, str | None]:
    if (
        docling_metrics["section_count"] > 0
        and docling_metrics["body_signal_score"] >= max(docling_metrics["toc_signal_score"], 1)
        and docling_metrics["coverage_ratio"] >= 0.45
        and docling_metrics["suspicious_empty_section_count"] <= max(1, docling_metrics["section_count"] // 2)
    ):
        return "docling_structural", None
    if markdown_metrics and markdown_metrics["section_count"] > 0 and markdown_metrics["body_signal_score"] > markdown_metrics["toc_signal_score"]:
        return "hybrid_markdown_fill", "docling_body_signal_low"
    if tika_metrics and tika_metrics["section_count"] > 0 and tika_metrics["body_signal_score"] > tika_metrics["toc_signal_score"]:
        return "tika_fallback", "docling_and_markdown_body_signal_low"
    return "manual_review_required", "no_reliable_structural_source"


def _convert_section_nodes(document_id: str, project_id: str, filename: str, provider: str, content_sha256: str | None, nodes: list[SectionNode]) -> list[dict[str, Any]]:
    return [node.to_record(document_id, project_id, filename, provider, content_sha256, index) for index, node in enumerate(nodes)]


def _link_tables_to_sections(tables: list[dict[str, Any]], sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not sections:
        return tables
    main_sections = [section for section in sections if section.get("tree_kind") == "MAIN"] or sections
    current_section = main_sections[0]
    section_index = 0
    for table in tables:
        page_start = table.get("page_start")
        if page_start is None:
            current_section = main_sections[-1]
            table["section_number"] = current_section["section_number"]
            table["section_path"] = current_section["heading_path"]
            table["section_heading"] = current_section["heading_path"]
            table["heading_path"] = current_section["heading_path"]
            table["extraction_method"] = table.get("extraction_method", "docling_table")
            table["table_json"] = json.dumps(table.get("rows") or [])
            table["confidence"] = table.get("confidence", 0.9)
            continue
        while section_index + 1 < len(sections):
            next_section = sections[section_index + 1]
            next_page = next_section.get("page_start")
            if page_start is None or next_page is None or page_start < next_page:
                break
            current_section = next_section
            section_index += 1
        table["section_number"] = current_section["section_number"]
        table["section_path"] = current_section["heading_path"]
        table["section_heading"] = current_section["heading_path"]
        table["heading_path"] = current_section["heading_path"]
        table["extraction_method"] = table.get("extraction_method", "docling_table")
        table["table_json"] = json.dumps(table.get("rows") or [])
        table["confidence"] = table.get("confidence", 0.9)
    return tables


def _build_table_rows_and_cells(table_block: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rows = table_block.get("rows") or []
    table_rows: list[dict[str, Any]] = []
    table_cells: list[dict[str, Any]] = []
    header = rows[0] if rows else []
    for row_index, row in enumerate(rows):
        row_id = f"{table_block['block_id']}:row:{row_index}"
        table_rows.append(
            {
                "row_id": row_id,
                "table_id": table_block["block_id"],
                "row_index": row_index,
                "row_text": " | ".join(cell for cell in row if cell),
                "is_header": row_index == 0,
            }
        )
        for col_index, cell in enumerate(row):
            table_cells.append(
                {
                    "cell_id": f"{row_id}:cell:{col_index}",
                    "table_id": table_block["block_id"],
                    "row_id": row_id,
                    "row_index": row_index,
                    "col_index": col_index,
                    "header_text": header[col_index] if row_index > 0 and col_index < len(header) else None,
                    "cell_text": cell,
                }
            )
    return table_rows, table_cells


def _build_llm_units(blocks: list[dict[str, Any]], tables: list[dict[str, Any]]) -> list[dict[str, Any]]:
    units: list[dict[str, Any]] = []
    for block in blocks:
        if block["block_type"] not in {"paragraph", "list_item", "note"}:
            continue
        units.append(
            {
                "unit_id": f"{block['block_id']}:unit",
                "document_id": block["block_id"].split(":block:")[0],
                "section_number": block.get("section_path", "DOCUMENT").split(" > ")[-1] if block.get("section_path") else "DOCUMENT",
                "heading_path": block.get("section_path") or "DOCUMENT",
                "source_block_ids": [block["block_id"]],
                "source_pages": [page for page in (block.get("page_start"), block.get("page_end")) if page is not None],
                "unit_type": block["block_type"],
                "text_exact": block["normalized_text"],
                "table_context": None,
            }
        )
    for table in tables:
        rows = table.get("rows") or []
        header = rows[0] if rows else []
        for row_index, row in enumerate(rows[1:], start=1):
            row_pairs = []
            for col_index, cell in enumerate(row):
                label = header[col_index] if col_index < len(header) else f"col_{col_index + 1}"
                row_pairs.append(f"{label}: {cell}")
            units.append(
                {
                    "unit_id": f"{table['block_id']}:row:{row_index}:unit",
                    "document_id": table["block_id"].split(":block:")[0],
                    "section_number": table.get("section_number") or "DOCUMENT",
                    "heading_path": table.get("heading_path") or "DOCUMENT",
                    "source_block_ids": [table["block_id"]],
                    "source_pages": [page for page in (table.get("page_start"), table.get("page_end")) if page is not None],
                    "unit_type": "table_row",
                    "text_exact": " | ".join(row_pairs),
                    "table_context": {
                        "table_id": table["block_id"],
                        "row_index": row_index,
                    },
                }
            )
    return units


def _fallback_extract_from_unit(unit: dict[str, Any], llm_model: str | None, llm_prompt_version: str) -> dict[str, Any]:
    requirements: list[dict[str, Any]] = []
    deliverables: list[dict[str, Any]] = []
    review_items: list[dict[str, Any]] = []
    for index, fragment in enumerate(split_requirement_fragments(unit["text_exact"], "list_item" if unit["unit_type"] == "list_item" else "paragraph")):
        modality = detect_modality(fragment)
        is_requirement = modality != "informational" or TASKING_PATTERN.search(fragment) is not None or unit["unit_type"] == "table_row"
        if not is_requirement:
            continue
        requirements.append(
            {
                "source_text": fragment,
                "normalized_text": build_normalized_requirement(fragment),
                "modality": modality,
                "actor": detect_actor(fragment),
                "action": None,
                "object": None,
                "deliverable_flag": bool(DELIVERABLE_PATTERN.search(fragment)),
                "review_flag": modality == "informational",
                "confidence": 0.65 if unit["unit_type"] == "table_row" else 0.72,
                "llm_model": llm_model,
                "llm_prompt_version": llm_prompt_version,
            }
        )
        if DELIVERABLE_PATTERN.search(fragment):
            deliverables.append(
                {
                    "source_text": fragment,
                    "normalized_text": build_normalized_requirement(fragment),
                    "due_timing": None,
                    "format": None,
                    "review_flag": True,
                    "confidence": 0.6,
                }
            )
    if not requirements and TASKING_PATTERN.search(unit["text_exact"]) is not None:
        review_items.append(
            {
                "reason": "llm_unavailable_or_invalid",
                "raw_text": unit["text_exact"],
                "confidence": 0.55,
            }
        )
    return {"requirements": requirements, "deliverables": deliverables, "review_items": review_items}


def _validate_llm_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    for key in ("requirements", "deliverables", "review_items"):
        value = payload.get(key, [])
        if not isinstance(value, list):
            return None
    return payload


def _extract_with_llm_or_fallback(
    unit: dict[str, Any],
    llm_extractor: Callable[[dict[str, Any]], dict[str, Any]] | None,
    llm_model: str | None,
    llm_prompt_version: str,
) -> dict[str, Any]:
    if llm_extractor is None:
        return _fallback_extract_from_unit(unit, llm_model, llm_prompt_version)
    try:
        payload = _validate_llm_payload(llm_extractor(unit))
    except Exception:
        payload = None
    if payload is None:
        return _fallback_extract_from_unit(unit, llm_model, llm_prompt_version)
    return payload


def _baseline_requirement_from_unit(unit: dict[str, Any], llm_model: str | None, llm_prompt_version: str) -> dict[str, Any]:
    text = normalize_text(unit["text_exact"])
    return {
        "source_text": text,
        "normalized_text": build_normalized_requirement(text),
        "modality": detect_modality(text),
        "actor": detect_actor(text),
        "action": None,
        "object": None,
        "deliverable_flag": bool(DELIVERABLE_PATTERN.search(text)),
        "review_flag": unit["unit_type"] == "note",
        "confidence": 0.55,
        "llm_model": llm_model,
        "llm_prompt_version": llm_prompt_version,
    }


def _materialize_extractions(
    *,
    document_id: str,
    filename: str,
    units: list[dict[str, Any]],
    tables: list[dict[str, Any]],
    llm_extractor: Callable[[dict[str, Any]], dict[str, Any]] | None,
    llm_model: str | None,
    llm_prompt_version: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], int, int]:
    requirements: list[dict[str, Any]] = []
    deliverables: list[dict[str, Any]] = []
    reviews: list[dict[str, Any]] = []
    llm_units_flagged = 0
    table_lookup = {table["block_id"]: table for table in tables}
    for unit in units:
        payload = _extract_with_llm_or_fallback(unit, llm_extractor, llm_model, llm_prompt_version)
        if not payload["requirements"] and unit["unit_type"] in {"paragraph", "list_item", "note", "table_row"}:
            payload["requirements"] = [_baseline_requirement_from_unit(unit, llm_model, llm_prompt_version)]
        for index, item in enumerate(payload["requirements"]):
            source_block_id = unit["source_block_ids"][0]
            table_context = unit.get("table_context") or {}
            requirement_id = f"{source_block_id}:requirement:{index}"
            review_flag = bool(item.get("review_flag", False))
            if review_flag:
                llm_units_flagged += 1
            requirements.append(
                {
                    "candidate_id": requirement_id,
                    "requirement_id": requirement_id,
                    "document_id": document_id,
                    "section_number": unit["section_number"],
                    "heading_path": unit["heading_path"],
                    "section_path": unit["heading_path"],
                    "section_heading": unit["heading_path"],
                    "requirement_text": item["source_text"],
                    "requirement_text_exact": item["source_text"],
                    "normalized_requirement_text": item["normalized_text"],
                    "requirement_text_normalized": item["normalized_text"],
                    "modality": item.get("modality"),
                    "actor": item.get("actor"),
                    "action": item.get("action"),
                    "object": item.get("object"),
                    "deliverable_flag": bool(item.get("deliverable_flag", False)),
                    "source_block_id": source_block_id,
                    "source_page_start": unit["source_pages"][0] if unit["source_pages"] else None,
                    "source_page_end": unit["source_pages"][-1] if unit["source_pages"] else None,
                    "source_page": unit["source_pages"][0] if unit["source_pages"] else None,
                    "source_table_id": table_context.get("table_id"),
                    "table_id": table_context.get("table_id"),
                    "table_row_id": f"{table_context['table_id']}:row:{table_context['row_index']}" if table_context else None,
                    "table_row_index": table_context.get("row_index"),
                    "table_col_index": None,
                    "extraction_method": f"llm_{unit['unit_type']}",
                    "llm_model": item.get("llm_model") or llm_model,
                    "llm_prompt_version": item.get("llm_prompt_version") or llm_prompt_version,
                    "source_node_ref": source_block_id,
                    "source_text": item["source_text"],
                    "confidence": float(item.get("confidence", 0.7)),
                    "review_flag": review_flag,
                }
            )
        for index, item in enumerate(payload["deliverables"]):
            source_block_id = unit["source_block_ids"][0]
            table_context = unit.get("table_context") or {}
            deliverable_id = f"{source_block_id}:deliverable:{index}"
            deliverables.append(
                {
                    "deliverable_id": deliverable_id,
                    "section_number": unit["section_number"],
                    "heading_path": unit["heading_path"],
                    "section_path": unit["heading_path"],
                    "section_heading": unit["heading_path"],
                    "deliverable_text": item["source_text"],
                    "deliverable_text_exact": item["source_text"],
                    "normalized_deliverable_text": item["normalized_text"],
                    "deliverable_text_normalized": item["normalized_text"],
                    "due_timing": item.get("due_timing"),
                    "format": item.get("format"),
                    "source_block_id": source_block_id,
                    "source_page_start": unit["source_pages"][0] if unit["source_pages"] else None,
                    "source_page_end": unit["source_pages"][-1] if unit["source_pages"] else None,
                    "source_page": unit["source_pages"][0] if unit["source_pages"] else None,
                    "source_table_id": table_context.get("table_id"),
                    "source_node_ref": source_block_id,
                    "confidence": float(item.get("confidence", 0.7)),
                    "review_flag": bool(item.get("review_flag", False)),
                    "extraction_method": f"llm_{unit['unit_type']}",
                }
            )
        for item in payload["review_items"]:
            source_block_id = unit["source_block_ids"][0]
            reviews.append(
                {
                    "review_id": f"{source_block_id}:review:{len(reviews)}",
                    "item_type": unit["unit_type"],
                    "section_number": unit["section_number"],
                    "heading_path": unit["heading_path"],
                    "raw_text": item["raw_text"],
                    "source_block_id": source_block_id,
                    "source_page": unit["source_pages"][0] if unit["source_pages"] else None,
                    "reason": item["reason"],
                    "confidence": float(item.get("confidence", 0.5)),
                    "candidate_id": None,
                    "review_reason": item["reason"],
                    "review_severity": "warning",
                }
            )
    for requirement in requirements:
        if requirement["table_id"] and requirement["table_id"] in table_lookup and requirement["table_row_index"] is not None:
            table = table_lookup[requirement["table_id"]]
            row = (table.get("rows") or [])[requirement["table_row_index"]]
            for index, cell in enumerate(row):
                if TASKING_PATTERN.search(cell) or detect_modality(cell) != "informational":
                    requirement["table_col_index"] = index
                    break
    return requirements, deliverables, reviews, len(units), llm_units_flagged


def parse_pws_document(
    *,
    document_id: str,
    project_id: str,
    filename: str,
    content_sha256: str | None,
    structured_json: str,
    markdown: str | None = None,
    tika_text: str | None = None,
    llm_extractor: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    llm_model: str | None = None,
    llm_prompt_version: str = "pws_req_v1",
) -> dict[str, Any]:
    structured_document = json.loads(structured_json)
    docling_candidate = _build_docling_structure(document_id, project_id, filename, content_sha256, structured_document)
    primary_text, primary_source = _choose_primary_pws_text(markdown, tika_text, docling_candidate["blocks"])
    sliced_candidate = _sectionize_pws_text(document_id, primary_text, primary_source) if primary_text else None
    markdown_candidate = _sectionize_pws_text(document_id, markdown or "", "markdown") if markdown else None
    tika_candidate = _sectionize_pws_text(document_id, tika_text or "", "tika") if tika_text else None
    parse_mode, fallback_reason = _select_parse_mode(
        docling_candidate["metrics"],
        sliced_candidate["metrics"] if sliced_candidate else (markdown_candidate["metrics"] if markdown_candidate else None),
        tika_candidate["metrics"] if tika_candidate else None,
    )
    if sliced_candidate and sliced_candidate["metrics"]["section_count"] > 0 and sliced_candidate["metrics"]["prose_block_count"] > 0:
        if sliced_candidate["source_name"] == "markdown":
            parse_mode, fallback_reason = "hybrid_markdown_fill", "docling_body_signal_low"
        elif sliced_candidate["source_name"] == "tika":
            parse_mode, fallback_reason = "tika_fallback", "docling_and_markdown_body_signal_low"
        elif parse_mode == "manual_review_required":
            parse_mode, fallback_reason = "docling_structural", None

    if parse_mode == "manual_review_required":
        selected = sliced_candidate or markdown_candidate or tika_candidate or docling_candidate
    else:
        selected = sliced_candidate or markdown_candidate or tika_candidate or docling_candidate
    sections = _convert_section_nodes(document_id, project_id, filename, "docling_pws", content_sha256, selected["sections"])
    blocks = selected["blocks"]
    if docling_candidate["tables"]:
        blocks = blocks + [table for table in docling_candidate["tables"] if table not in blocks]

    tables = _link_tables_to_sections(docling_candidate["tables"], sections)
    table_rows: list[dict[str, Any]] = []
    table_cells: list[dict[str, Any]] = []
    for table in tables:
        derived_rows, derived_cells = _build_table_rows_and_cells(table)
        table_rows.extend(derived_rows)
        table_cells.extend(derived_cells)

    final_metrics = dict(selected["metrics"])
    final_metrics["parse_mode_selected"] = parse_mode
    final_metrics["fallback_reason"] = fallback_reason
    final_metrics["section_count"] = len(sections)
    final_metrics["heading_count"] = len(sections)
    final_metrics["orphan_content_count"] = selected["metrics"]["orphan_content_count"]

    llm_enabled = parse_mode != "manual_review_required" and len(sections) > 0 and final_metrics["coverage_ratio"] >= 0.25
    units = _build_llm_units(blocks, tables) if llm_enabled else []
    requirements, deliverables, llm_reviews, llm_units_processed, llm_units_flagged = _materialize_extractions(
        document_id=document_id,
        filename=filename,
        units=units,
        tables=tables,
        llm_extractor=llm_extractor if llm_enabled else None,
        llm_model=llm_model,
        llm_prompt_version=llm_prompt_version,
    )
    reviews: list[dict[str, Any]] = []
    for review in selected["reviews"] + llm_reviews:
        reviews.append(
            {
                "review_id": review["review_id"],
                "document_id": document_id,
                "project_id": project_id,
                "filename": filename,
                "item_type": review.get("item_type"),
                "section_number": review.get("section_number"),
                "heading_path": review.get("heading_path"),
                "raw_text": review.get("raw_text"),
                "source_block_id": review.get("source_block_id"),
                "source_page": review.get("source_page"),
                "candidate_id": review.get("candidate_id"),
                "review_reason": review.get("review_reason") or review.get("reason"),
                "review_severity": review.get("review_severity", "warning"),
                "details": json.dumps(
                    {
                        "reason": review.get("reason") or review.get("review_reason"),
                        "heading_path": review.get("heading_path"),
                        "raw_text": review.get("raw_text"),
                        "confidence": review.get("confidence"),
                    }
                ),
                "reason": review.get("reason") or review.get("review_reason"),
                "confidence": review.get("confidence", 0.6),
            }
        )

    appendix_sections = [section for section in sections if section["tree_kind"] != "MAIN"]
    audit = {
        "document_id": document_id,
        "project_id": project_id,
        "filename": filename,
        "provider": "docling_pws",
        "parse_mode_selected": parse_mode,
        "fallback_reason": fallback_reason,
        "coverage_ratio": final_metrics["coverage_ratio"],
        "section_count": final_metrics["section_count"],
        "heading_count": final_metrics["heading_count"],
        "prose_block_count": final_metrics["prose_block_count"],
        "suspicious_empty_section_count": final_metrics["suspicious_empty_section_count"],
        "orphan_content_count": final_metrics["orphan_content_count"],
        "unassigned_block_count": final_metrics["orphan_content_count"],
        "unassigned_table_count": len([table for table in tables if not table.get("section_number")]),
        "toc_signal_score": final_metrics["toc_signal_score"],
        "body_signal_score": final_metrics["body_signal_score"],
        "requirement_candidate_count": len(requirements),
        "review_count": len(reviews),
        "llm_units_processed": llm_units_processed,
        "llm_units_flagged_for_review": llm_units_flagged,
        "block_count": len(blocks),
        "metrics_json": json.dumps(final_metrics),
    }
    return {
        "provider": "docling_pws",
        "parse_mode_selected": parse_mode,
        "fallback_reason": fallback_reason,
        "blocks": blocks,
        "sections": sections,
        "section_links": selected["section_links"],
        "requirements": requirements,
        "deliverables": deliverables,
        "reviews": reviews,
        "tables": tables,
        "table_rows": table_rows,
        "table_cells": table_cells,
        "appendix_sections": appendix_sections,
        "audit": audit,
    }
