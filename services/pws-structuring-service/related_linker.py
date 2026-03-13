import re
from typing import Any

from outline_view import clean_display_text


APPENDIX_RANGE_PATTERN = re.compile(
    r"\bAppendices?\s+([A-Z])\s*[–-]\s*([A-Z])((?:\s*,?\s*[A-Z])*)(?:\s*(?:and|&)\s*([A-Z]))?",
    re.IGNORECASE,
)
APPENDIX_SINGLE_PATTERN = re.compile(r"\bAppendix\s+([A-Z])\b", re.IGNORECASE)
SECTION_REF_PATTERN = re.compile(r"\bsections?\s+(\d+(?:\.\d+)*)\b", re.IGNORECASE)
WORD_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9/&-]{2,}")
STOP_WORDS = {
    "the",
    "and",
    "for",
    "that",
    "with",
    "this",
    "from",
    "must",
    "shall",
    "provide",
    "support",
    "section",
    "sections",
    "appendix",
    "appendices",
    "contractor",
    "requirements",
    "required",
    "base",
    "idiq",
    "pws",
    "iaw",
    "each",
    "listed",
    "under",
}


def normalize_words(text: str) -> set[str]:
    words = {token.lower() for token in WORD_PATTERN.findall(clean_display_text(text))}
    return {word for word in words if word not in STOP_WORDS}


def expand_letter_range(start: str, end: str) -> list[str]:
    start_ord = ord(start.upper())
    end_ord = ord(end.upper())
    if end_ord < start_ord:
        start_ord, end_ord = end_ord, start_ord
    return [chr(value) for value in range(start_ord, end_ord + 1)]


def extract_appendix_refs(text: str) -> list[str]:
    refs: list[str] = []
    for match in APPENDIX_RANGE_PATTERN.finditer(text):
        refs.extend(expand_letter_range(match.group(1), match.group(2)))
        refs.extend(re.findall(r"[A-Z]", match.group(3) or ""))
        if match.group(4):
            refs.append(match.group(4).upper())
    for match in APPENDIX_SINGLE_PATTERN.finditer(text):
        refs.append(match.group(1).upper())
    deduped: list[str] = []
    for ref in refs:
        if ref not in deduped:
            deduped.append(ref)
    return deduped


def derive_document_tags(filename: str) -> set[str]:
    text = clean_display_text(filename).upper()
    tags: set[str] = set()
    appendix_match = re.search(r"APPENDIX[_\s-]*([A-Z])", text)
    if appendix_match:
        tags.add(f"APPENDIX {appendix_match.group(1)}")
    if "IDIQ" in text and "PWS" in text:
        tags.add("BASE IDIQ PWS")
    return tags


def collect_section_records(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for node in nodes:
        if "section_number" not in node:
            continue
        paragraphs: list[str] = []
        bullets: list[str] = []
        for child in node.get("children", []):
            if child.get("type") == "paragraph":
                paragraph_text = clean_display_text(child.get("text_exact", ""))
                if paragraph_text:
                    paragraphs.append(paragraph_text)
                for grand in child.get("children", []):
                    if grand.get("type") == "bullet":
                        bullet_text = clean_display_text(grand.get("text_exact", ""))
                        if bullet_text:
                            bullets.append(bullet_text)
        records.append(
            {
                "section_number": node["section_number"],
                "section_title": clean_display_text(node.get("section_title", "")),
                "paragraphs": paragraphs,
                "bullets": bullets,
            }
        )
        child_sections = [item for item in node.get("children", []) if isinstance(item, dict) and "section_number" in item]
        records.extend(collect_section_records(child_sections))
    return records


def score_overlap(query_words: set[str], candidate_text: str) -> float:
    candidate_words = normalize_words(candidate_text)
    if not query_words or not candidate_words:
        return 0.0
    overlap = query_words & candidate_words
    if not overlap:
        return 0.0
    return len(overlap) / len(query_words)


def build_section_match(document: dict[str, Any], section_ref: str, query_words: set[str]) -> dict[str, Any] | None:
    for record in document["sections"]:
        if record["section_number"] != section_ref:
            continue
        supporting = []
        candidates = record["paragraphs"] + record["bullets"]
        scored = sorted(
            (
                {
                    "snippet": text,
                    "score": round(score_overlap(query_words, text), 3),
                }
                for text in candidates
            ),
            key=lambda item: -item["score"],
        )
        for item in scored:
            if item["score"] <= 0:
                continue
            supporting.append(item["snippet"])
            if len(supporting) >= 3:
                break
        if not supporting and record["paragraphs"]:
            supporting.append(record["paragraphs"][0])
        return {
            "relationship": "governing_section",
            "source_document": document["filename"],
            "cited_section": section_ref,
            "source_title": record["section_title"],
            "supporting_snippets": supporting[:3],
        }
    return None


def build_appendix_match(document: dict[str, Any], appendix_ref: str, query_words: set[str]) -> dict[str, Any] | None:
    if f"APPENDIX {appendix_ref}" not in document["tags"]:
        return None
    candidates: list[tuple[str, str, float]] = []
    for record in document["sections"]:
        for text in record["paragraphs"] + record["bullets"]:
            score = score_overlap(query_words, text)
            if score <= 0:
                continue
            candidates.append((record["section_number"], text, score))
    candidates.sort(key=lambda item: -item[2])
    supporting = []
    seen_sections: list[str] = []
    for section_number, text, _score in candidates:
        supporting.append({"section_number": section_number, "snippet": text})
        if section_number not in seen_sections:
            seen_sections.append(section_number)
        if len(supporting) >= 2:
            break
    if not supporting and document["sections"]:
        first = document["sections"][0]
        snippet = first["paragraphs"][0] if first["paragraphs"] else first["section_title"]
        supporting.append({"section_number": first["section_number"], "snippet": snippet})
        seen_sections.append(first["section_number"])
    if not supporting:
        return None
    return {
        "relationship": "referenced_appendix",
        "source_document": document["filename"],
        "cited_section": f"APPENDIX {appendix_ref}",
        "source_title": document["sections"][0]["section_title"] if document["sections"] else "",
        "supporting_snippets": supporting,
    }


def build_related_links(
    primary_filename: str,
    primary_outline: list[dict[str, Any]],
    supporting_documents: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    del primary_filename
    corpus = [
        {
            "filename": document["filename"],
            "tags": derive_document_tags(document["filename"]),
            "sections": collect_section_records(document["outline"]),
        }
        for document in supporting_documents
    ]
    links: dict[str, list[dict[str, Any]]] = {}

    def visit(nodes: list[dict[str, Any]]) -> None:
        for node in nodes:
            if "section_number" in node:
                visit(node.get("children", []))
                continue
            if node.get("type") != "paragraph":
                continue
            paragraph_id = node.get("id")
            if not isinstance(paragraph_id, str):
                continue
            text = clean_display_text(node.get("text_exact", ""))
            query_words = normalize_words(text)
            section_refs = SECTION_REF_PATTERN.findall(text)
            appendix_refs = extract_appendix_refs(text)
            paragraph_links: list[dict[str, Any]] = []

            for section_ref in section_refs:
                for document in corpus:
                    if "BASE IDIQ PWS" not in document["tags"]:
                        continue
                    match = build_section_match(document, section_ref, query_words)
                    if match is not None:
                        paragraph_links.append(match)

            for appendix_ref in appendix_refs:
                for document in corpus:
                    match = build_appendix_match(document, appendix_ref, query_words)
                    if match is not None:
                        paragraph_links.append(match)

            if paragraph_links:
                links[paragraph_id] = paragraph_links

    visit(primary_outline)
    return links
