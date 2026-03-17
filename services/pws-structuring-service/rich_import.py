from __future__ import annotations

import re
from typing import Any


DOC_REF_PATTERN = re.compile(r"^#/([a-z_]+)/(\d+)$")
CLASSIFICATION_PREFIX_RE = re.compile(
    r"^\s*\((?:U|C|S|TS|FOUO|U//FOUO|U/FOUO|S//NF|TS//SI//NF)\)\s*",
    re.IGNORECASE,
)
NUMBERED_HEADING_RE = re.compile(
    r"^(?P<number>(?:[A-Za-z]+\s+[A-Z0-9.\-]+|\d+(?:\.\d+)*))\s+(?P<title>.+)$"
)
APPENDIX_PREFIX_RE = re.compile(r"^(APPENDIX|ATTACHMENT|EXHIBIT|CDRL|CLIN|SECTION)\b", re.IGNORECASE)
IMAGE_COLLECTIONS = {"pictures", "picture", "images", "image", "figures", "figure"}
TEXT_COLLECTIONS = {"texts", "text"}
TABLE_COLLECTIONS = {"tables", "table"}
GROUP_COLLECTIONS = {"groups", "group"}
TOKEN_RE = re.compile(r"[A-Za-z0-9]+")


def parse_ref(ref: str) -> tuple[str, int] | None:
    match = DOC_REF_PATTERN.match(ref or "")
    if match is None:
        return None
    return match.group(1), int(match.group(2))


def resolve_ref(structured_document: dict[str, Any], ref: str) -> tuple[str, dict[str, Any]] | None:
    parsed = parse_ref(ref)
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


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "").replace("\r", " ").replace("\n", " ")).strip()


def normalize_heading_text(text: str) -> str:
    cleaned = normalize_text(text)
    return CLASSIFICATION_PREFIX_RE.sub("", cleaned).strip()


def slugify_segment(value: Any) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
    return cleaned or "node"


def make_section_id(section_number: Any, section_title: Any) -> str:
    return f"section-{slugify_segment(section_number or section_title)}"


def lexical_tokens(value: Any) -> set[str]:
    text = normalize_heading_text(str(value or "")).lower()
    return {token for token in TOKEN_RE.findall(text) if len(token) > 2 and token not in {"the", "and", "for", "with"}}


def extract_page_span(node: dict[str, Any]) -> tuple[int | None, int | None]:
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
    if not pages:
        return None, None
    return min(pages), max(pages)


def docling_table_rows(table_node: dict[str, Any]) -> list[list[str]]:
    grid = table_node.get("data", {}).get("grid", [])
    rows: list[list[str]] = []
    for row in grid:
        if not isinstance(row, list):
            continue
        normalized_row = [
            normalize_text(cell.get("text", "")) if isinstance(cell, dict) else normalize_text(str(cell))
            for cell in row
        ]
        if any(normalized_row):
            rows.append(normalized_row)
    return rows


def collect_text_from_refs(structured_document: dict[str, Any], refs: list[str], seen: set[str] | None = None) -> list[str]:
    seen = seen or set()
    parts: list[str] = []
    for ref in refs:
        if ref in seen:
            continue
        seen.add(ref)
        resolved = resolve_ref(structured_document, ref)
        if resolved is None:
            continue
        node_type, node = resolved
        if node_type in GROUP_COLLECTIONS:
            child_refs = [child.get("$ref") for child in node.get("children", []) if isinstance(child, dict) and child.get("$ref")]
            parts.extend(collect_text_from_refs(structured_document, child_refs, seen))
            continue
        if node_type in TEXT_COLLECTIONS:
            text = normalize_text(node.get("text", ""))
            if text:
                parts.append(text)
    return parts


def extract_image_caption(structured_document: dict[str, Any], node: dict[str, Any]) -> str:
    explicit_candidates = [
        node.get("caption"),
        node.get("text"),
        node.get("alt_text"),
        node.get("name"),
    ]
    for candidate in explicit_candidates:
        text = normalize_text(str(candidate or ""))
        if text:
            return text
    child_refs = [child.get("$ref") for child in node.get("children", []) if isinstance(child, dict) and child.get("$ref")]
    gathered = collect_text_from_refs(structured_document, child_refs)
    return normalize_text(" ".join(gathered))


def classify_heading(text: str) -> dict[str, Any] | None:
    normalized = normalize_heading_text(text)
    if not normalized:
        return None
    match = NUMBERED_HEADING_RE.match(normalized)
    if match is None:
        return None
    section_number = match.group("number").strip()
    title = match.group("title").strip()
    if not title:
        return None
    if not (section_number[0].isdigit() or APPENDIX_PREFIX_RE.match(section_number)):
        return None
    depth = 1
    if section_number[0].isdigit():
        depth = len(section_number.split("."))
    return {
        "section_number": section_number,
        "section_title": title,
        "depth": min(depth, 6),
    }


def extract_structured_blocks(structured_document: dict[str, Any]) -> list[dict[str, Any]]:
    body = structured_document.get("body", {})
    body_children = body.get("children", [])
    blocks: list[dict[str, Any]] = []
    order = 0

    def visit_ref(ref: str) -> None:
        nonlocal order
        resolved = resolve_ref(structured_document, ref)
        if resolved is None:
            return
        node_type, node = resolved
        if node_type in GROUP_COLLECTIONS:
            for child in node.get("children", []):
                child_ref = child.get("$ref") if isinstance(child, dict) else None
                if child_ref:
                    visit_ref(child_ref)
            return

        page_start, page_end = extract_page_span(node)
        source = {
            "ref": ref,
            "page_start": page_start,
            "page_end": page_end,
        }

        if node_type in TABLE_COLLECTIONS:
            rows = docling_table_rows(node)
            if rows:
                blocks.append(
                    {
                        "block_type": "table",
                        "order": order,
                        "rows": rows,
                        "source": source,
                    }
                )
                order += 1
            return

        if node_type in IMAGE_COLLECTIONS:
            caption = extract_image_caption(structured_document, node)
            blocks.append(
                {
                    "block_type": "image",
                    "order": order,
                    "caption": caption,
                    "source": source,
                }
            )
            order += 1
            return

        if node_type in TEXT_COLLECTIONS:
            text = normalize_text(node.get("text", ""))
            if not text:
                return
            heading = classify_heading(text)
            blocks.append(
                {
                    "block_type": "heading" if heading else "text",
                    "order": order,
                    "text": text,
                    "heading": heading,
                    "source": source,
                }
            )
            order += 1

    for child in body_children:
        child_ref = child.get("$ref") if isinstance(child, dict) else None
        if child_ref:
            visit_ref(child_ref)

    return blocks


def resolve_heading_to_anchor(
    heading: dict[str, Any] | None,
    anchors_by_number: dict[str, dict[str, Any]],
    anchors: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if not heading:
        return None
    section_number = _canonical_section_number(heading.get("section_number"))
    if section_number and section_number in anchors_by_number:
        return anchors_by_number[section_number]
    title_tokens = lexical_tokens(heading.get("section_title"))
    if not title_tokens:
        return None
    best_anchor = None
    best_overlap = 0.0
    for anchor in anchors:
        overlap = lexical_overlap_ratio(title_tokens, anchor.get("title_tokens", set()))
        if overlap > best_overlap:
            best_overlap = overlap
            best_anchor = anchor
    return best_anchor if best_overlap >= 0.75 else None


def markdown_table(rows: list[list[str]]) -> list[str]:
    width = max(len(row) for row in rows)
    padded = [row + [""] * (width - len(row)) for row in rows]
    header = padded[0]
    separator = ["---"] * width
    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(separator) + " |",
    ]
    for row in padded[1:]:
        lines.append("| " + " | ".join(row) + " |")
    return lines


def render_rich_markdown(blocks: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for block in blocks:
        block_type = block["block_type"]
        if block_type == "heading":
            heading = block["heading"]
            hashes = "#" * min(int(heading["depth"]), 6)
            lines.append(f"{hashes} {heading['section_number']} {heading['section_title']}".strip())
            lines.append("")
            continue
        if block_type == "text":
            lines.append(block["text"])
            lines.append("")
            continue
        if block_type == "table":
            lines.extend(markdown_table(block["rows"]))
            lines.append("")
            continue
        if block_type == "image":
            caption = block.get("caption") or "Image"
            ref = block.get("source", {}).get("ref") or "unknown-ref"
            lines.append(f"> [Image] {caption} ({ref})")
            lines.append("")
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines) + "\n"


def _table_markdown_text(rows: list[list[str]]) -> str:
    return "\n".join(markdown_table(rows))


def lexical_overlap_ratio(left: set[str], right: set[str]) -> float:
    left_set = set(left or [])
    right_set = set(right or [])
    if not left_set or not right_set:
        return 0.0
    return len(left_set & right_set) / max(len(right_set), 1)


def flatten_outline_sections(root_sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []

    def visit(node: dict[str, Any], parent_section_number: str | None) -> None:
        section_number = _canonical_section_number(node.get("section_number"))
        if not section_number:
            return
        sections.append(
            {
                "section_number": section_number,
                "section_title": str(node.get("section_title") or "").strip(),
                "depth": int(node.get("depth") or max(1, len(section_number.split(".")))),
                "parent_section_number": parent_section_number,
            }
        )
        for child in node.get("children", []):
            if isinstance(child, dict) and child.get("section_number"):
                visit(child, section_number)

    for root in root_sections:
        if isinstance(root, dict):
            visit(root, None)

    return sections


def _canonical_section_number(value: Any) -> str:
    text = normalize_heading_text(str(value or ""))
    text = re.sub(r"[):.\-]+$", "", text).strip()
    text = re.sub(r"\s+", " ", text)
    return text


def _resolve_section_number(section_number: Any, section_map: dict[str, dict[str, Any]]) -> str | None:
    candidate = _canonical_section_number(section_number)
    if not candidate:
        return None
    if candidate in section_map:
        return candidate
    if candidate[0].isdigit():
        parts = candidate.split(".")
        while len(parts) > 1:
            parts.pop()
            parent_candidate = ".".join(parts)
            if parent_candidate in section_map:
                return parent_candidate
    return None


def build_heading_anchors(root_sections: list[dict[str, Any]], blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    anchors = flatten_outline_sections(root_sections)
    for index, anchor in enumerate(anchors):
        anchor["section_id"] = make_section_id(anchor.get("section_number"), anchor.get("section_title"))
        anchor["title"] = str(anchor.get("section_title") or "").strip()
        anchor["level"] = int(anchor.get("depth") or max(1, len(str(anchor.get("section_number") or "").split("."))))
        anchor["sequence_order"] = index + 1
        anchor["document_order_start"] = None
        anchor["document_order_end"] = None
        anchor["page_start"] = None
        anchor["page_end"] = None
        anchor["title_tokens"] = sorted(lexical_tokens(anchor.get("section_title")))
        anchor["has_rich_heading_match"] = False

    anchors_by_number = {
        _canonical_section_number(anchor.get("section_number")): anchor
        for anchor in anchors
        if _canonical_section_number(anchor.get("section_number"))
    }

    for block in blocks:
        if block.get("block_type") != "heading":
            continue
        anchor = resolve_heading_to_anchor(block.get("heading"), anchors_by_number, anchors)
        if not anchor:
            continue
        if anchor["document_order_start"] is None:
            anchor["document_order_start"] = int(block.get("order") or 0)
        anchor["has_rich_heading_match"] = True
        source = block.get("source") or {}
        if anchor["page_start"] is None and source.get("page_start") is not None:
            anchor["page_start"] = int(source["page_start"])
        if anchor["page_end"] is None and source.get("page_end") is not None:
            anchor["page_end"] = int(source["page_end"])

    known_indexes = [index for index, anchor in enumerate(anchors) if anchor["document_order_start"] is not None]
    if known_indexes:
        first_known = known_indexes[0]
        for index in range(first_known - 1, -1, -1):
            distance = first_known - index
            anchors[index]["document_order_start"] = max(0, int(anchors[first_known]["document_order_start"]) - distance)
            anchors[index]["page_start"] = anchors[first_known]["page_start"]
            anchors[index]["page_end"] = anchors[first_known]["page_end"]
        for current, next_index in zip(known_indexes, known_indexes[1:]):
            gap = next_index - current
            current_start = int(anchors[current]["document_order_start"])
            next_start = int(anchors[next_index]["document_order_start"])
            if gap > 1:
                step = max((next_start - current_start) / gap, 1)
                for offset, index in enumerate(range(current + 1, next_index), start=1):
                    anchors[index]["document_order_start"] = int(round(current_start + step * offset))
                    anchors[index]["page_start"] = anchors[current]["page_start"]
                    anchors[index]["page_end"] = anchors[next_index]["page_end"] or anchors[current]["page_end"]
        last_known = known_indexes[-1]
        for index in range(last_known + 1, len(anchors)):
            distance = index - last_known
            anchors[index]["document_order_start"] = int(anchors[last_known]["document_order_start"]) + distance
            anchors[index]["page_start"] = anchors[last_known]["page_start"]
            anchors[index]["page_end"] = anchors[last_known]["page_end"]
    else:
        for anchor in anchors:
            anchor["document_order_start"] = anchor["sequence_order"]

    for index, anchor in enumerate(anchors):
        next_start = anchors[index + 1]["document_order_start"] if index + 1 < len(anchors) else None
        anchor["document_order_end"] = int(next_start - 1) if isinstance(next_start, int) else None
        if anchor["page_end"] is None:
            next_page = anchors[index + 1]["page_start"] if index + 1 < len(anchors) else None
            anchor["page_end"] = next_page if isinstance(next_page, int) else anchor["page_start"]

    return anchors


def build_object_list(blocks: list[dict[str, Any]], anchors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    anchors_by_number = {
        _canonical_section_number(anchor.get("section_number")): anchor
        for anchor in anchors
        if _canonical_section_number(anchor.get("section_number"))
    }
    objects: list[dict[str, Any]] = []

    for index, block in enumerate(blocks):
        block_type = block.get("block_type")
        if block_type not in {"image", "table"}:
            continue
        before_lines: list[str] = []
        after_lines: list[str] = []
        explicit_anchor = None
        preceding_anchor = None

        for candidate_index in range(index - 1, max(-1, index - 5), -1):
            candidate = blocks[candidate_index]
            if candidate.get("block_type") == "heading" and explicit_anchor is None:
                explicit_anchor = resolve_heading_to_anchor(candidate.get("heading"), anchors_by_number, anchors)
                if explicit_anchor:
                    preceding_anchor = explicit_anchor
                    break
            if candidate.get("block_type") in {"text", "heading"} and len(before_lines) < 2:
                text = candidate.get("text") or ((candidate.get("heading") or {}).get("section_title")) or ""
                if text:
                    before_lines.insert(0, normalize_text(text))

        if preceding_anchor is None:
            for candidate_index in range(index - 1, -1, -1):
                candidate = blocks[candidate_index]
                if candidate.get("block_type") != "heading":
                    continue
                preceding_anchor = resolve_heading_to_anchor(candidate.get("heading"), anchors_by_number, anchors)
                if preceding_anchor:
                    break

        for candidate_index in range(index + 1, min(len(blocks), index + 5)):
            candidate = blocks[candidate_index]
            if candidate.get("block_type") in {"text", "heading"} and len(after_lines) < 2:
                text = candidate.get("text") or ((candidate.get("heading") or {}).get("section_title")) or ""
                if text:
                    after_lines.append(normalize_text(text))

        source = block.get("source") or {}
        objects.append(
            {
                "object_id": f"obj-{block_type}-{block.get('order')}",
                "type": block_type,
                "page": source.get("page_start"),
                "document_order": int(block.get("order") or 0),
                "caption": normalize_text(block.get("caption") or ""),
                "nearby_text_before": " ".join(before_lines).strip(),
                "nearby_text_after": " ".join(after_lines).strip(),
                "rows": block.get("rows") or [],
                "source_ref": source.get("ref"),
                "explicit_anchor_id": explicit_anchor.get("section_id") if explicit_anchor else None,
                "preceding_anchor_id": preceding_anchor.get("section_id") if preceding_anchor else None,
            }
        )

    return objects


def align_objects_to_sections(
    anchors: list[dict[str, Any]],
    objects: list[dict[str, Any]],
    confidence_threshold: float = 0.7,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    anchor_by_id = {anchor["section_id"]: anchor for anchor in anchors}
    decisions: list[dict[str, Any]] = []
    unplaced: list[dict[str, Any]] = []

    for obj in objects:
        attachment = {
            "object_id": obj["object_id"],
            "attached_section_id": None,
            "attachment_confidence": 0.0,
            "attachment_method": "unplaced",
            "debug_reason": "No deterministic attachment candidate met the confidence threshold.",
        }

        explicit_anchor = anchor_by_id.get(obj.get("explicit_anchor_id") or "")
        if explicit_anchor:
            attachment.update(
                {
                    "attached_section_id": explicit_anchor["section_id"],
                    "attachment_confidence": 0.98,
                    "attachment_method": "explicit_heading_context",
                    "debug_reason": f"Matched rich heading context to {explicit_anchor['section_number']} {explicit_anchor['title']}.",
                }
            )
        else:
            preceding_anchor = anchor_by_id.get(obj.get("preceding_anchor_id") or "")
            if preceding_anchor:
                attachment.update(
                    {
                        "attached_section_id": preceding_anchor["section_id"],
                        "attachment_confidence": 0.84,
                        "attachment_method": "nearest_preceding_heading",
                        "debug_reason": f"Used nearest preceding rich heading {preceding_anchor['section_number']} {preceding_anchor['title']}.",
                    }
                )
            else:
                page_window_anchor = None
                page_window_score = 0.0
                for anchor in anchors:
                    if not anchor.get("has_rich_heading_match"):
                        continue
                    start = anchor.get("document_order_start")
                    end = anchor.get("document_order_end")
                    if start is None:
                        continue
                    in_order_window = obj["document_order"] >= int(start) and (
                        end is None or obj["document_order"] <= int(end)
                    )
                    in_page_window = (
                        obj.get("page") is not None
                        and anchor.get("page_start") is not None
                        and anchor.get("page_end") is not None
                        and int(anchor["page_start"]) <= int(obj["page"]) <= int(anchor["page_end"])
                    )
                    score = 0.0
                    if in_order_window:
                        score += 0.72
                    if in_page_window:
                        score += 0.08
                    if score > page_window_score:
                        page_window_anchor = anchor
                        page_window_score = score
                if page_window_anchor and page_window_score >= 0.6:
                    attachment.update(
                        {
                            "attached_section_id": page_window_anchor["section_id"],
                            "attachment_confidence": min(page_window_score, 0.8),
                            "attachment_method": "page_order_window",
                            "debug_reason": f"Object order/page fell inside section window for {page_window_anchor['section_number']} {page_window_anchor['title']}.",
                        }
                    )
                else:
                    object_tokens = lexical_tokens(
                        " ".join(
                            [
                                obj.get("caption") or "",
                                obj.get("nearby_text_before") or "",
                                obj.get("nearby_text_after") or "",
                            ]
                        )
                    )
                    best_anchor = None
                    best_score = 0.0
                    for anchor in anchors:
                        score = lexical_overlap_ratio(object_tokens, anchor.get("title_tokens", set()))
                        if score > best_score:
                            best_score = score
                            best_anchor = anchor
                    if best_anchor and best_score >= 0.5:
                        confidence = min(0.45 + best_score, 0.69)
                        attachment.update(
                            {
                                "attached_section_id": best_anchor["section_id"],
                                "attachment_confidence": confidence,
                                "attachment_method": "lexical_overlap",
                                "debug_reason": f"Caption/nearby text overlapped with section title tokens for {best_anchor['section_number']} {best_anchor['title']}.",
                            }
                        )

        if float(attachment["attachment_confidence"]) < confidence_threshold:
            attachment["attached_section_id"] = None
            attachment["attachment_method"] = "unplaced"
            attachment["debug_reason"] = f"{attachment['debug_reason']} Confidence below threshold {confidence_threshold:.2f}."
            unplaced.append(obj)

        decisions.append({**obj, **attachment})

    return decisions, unplaced


def _find_section_node(root_sections: list[dict[str, Any]], target_section_id: str) -> dict[str, Any] | None:
    stack = list(root_sections)
    while stack:
        node = stack.pop()
        if not isinstance(node, dict):
            continue
        if make_section_id(node.get("section_number"), node.get("section_title")) == target_section_id:
            return node
        stack.extend(child for child in node.get("children", []) if isinstance(child, dict) and child.get("section_number"))
    return None


def attach_aligned_objects_to_outline(root_sections: list[dict[str, Any]], decisions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    attached_counts: dict[str, int] = {}
    for decision in decisions:
        target_section_id = decision.get("attached_section_id")
        if not target_section_id:
            continue
        section_node = _find_section_node(root_sections, target_section_id)
        if not section_node:
            continue
        attached_counts[target_section_id] = attached_counts.get(target_section_id, 0) + 1
        object_index = attached_counts[target_section_id]
        if decision.get("type") == "table":
            section_node.setdefault("children", []).append(
                {
                    "type": "table_text",
                    "id": f"{target_section_id}.rt{object_index}",
                    "text_exact": _table_markdown_text(decision.get("rows") or []),
                    "table_rows": decision.get("rows") or [],
                    "attachment_confidence": decision.get("attachment_confidence"),
                    "attachment_method": decision.get("attachment_method"),
                    "debug_reason": decision.get("debug_reason"),
                    "children": [],
                }
            )
        elif decision.get("type") == "image":
            caption = normalize_text(decision.get("caption") or "Image")
            source_ref = decision.get("source_ref")
            text = f"[Image] {caption}" if not source_ref else f"[Image] {caption} ({source_ref})"
            section_node.setdefault("children", []).append(
                {
                    "type": "image",
                    "id": f"{target_section_id}.ri{object_index}",
                    "text_exact": text,
                    "caption": caption,
                    "source_ref": source_ref,
                    "attachment_confidence": decision.get("attachment_confidence"),
                    "attachment_method": decision.get("attachment_method"),
                    "debug_reason": decision.get("debug_reason"),
                    "children": [],
                }
            )
    return root_sections


def build_merged_outline(
    sections: list[dict[str, Any]],
    blocks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    section_map: dict[str, dict[str, Any]] = {}
    roots: list[dict[str, Any]] = []

    for section in sections:
        section_number = _canonical_section_number(section.get("section_number"))
        if not section_number:
            continue
        node = {
            "section_number": section_number,
            "section_title": str(section.get("section_title") or "").strip(),
            "depth": int(section.get("depth") or max(1, len(section_number.split(".")))),
            "markdown_level": int(section.get("depth") or max(1, len(section_number.split(".")))),
            "children": [],
            "parent_section_number": section.get("parent_section_number"),
        }
        section_map[section_number] = node

    for section in sections:
        section_number = _canonical_section_number(section.get("section_number"))
        if not section_number or section_number not in section_map:
            continue
        parent_number = _canonical_section_number(section.get("parent_section_number"))
        if parent_number and parent_number in section_map:
            section_map[parent_number]["children"].append(section_map[section_number])
        else:
            roots.append(section_map[section_number])

    current_section_number: str | None = None
    seen_recognized_section = False
    paragraph_counters: dict[str, int] = {}
    table_counters: dict[str, int] = {}
    image_counters: dict[str, int] = {}

    for block in blocks:
        block_type = block.get("block_type")
        if block_type == "heading":
            heading = block.get("heading") or {}
            resolved_section_number = _resolve_section_number(heading.get("section_number"), section_map)
            if resolved_section_number:
                current_section_number = resolved_section_number
                seen_recognized_section = True
            elif not seen_recognized_section:
                current_section_number = None
            continue

        if current_section_number is None or current_section_number not in section_map:
            continue

        section_node = section_map[current_section_number]
        if block_type == "text":
            paragraph_counters[current_section_number] = paragraph_counters.get(current_section_number, 0) + 1
            section_node["children"].append(
                {
                    "type": "paragraph",
                    "id": f"{current_section_number}.p{paragraph_counters[current_section_number]}",
                    "text_exact": str(block.get("text") or "").strip(),
                    "children": [],
                }
            )
            continue

        if block_type == "table":
            table_counters[current_section_number] = table_counters.get(current_section_number, 0) + 1
            rows = block.get("rows") or []
            section_node["children"].append(
                {
                    "type": "table_text",
                    "id": f"{current_section_number}.t{table_counters[current_section_number]}",
                    "text_exact": _table_markdown_text(rows),
                    "table_rows": rows,
                    "children": [],
                }
            )
            continue

        if block_type == "image":
            image_counters[current_section_number] = image_counters.get(current_section_number, 0) + 1
            caption = str(block.get("caption") or "Image").strip()
            source = block.get("source") or {}
            ref = str(source.get("ref") or "").strip()
            text = f"[Image] {caption}".strip() if not ref else f"[Image] {caption} ({ref})".strip()
            section_node["children"].append(
                {
                    "type": "image",
                    "id": f"{current_section_number}.img{image_counters[current_section_number]}",
                    "text_exact": text,
                    "caption": caption,
                    "source_ref": ref or None,
                    "children": [],
                }
            )

    return roots
