import re
from typing import Any


TOKEN_PATTERN = re.compile(r"[a-z0-9]{3,}")
SECTION_REF_PATTERN = re.compile(r"\b(?:section|sections)\s+(\d+(?:\.\d+)*)", re.IGNORECASE)
APPENDIX_REF_PATTERN = re.compile(r"\bappendix(?:es)?\s+([A-Z](?:\s*[,-]\s*[A-Z])*)", re.IGNORECASE)
STOPWORDS = {
    "the",
    "and",
    "for",
    "that",
    "with",
    "this",
    "from",
    "shall",
    "must",
    "will",
    "are",
    "not",
    "all",
    "any",
    "into",
    "their",
    "have",
    "has",
    "provide",
    "provides",
    "provided",
    "use",
    "using",
    "required",
    "requirement",
    "requirements",
    "contractor",
    "government",
}
NEGATIVE_FILENAME_TERMS = ("pricing", "template", "resume", "boe", "oci", "small business")
POSITIVE_FILENAME_TERMS = ("pws", "appendix", "section l", "section m", "cdrl")


def tokenize(text: str) -> list[str]:
    return [token for token in TOKEN_PATTERN.findall((text or "").lower()) if token not in STOPWORDS]


def normalize_text(text: str) -> str:
    return " ".join((text or "").lower().split())


def extract_section_refs(text: str) -> set[str]:
    return {match.group(1) for match in SECTION_REF_PATTERN.finditer(text or "")}


def extract_appendix_refs(text: str) -> set[str]:
    refs: set[str] = set()
    for match in APPENDIX_REF_PATTERN.finditer(text or ""):
        for token in re.split(r"\s*[,-]\s*", match.group(1).strip()):
            token = token.strip().upper()
            if token:
                refs.add(token)
    return refs


def filename_weight(filename: str) -> int:
    lower_name = (filename or "").lower()
    weight = 0
    if any(term in lower_name for term in POSITIVE_FILENAME_TERMS):
        weight += 5
    if any(term in lower_name for term in NEGATIVE_FILENAME_TERMS):
        weight -= 8
    return weight


def appendix_match_score(appendix_refs: set[str], row: dict[str, Any]) -> tuple[int, str | None]:
    if not appendix_refs:
        return 0, None
    haystack = " ".join(
        [
            str(row.get("filename") or ""),
            str(row.get("section_heading") or ""),
            str(row.get("heading_path") or ""),
        ]
    ).upper()
    for appendix in sorted(appendix_refs):
        if f"APPENDIX {appendix}" in haystack or f"APPENDIX_{appendix}" in haystack:
            return 10, f"appendix {appendix}"
    return 0, None


def section_ref_score(section_refs: set[str], row: dict[str, Any]) -> tuple[int, str | None]:
    if not section_refs:
        return 0, None
    section_number = str(row.get("section_number") or "")
    if not section_number:
        return 0, None
    if section_number in section_refs:
        return 14, f"section {section_number}"
    for ref in section_refs:
        if section_number.startswith(f"{ref}.") or ref.startswith(f"{section_number}."):
            return 6, f"section family {ref}"
    return 0, None


def build_source_requirement(
    requirements: list[dict[str, Any]],
    source_requirement_id: str | None = None,
    source_text: str | None = None,
) -> dict[str, Any] | None:
    if source_requirement_id:
        for row in requirements:
            if row.get("id") == source_requirement_id:
                return row
    if source_text:
        return {
            "id": "ad-hoc-source",
            "document_id": None,
            "filename": "Ad hoc source",
            "section_number": "",
            "section_heading": "",
            "heading_path": "",
            "requirement_text": source_text,
            "normalized_requirement_text": source_text,
            "modality": None,
            "actor": None,
            "action": None,
            "object_text": None,
        }
    return None


def score_requirement_match(
    source_row: dict[str, Any],
    candidate_row: dict[str, Any],
    query_text: str | None = None,
) -> tuple[float, list[str]]:
    reasons: list[str] = []
    source_text = str(source_row.get("normalized_requirement_text") or source_row.get("requirement_text") or "")
    candidate_text = str(candidate_row.get("normalized_requirement_text") or candidate_row.get("requirement_text") or "")
    source_tokens = tokenize(source_text)
    candidate_tokens = tokenize(candidate_text)
    query_tokens = tokenize(query_text or source_text)

    if not candidate_tokens:
        return 0.0, reasons

    overlap = sorted(set(query_tokens).intersection(candidate_tokens))
    score = float(len(overlap) * 4)
    if overlap:
        reasons.append(f"shared terms: {', '.join(overlap[:5])}")

    source_overlap = sorted(set(source_tokens).intersection(candidate_tokens))
    score += float(len(source_overlap))

    if source_row.get("modality") and source_row.get("modality") == candidate_row.get("modality"):
        score += 2
        reasons.append(f"same modality: {candidate_row.get('modality')}")
    if source_row.get("actor") and source_row.get("actor") == candidate_row.get("actor"):
        score += 2
        reasons.append(f"same actor: {candidate_row.get('actor')}")
    if source_row.get("action") and source_row.get("action") == candidate_row.get("action"):
        score += 3
        reasons.append(f"same action: {candidate_row.get('action')}")

    source_object = tokenize(str(source_row.get("object_text") or ""))
    candidate_object = tokenize(str(candidate_row.get("object_text") or ""))
    object_overlap = sorted(set(source_object).intersection(candidate_object))
    score += float(len(object_overlap) * 3)
    if object_overlap:
        reasons.append(f"shared object terms: {', '.join(object_overlap[:4])}")

    source_refs = extract_section_refs(query_text or source_text)
    ref_score, ref_reason = section_ref_score(source_refs, candidate_row)
    score += ref_score
    if ref_reason:
        reasons.append(ref_reason)

    appendix_refs = extract_appendix_refs(query_text or source_text)
    appendix_score, appendix_reason = appendix_match_score(appendix_refs, candidate_row)
    score += appendix_score
    if appendix_reason:
        reasons.append(appendix_reason)

    file_bias = filename_weight(str(candidate_row.get("filename") or ""))
    score += file_bias
    if file_bias > 0:
        reasons.append("priority document")
    elif file_bias < 0:
        reasons.append("administrative template")

    if source_row.get("section_number") and source_row.get("section_number") == candidate_row.get("section_number"):
        score += 1
    if source_row.get("filename") and source_row.get("filename") == candidate_row.get("filename"):
        score += 1

    return score, reasons


def requirement_lookup_key(row: dict[str, Any]) -> tuple[str, str, str]:
    return (
        normalize_text(str(row.get("filename") or "")),
        normalize_text(str(row.get("section_number") or "")),
        normalize_text(str(row.get("requirement_text") or row.get("body_text") or "")),
    )


def merge_semantic_hits(
    requirements: list[dict[str, Any]],
    lexical_rows: list[dict[str, Any]],
    semantic_matches: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    if not semantic_matches:
        return lexical_rows

    requirement_by_key = {requirement_lookup_key(row): row for row in requirements}
    lexical_by_id = {str(row.get("requirement_id") or ""): row for row in lexical_rows}

    for rank, match in enumerate(semantic_matches):
        key = requirement_lookup_key(match)
        requirement_row = requirement_by_key.get(key)
        if requirement_row is None:
            continue
        requirement_id = str(requirement_row.get("id") or "")
        semantic_boost = 18.0 - float(rank)
        if requirement_id in lexical_by_id:
            lexical_by_id[requirement_id]["score"] = float(lexical_by_id[requirement_id]["score"]) + semantic_boost
            lexical_by_id[requirement_id]["match_reason"] = (
                lexical_by_id[requirement_id]["match_reason"] + "; semantic match"
            ).strip("; ")
            continue

        lexical_rows.append(
            {
                "requirement_id": requirement_id,
                "document_id": requirement_row.get("document_id"),
                "filename": requirement_row.get("filename"),
                "section_number": requirement_row.get("section_number"),
                "section_heading": requirement_row.get("section_heading"),
                "heading_path": requirement_row.get("heading_path"),
                "requirement_text": requirement_row.get("requirement_text"),
                "normalized_requirement_text": requirement_row.get("normalized_requirement_text"),
                "modality": requirement_row.get("modality"),
                "actor": requirement_row.get("actor"),
                "action": requirement_row.get("action"),
                "object_text": requirement_row.get("object_text"),
                "score": semantic_boost,
                "match_reason": "semantic match",
            }
        )
    return lexical_rows


def search_related_requirements(
    requirements: list[dict[str, Any]],
    source_requirement_id: str | None = None,
    source_text: str | None = None,
    query_text: str | None = None,
    limit: int = 20,
    semantic_matches: list[dict[str, Any]] | None = None,
    source_filename: str | None = None,
) -> dict[str, Any]:
    source_row = build_source_requirement(requirements, source_requirement_id, source_text)
    if source_row is None:
        raise ValueError("A valid source requirement or source text is required")

    scored_rows: list[dict[str, Any]] = []
    for row in requirements:
        if source_requirement_id and row.get("id") == source_requirement_id:
            continue
        if source_filename and normalize_text(str(row.get("filename") or "")) == normalize_text(source_filename):
            continue
        score, reasons = score_requirement_match(source_row, row, query_text=query_text)
        if score <= 0:
            continue
        scored_rows.append(
            {
                "requirement_id": row.get("id"),
                "document_id": row.get("document_id"),
                "filename": row.get("filename"),
                "section_number": row.get("section_number"),
                "section_heading": row.get("section_heading"),
                "heading_path": row.get("heading_path"),
                "requirement_text": row.get("requirement_text"),
                "normalized_requirement_text": row.get("normalized_requirement_text"),
                "modality": row.get("modality"),
                "actor": row.get("actor"),
                "action": row.get("action"),
                "object_text": row.get("object_text"),
                "score": score,
                "match_reason": "; ".join(reasons[:3]) if reasons else "text overlap",
            }
        )

    scored_rows = merge_semantic_hits(requirements, scored_rows, semantic_matches)
    scored_rows.sort(
        key=lambda item: (
            -float(item["score"]),
            -filename_weight(str(item.get("filename") or "")),
            str(item.get("filename") or ""),
            str(item.get("requirement_id") or ""),
        )
    )
    deduped: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for row in scored_rows:
        requirement_id = str(row.get("requirement_id") or "")
        if not requirement_id or requirement_id in seen_ids:
            continue
        seen_ids.add(requirement_id)
        deduped.append(row)

    return {
        "source_requirement": {
            "requirement_id": source_row.get("id"),
            "document_id": source_row.get("document_id"),
            "filename": source_row.get("filename"),
            "section_number": source_row.get("section_number"),
            "section_heading": source_row.get("section_heading"),
            "heading_path": source_row.get("heading_path"),
            "requirement_text": source_row.get("requirement_text"),
            "normalized_requirement_text": source_row.get("normalized_requirement_text"),
        },
        "results": deduped[:limit],
    }
