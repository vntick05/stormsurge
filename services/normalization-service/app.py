import io
import json
import os
import re
import csv
import hashlib
import uuid
from urllib import request as urllib_request
from urllib.error import URLError, HTTPError
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import psycopg
from docling.datamodel.base_models import DocumentStream
from docling.document_converter import DocumentConverter
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from minio import Minio
from psycopg.rows import dict_row
from pydantic import BaseModel, Field
from canonical_artifacts import build_structured_document_artifact
from pws_parser import is_likely_pws_document, parse_pws_document
from related_requirement_search import search_related_requirements
from xlsx_export import build_pws_hierarchy_workbook, build_workbook


NORMALIZATION_SERVICE_PORT = int(os.environ.get("NORMALIZATION_SERVICE_PORT", "8091"))
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "postgres")
POSTGRES_PORT = int(os.environ.get("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.environ["POSTGRES_DB"]
POSTGRES_USER = os.environ["POSTGRES_USER"]
POSTGRES_PASSWORD = os.environ["POSTGRES_PASSWORD"]
MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.environ["MINIO_ACCESS_KEY"]
MINIO_SECRET_KEY = os.environ["MINIO_SECRET_KEY"]
MINIO_BUCKET_RAW = os.environ.get("MINIO_BUCKET_RAW", "raw")
MINIO_BUCKET_NORMALIZED = os.environ.get("MINIO_BUCKET_NORMALIZED", "normalized")
MINIO_BUCKET_PARSED = os.environ.get("MINIO_BUCKET_PARSED", "parsed")
NORMALIZATION_PROVIDER = os.environ.get("NORMALIZATION_PROVIDER", "docling")
PWS_LLM_BASE_URL = os.environ.get("PWS_LLM_BASE_URL", "http://host.docker.internal:8355/v1").rstrip("/")
RETRIEVAL_SERVICE_BASE_URL = os.environ.get("RETRIEVAL_SERVICE_BASE_URL", "http://retrieval-service:8381").rstrip("/")
PWS_LLM_MODEL = os.environ.get("PWS_LLM_MODEL", "openai/gpt-oss-120b")
PWS_LLM_TIMEOUT_SECONDS = float(os.environ.get("PWS_LLM_TIMEOUT_SECONDS", "120"))
PWS_LLM_PROMPT_VERSION = os.environ.get("PWS_LLM_PROMPT_VERSION", "pws_req_v1")
IGNORED_NORMALIZATION_FILENAMES = {"project.json"}

converter: DocumentConverter | None = None
minio_client: Minio | None = None
MULTISPACE_PATTERN = re.compile(r"[ \t]{2,}")
HEADING_REF_PATTERN = re.compile(r"^([A-Z]{1,3}\.\d+(?:\.\d+)*\.?)\s*(.*)$")
SECTION_PATTERN = re.compile(r"^(SECTION\s+[A-Z0-9IVX.\-]+)\s*[-.:]?\s*(.*)$", re.IGNORECASE)
REQUIREMENT_SENTENCE_SPLIT_PATTERN = re.compile(r"(?<=[.!?])\s+(?=[A-Z(])")
DOC_REF_PATTERN = re.compile(r"^#/([a-z_]+)/(\d+)$")
REQUIREMENT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("submission", re.compile(r"\b(shall submit|must submit|proposal shall|offeror(?:'s)? proposal shall|shall include|required to submit)\b", re.IGNORECASE)),
    ("instruction", re.compile(r"\b(shall|must|required|are expected to|is responsible for|will provide)\b", re.IGNORECASE)),
    ("evaluation", re.compile(r"\b(will evaluate|evaluation factor|evaluation criteria|best value|rated as|pass/fail)\b", re.IGNORECASE)),
    ("security", re.compile(r"\b(clearance|classified|security|SCI|SAP|personnel security)\b", re.IGNORECASE)),
    ("deliverable", re.compile(r"\b(deliverable|CDRL|milestone|schedule|roadmap)\b", re.IGNORECASE)),
]
EXPORT_KEYWORD_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("shall", re.compile(r"\bshall\b", re.IGNORECASE)),
    ("must", re.compile(r"\bmust\b", re.IGNORECASE)),
    ("required", re.compile(r"\b(required|required to|is required to)\b", re.IGNORECASE)),
    ("submit", re.compile(r"\b(submit|submission|submitted)\b", re.IGNORECASE)),
    ("provide", re.compile(r"\b(provide|provided|providing)\b", re.IGNORECASE)),
    ("deliver", re.compile(r"\b(deliver|delivery|deliverable)\b", re.IGNORECASE)),
    ("maintain", re.compile(r"\bmaintain\b", re.IGNORECASE)),
    ("comply", re.compile(r"\b(comply|compliance)\b", re.IGNORECASE)),
    ("will", re.compile(r"\bwill\b", re.IGNORECASE)),
]
LINE_SPLIT_PATTERN = re.compile(r"\n+")
FILENAME_SLUG_PATTERN = re.compile(r"[^a-z0-9]+")
MARKDOWN_HEADING_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"^#+\s+(.+)$"),
    re.compile(r"^(\d+(?:\.\d+)*)\s+(.+)$"),
    re.compile(r"^\*\*(.+?)\*\*$"),
    re.compile(r"^([A-Z][A-Z0-9 /(),.&:-]{6,120})$"),
]
SUBMISSION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("due_date", re.compile(r"\b(due|deadline|no later than|submit(?:ted)? by|proposal submission schedule)\b", re.IGNORECASE)),
    ("format", re.compile(r"\b(format|electronic|volume|page limit|font|microsoft office|pdf|excel)\b", re.IGNORECASE)),
    ("attachment", re.compile(r"\b(attach(?:ment)?|annex|appendix|template|form|resume|questionnaire|pricing)\b", re.IGNORECASE)),
    ("content", re.compile(r"\b(shall submit|must submit|proposal shall|offeror(?:'s)? proposal shall|shall include|required to submit|provide a draft|submit a)\b", re.IGNORECASE)),
    ("security", re.compile(r"\b(unclassified|classified|clearance|scif|sci)\b", re.IGNORECASE)),
]


def postgres_dsn() -> str:
    return (
        f"host={POSTGRES_HOST} port={POSTGRES_PORT} dbname={POSTGRES_DB} "
        f"user={POSTGRES_USER} password={POSTGRES_PASSWORD}"
    )


def get_converter() -> DocumentConverter:
    global converter
    if converter is None:
        converter = DocumentConverter()
    return converter


def get_minio_client() -> Minio:
    global minio_client
    if minio_client is None:
        minio_client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=False,
        )
    return minio_client


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def export_structured_payload(document: Any) -> str | None:
    if hasattr(document, "export_to_dict"):
        return json.dumps(document.export_to_dict())
    if hasattr(document, "model_dump"):
        return json.dumps(document.model_dump())
    if hasattr(document, "export_to_json"):
        payload = document.export_to_json()
        return payload if isinstance(payload, str) else json.dumps(payload)
    return None


def normalize_inline_text(text: str) -> str:
    return MULTISPACE_PATTERN.sub(" ", text.replace("\n", " ")).strip()


def heading_level(reference: str) -> int:
    normalized = reference.rstrip(".")
    if normalized.startswith("SECTION "):
        return 0
    prefix, _, suffix = normalized.partition(".")
    if not suffix:
        return 1
    return 1 + suffix.count(".") + 1


def is_upper_heading(line: str) -> bool:
    letters = [char for char in line if char.isalpha()]
    if len(letters) < 6 or len(line) > 140:
        return False
    uppercase_ratio = sum(1 for char in letters if char.isupper()) / len(letters)
    return uppercase_ratio > 0.85


def parse_heading(paragraph: str) -> tuple[str, str, str] | None:
    first_line, *_ = paragraph.split("\n", 1)
    section_match = SECTION_PATTERN.match(first_line)
    if section_match:
        reference = section_match.group(1).upper()
        title = section_match.group(2).strip() or reference
        return reference, title, paragraph

    ref_match = HEADING_REF_PATTERN.match(first_line)
    if ref_match:
        reference = ref_match.group(1).rstrip(".")
        title = ref_match.group(2).strip() or reference
        return reference, title, paragraph

    if is_upper_heading(first_line):
        reference = first_line.upper()
        title = first_line
        return reference, title, paragraph

    return None


def parse_docling_ref(ref: str) -> tuple[str, int] | None:
    match = DOC_REF_PATTERN.match(ref)
    if match is None:
        return None
    return match.group(1), int(match.group(2))


def docling_table_to_text(table_node: dict[str, Any]) -> str:
    grid = table_node.get("data", {}).get("grid", [])
    lines: list[str] = []
    for row in grid:
        cells = [normalize_inline_text(cell.get("text", "")) for cell in row]
        non_empty = [cell for cell in cells if cell]
        if non_empty:
            lines.append(" | ".join(non_empty))
    return "\n".join(lines).strip()


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


def extract_docling_items(structured_document: dict[str, Any]) -> list[dict[str, Any]]:
    body = structured_document.get("body", {})
    body_children = body.get("children", [])
    items: list[dict[str, Any]] = []

    def visit_ref(ref: str) -> None:
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
        if node_type == "text":
            text = normalize_inline_text(node.get("text", ""))
            if not text:
                return
            formatting = node.get("formatting") or {}
            items.append(
                {
                    "kind": "text",
                    "text": text,
                    "label": node.get("label", "text"),
                    "bold": bool(formatting.get("bold")),
                }
            )
            return
        if node_type == "table":
            table_text = docling_table_to_text(node)
            if table_text:
                items.append({"kind": "table", "text": table_text})

    for child in body_children:
        child_ref = child.get("$ref")
        if child_ref:
            visit_ref(child_ref)
    return items


def is_docling_heading(item: dict[str, Any]) -> bool:
    if item.get("kind") != "text":
        return False
    normalized = item.get("text", "").strip()
    if not normalized or all(char in ".-_:*|/\\()[]{}" for char in normalized):
        return False
    word_count = len(normalized.split())
    parsed_heading = parse_heading(normalized)
    if parsed_heading is not None:
        _, title, _ = parsed_heading
        clean_title = title.strip(" .:-")
        if not clean_title:
            return False
        return len(normalized) <= 120 and word_count <= 18
    if word_count > 18 or len(normalized) > 120:
        return False
    return bool(item.get("bold"))


def split_requirement_sentences(text: str) -> list[str]:
    normalized = normalize_inline_text(text)
    if not normalized:
        return []
    return [sentence.strip() for sentence in REQUIREMENT_SENTENCE_SPLIT_PATTERN.split(normalized) if sentence.strip()]


def classify_requirement(sentence: str) -> str | None:
    for label, pattern in REQUIREMENT_PATTERNS:
        if pattern.search(sentence):
            return label
    return None


def extract_requirement_records(section: dict[str, str]) -> list[dict[str, str]]:
    requirements: list[dict[str, str]] = []
    for sentence_index, sentence in enumerate(split_requirement_sentences(section["body"])):
        requirement_type = classify_requirement(sentence)
        if requirement_type is None:
            continue
        requirements.append(
            {
                "requirement_index": str(sentence_index),
                "requirement_type": requirement_type,
                "requirement_text": sentence,
                "section_path": section["section_path"],
                "section_heading": section["section_heading"],
            }
        )
    return requirements


def classify_export_keyword(text: str) -> str | None:
    for label, pattern in EXPORT_KEYWORD_PATTERNS:
        if pattern.search(text):
            return label
    return None


def normalize_pws_area(section_path: str, section_heading: str) -> str:
    if section_path and section_path != "DOCUMENT":
        return section_path
    if section_heading and section_heading != "Document Body":
        return section_heading
    return "DOCUMENT"


def build_sentence_export_rows(
    *,
    project_id: str,
    filename: str,
    provider: str,
    source_kind: str,
    section_path: str,
    section_heading: str,
    text: str,
    content_sha256: str | None,
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    pws_area = normalize_pws_area(section_path, section_heading)
    for sentence in split_requirement_sentences(text):
        keyword = classify_export_keyword(sentence)
        if keyword is None:
            continue
        rows.append(
            {
                "project_id": project_id,
                "source_document": filename,
                "pws_area": pws_area,
                "section_path": section_path,
                "section_heading": section_heading,
                "source_kind": source_kind,
                "requirement_type": classify_requirement(sentence) or "requirement_statement",
                "trigger_keyword": keyword,
                "requirement_text": sentence,
                "content_sha256": content_sha256 or "",
                "provider": provider,
            }
        )
    return rows


def build_table_export_rows(
    *,
    project_id: str,
    filename: str,
    provider: str,
    section_path: str,
    section_heading: str,
    text: str,
    content_sha256: str | None,
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    pws_area = normalize_pws_area(section_path, section_heading)
    for raw_line in LINE_SPLIT_PATTERN.split(text):
        line = normalize_inline_text(raw_line)
        if not line:
            continue
        keyword = classify_export_keyword(line)
        if keyword is None:
            continue
        rows.append(
            {
                "project_id": project_id,
                "source_document": filename,
                "pws_area": pws_area,
                "section_path": section_path,
                "section_heading": section_heading,
                "source_kind": "table",
                "requirement_type": classify_requirement(line) or "table_requirement",
                "trigger_keyword": keyword,
                "requirement_text": line,
                "content_sha256": content_sha256 or "",
                "provider": provider,
            }
        )
    return rows


def dedupe_export_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    deduped: list[dict[str, str]] = []
    seen: set[tuple[str, ...]] = set()
    for row in rows:
        key = (
            row["source_document"],
            row["pws_area"],
            row["source_kind"],
            row["trigger_keyword"],
            row["requirement_text"],
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    deduped.sort(key=lambda row: (row["source_document"], row["pws_area"], row["source_kind"], row["requirement_text"]))
    return deduped


def parse_markdown_heading(line: str) -> str | None:
    for pattern in MARKDOWN_HEADING_PATTERNS:
        match = pattern.match(line)
        if not match:
            continue
        if match.lastindex:
            return " ".join(group for group in match.groups() if group).strip("* ").strip()
        return line.strip("* ").strip()
    return None


def build_markdown_export_rows(
    *,
    project_id: str,
    filename: str,
    provider: str,
    normalized_markdown: str,
    content_sha256: str | None,
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    current_area = "DOCUMENT"
    pending: list[str] = []

    for raw_line in normalized_markdown.splitlines():
        line = normalize_inline_text(raw_line)
        if not line:
            pending.clear()
            continue

        heading = parse_markdown_heading(line)
        if heading:
            current_area = heading
            pending.clear()
            continue

        pending.append(line)
        buffer = " ".join(pending)
        parts = re.split(r"(?<=[.!?])\s+", buffer)
        keep: list[str] = []
        for part in parts:
            sentence = part.strip()
            if not sentence:
                continue
            keyword = classify_export_keyword(sentence)
            if keyword is not None:
                rows.append(
                    {
                        "project_id": project_id,
                        "source_document": filename,
                        "pws_area": current_area,
                        "section_path": current_area,
                        "section_heading": current_area,
                        "source_kind": "markdown_sentence",
                        "requirement_type": classify_requirement(sentence) or "requirement_statement",
                        "trigger_keyword": keyword,
                        "requirement_text": sentence,
                        "content_sha256": content_sha256 or "",
                        "provider": provider,
                    }
                )
            elif sentence.endswith((".", "!", "?")):
                continue
            else:
                keep.append(sentence)
        pending = keep[-1:] if keep else []

    return rows


def collect_project_requirement_export_rows(project_id: str, filename_pattern: str | None = None) -> list[dict[str, str]]:
    clauses: list[str] = ["project_id = %(project_id)s"]
    params: dict[str, Any] = {"project_id": project_id}
    if filename_pattern:
        clauses.append("filename ILIKE %(filename_pattern)s")
        params["filename_pattern"] = filename_pattern
    where_clause = " AND ".join(clauses)

    sections_sql = f"""
    SELECT project_id, filename, provider, content_sha256, section_path, section_heading, body_text
    FROM document_sections
    WHERE {where_clause}
    ORDER BY filename, section_index
    """
    tables_sql = f"""
    SELECT project_id, filename, provider, content_sha256, section_path, section_heading, body_text
    FROM document_tables
    WHERE {where_clause}
    ORDER BY filename, table_index
    """
    requirements_sql = f"""
    SELECT project_id, filename, provider, content_sha256, section_path, section_heading, requirement_type, requirement_text
    FROM document_requirements
    WHERE {where_clause}
    ORDER BY filename, section_index, requirement_index
    """
    markdown_sql = f"""
    SELECT project_id, filename, provider, content_sha256, normalized_markdown
    FROM document_normalizations
    WHERE {where_clause}
      AND normalization_status = 'normalized'
      AND normalized_markdown IS NOT NULL
    ORDER BY filename, updated_at DESC
    """

    rows: list[dict[str, str]] = []
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        section_records = conn.execute(sections_sql, params).fetchall()
        table_records = conn.execute(tables_sql, params).fetchall()
        requirement_records = conn.execute(requirements_sql, params).fetchall()
        markdown_records = conn.execute(markdown_sql, params).fetchall()

    for record in section_records:
        rows.extend(
            build_sentence_export_rows(
                project_id=record["project_id"],
                filename=record["filename"],
                provider=record["provider"],
                source_kind="section",
                section_path=record["section_path"],
                section_heading=record["section_heading"],
                text=record["body_text"],
                content_sha256=record["content_sha256"],
            )
        )

    for record in table_records:
        rows.extend(
            build_table_export_rows(
                project_id=record["project_id"],
                filename=record["filename"],
                provider=record["provider"],
                section_path=record["section_path"],
                section_heading=record["section_heading"],
                text=record["body_text"],
                content_sha256=record["content_sha256"],
            )
        )

    for record in requirement_records:
        keyword = classify_export_keyword(record["requirement_text"]) or "classified"
        rows.append(
            {
                "project_id": record["project_id"],
                "source_document": record["filename"],
                "pws_area": normalize_pws_area(record["section_path"], record["section_heading"]),
                "section_path": record["section_path"],
                "section_heading": record["section_heading"],
                "source_kind": "requirement_record",
                "requirement_type": record["requirement_type"],
                "trigger_keyword": keyword,
                "requirement_text": record["requirement_text"],
                "content_sha256": record["content_sha256"] or "",
                "provider": record["provider"],
            }
        )

    for record in markdown_records:
        rows.extend(
            build_markdown_export_rows(
                project_id=record["project_id"],
                filename=record["filename"],
                provider=record["provider"],
                normalized_markdown=record["normalized_markdown"],
                content_sha256=record["content_sha256"],
            )
        )

    return dedupe_export_rows(rows)


def export_rows_to_csv(rows: list[dict[str, str]]) -> str:
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "project_id",
            "source_document",
            "pws_area",
            "section_path",
            "section_heading",
            "source_kind",
            "requirement_type",
            "trigger_keyword",
            "requirement_text",
            "provider",
            "content_sha256",
        ],
    )
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


class RequirementExportRequest(BaseModel):
    project_id: str = Field(min_length=1)
    filename_pattern: str | None = Field(default=None, description="Optional SQL ILIKE pattern, e.g. %PWS%")


class SubmissionRequirementRequest(BaseModel):
    project_id: str = Field(min_length=1)
    filename_pattern: str | None = Field(default=None, description="Optional SQL ILIKE pattern, e.g. %Section L%")


def build_structured_records_from_docling(structured_json: str) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    structured_document = json.loads(structured_json)
    items = extract_docling_items(structured_document)
    if not items:
        return [], []

    sections: list[dict[str, str]] = []
    tables: list[dict[str, str]] = []
    heading_stack: list[tuple[int, str, str]] = []
    current_body: list[str] = []

    def current_section_context() -> tuple[str, str]:
        section_path = " > ".join(item[1] for item in heading_stack)
        section_heading = " > ".join(item[2] for item in heading_stack)
        return section_path or "DOCUMENT", section_heading or "Document Body"

    def flush_current() -> None:
        if not current_body:
            return
        section_path, section_heading = current_section_context()
        sections.append(
            {
                "section_path": section_path,
                "section_heading": section_heading,
                "body": "\n\n".join(current_body).strip(),
            }
        )
        current_body.clear()

    for item in items:
        if item["kind"] == "table":
            section_path, section_heading = current_section_context()
            tables.append(
                {
                    "section_path": section_path,
                    "section_heading": section_heading,
                    "body": item["text"],
                }
            )
            current_body.append(item["text"])
            continue

        if not is_docling_heading(item):
            current_body.append(item["text"])
            continue

        flush_current()
        parsed_heading = parse_heading(item["text"])
        if parsed_heading is not None:
            reference, title, _ = parsed_heading
        else:
            reference = item["text"].upper()
            title = item["text"]
        level = heading_level(reference)
        while heading_stack and heading_stack[-1][0] >= level:
            heading_stack.pop()
        heading_stack.append((level, reference, title))

    flush_current()
    if not sections:
        section_path, section_heading = current_section_context()
        sections.append(
            {
                "section_path": section_path,
                "section_heading": section_heading,
                "body": "\n\n".join(item["text"] for item in items).strip(),
            }
        )
    return sections, tables


def classify_submission_category(text: str) -> str | None:
    for label, pattern in SUBMISSION_PATTERNS:
        if pattern.search(text):
            return label
    return None


def collect_submission_requirement_rows(project_id: str, filename_pattern: str | None = None) -> list[dict[str, str]]:
    export_rows = collect_project_requirement_export_rows(
        project_id=project_id,
        filename_pattern=filename_pattern,
    )
    filtered: list[dict[str, str]] = []
    for row in export_rows:
        text = row["requirement_text"]
        category = classify_submission_category(text)
        if row["requirement_type"] == "submission" and category is None:
            category = "content"
        if category is None:
            continue
        enriched = dict(row)
        enriched["submission_category"] = category
        filtered.append(enriched)

    filtered.sort(
        key=lambda row: (
            row["source_document"],
            row["pws_area"],
            row["submission_category"],
            row["requirement_text"],
        )
    )
    return filtered


def export_submission_rows_to_csv(rows: list[dict[str, str]]) -> str:
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "project_id",
            "source_document",
            "pws_area",
            "section_path",
            "section_heading",
            "submission_category",
            "source_kind",
            "requirement_type",
            "trigger_keyword",
            "requirement_text",
            "provider",
            "content_sha256",
        ],
    )
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def export_requirement_candidates_to_csv(rows: list[dict[str, Any]]) -> str:
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "project_id",
            "filename",
            "provider",
            "section_number",
            "section_path",
            "section_heading",
            "heading_path",
            "requirement_text",
            "normalized_requirement_text",
            "modality",
            "actor",
            "action",
            "object_text",
            "deliverable_flag",
            "source_page",
            "source_block_id",
            "source_table_id",
            "extraction_method",
            "llm_model",
            "llm_prompt_version",
            "confidence",
            "review_flag",
        ],
    )
    writer.writeheader()
    for row in rows:
        writer.writerow(
            {
                "project_id": row["project_id"],
                "filename": row["filename"],
                "provider": row["provider"],
                "section_number": row.get("section_number"),
                "section_path": row["section_path"],
                "section_heading": row["section_heading"],
                "heading_path": row.get("heading_path"),
                "requirement_text": row["requirement_text"],
                "normalized_requirement_text": row["normalized_requirement_text"],
                "modality": row.get("modality"),
                "actor": row.get("actor"),
                "action": row.get("action"),
                "object_text": row.get("object_text"),
                "deliverable_flag": row.get("deliverable_flag"),
                "source_page": row.get("source_page"),
                "source_block_id": row["source_block_id"],
                "source_table_id": row.get("source_table_id"),
                "extraction_method": row["extraction_method"],
                "llm_model": row.get("llm_model"),
                "llm_prompt_version": row.get("llm_prompt_version"),
                "confidence": row.get("confidence"),
                "review_flag": row.get("review_flag"),
            }
        )
    return output.getvalue()


def export_reviews_to_csv(rows: list[dict[str, Any]]) -> str:
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "project_id",
            "filename",
            "item_type",
            "section_number",
            "heading_path",
            "raw_text",
            "source_block_id",
            "source_page",
            "candidate_id",
            "review_reason",
            "review_severity",
            "confidence",
            "status",
            "details_json",
        ],
    )
    writer.writeheader()
    for row in rows:
        writer.writerow(
            {
                "project_id": row["project_id"],
                "filename": row["filename"],
                "item_type": row.get("item_type"),
                "section_number": row.get("section_number"),
                "heading_path": row.get("heading_path"),
                "raw_text": row.get("raw_text"),
                "source_block_id": row.get("source_block_id"),
                "source_page": row.get("source_page"),
                "candidate_id": row.get("candidate_id"),
                "review_reason": row["review_reason"],
                "review_severity": row["review_severity"],
                "confidence": row.get("confidence"),
                "status": row["status"],
                "details_json": row.get("details_json"),
            }
        )
    return output.getvalue()


def ensure_schema() -> None:
    ddl = """
    CREATE TABLE IF NOT EXISTS document_normalizations (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_sha256 TEXT,
      provider TEXT NOT NULL,
      normalization_status TEXT NOT NULL,
      normalized_markdown TEXT,
      structured_json TEXT,
      normalized_markdown_object_key TEXT,
      structured_json_object_key TEXT,
      canonical_artifact_object_key TEXT,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_normalizations_document_provider
      ON document_normalizations (document_id, provider);

    CREATE TABLE IF NOT EXISTS document_sections (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      provider TEXT NOT NULL,
      content_sha256 TEXT,
      section_index INTEGER NOT NULL,
      section_path TEXT NOT NULL,
      section_heading TEXT NOT NULL,
      body_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_sections_document_provider_section
      ON document_sections (document_id, provider, section_index);
    CREATE INDEX IF NOT EXISTS idx_document_sections_project
      ON document_sections (project_id, filename, section_index);

    ALTER TABLE document_sections
      ADD COLUMN IF NOT EXISTS section_number TEXT,
      ADD COLUMN IF NOT EXISTS section_title TEXT,
      ADD COLUMN IF NOT EXISTS heading_path TEXT,
      ADD COLUMN IF NOT EXISTS body_text_normalized TEXT,
      ADD COLUMN IF NOT EXISTS extraction_method TEXT,
      ADD COLUMN IF NOT EXISTS source_block_id TEXT,
      ADD COLUMN IF NOT EXISTS parent_section_record_id TEXT,
      ADD COLUMN IF NOT EXISTS page_start INTEGER,
      ADD COLUMN IF NOT EXISTS page_end INTEGER,
      ADD COLUMN IF NOT EXISTS tree_kind TEXT,
      ADD COLUMN IF NOT EXISTS parser_stage TEXT,
      ADD COLUMN IF NOT EXISTS source_node_ref TEXT,
      ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION;

    CREATE TABLE IF NOT EXISTS document_requirements (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      provider TEXT NOT NULL,
      content_sha256 TEXT,
      section_record_id TEXT NOT NULL,
      section_index INTEGER NOT NULL,
      requirement_index INTEGER NOT NULL,
      requirement_type TEXT NOT NULL,
      section_path TEXT NOT NULL,
      section_heading TEXT NOT NULL,
      requirement_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_requirements_document_provider_requirement
      ON document_requirements (document_id, provider, section_index, requirement_index);
    CREATE INDEX IF NOT EXISTS idx_document_requirements_project
      ON document_requirements (project_id, filename, section_index, requirement_index);

    ALTER TABLE document_requirements
      ADD COLUMN IF NOT EXISTS section_number TEXT,
      ADD COLUMN IF NOT EXISTS heading_path TEXT,
      ADD COLUMN IF NOT EXISTS source_block_id TEXT,
      ADD COLUMN IF NOT EXISTS source_page INTEGER,
      ADD COLUMN IF NOT EXISTS source_table_id TEXT,
      ADD COLUMN IF NOT EXISTS source_page_start INTEGER,
      ADD COLUMN IF NOT EXISTS source_page_end INTEGER,
      ADD COLUMN IF NOT EXISTS modality TEXT,
      ADD COLUMN IF NOT EXISTS actor TEXT,
      ADD COLUMN IF NOT EXISTS action TEXT,
      ADD COLUMN IF NOT EXISTS object_text TEXT,
      ADD COLUMN IF NOT EXISTS deliverable_flag BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS normalized_requirement_text TEXT,
      ADD COLUMN IF NOT EXISTS extraction_method TEXT,
      ADD COLUMN IF NOT EXISTS llm_model TEXT,
      ADD COLUMN IF NOT EXISTS llm_prompt_version TEXT,
      ADD COLUMN IF NOT EXISTS source_node_ref TEXT,
      ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS review_flag BOOLEAN DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS document_tables (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      provider TEXT NOT NULL,
      content_sha256 TEXT,
      table_index INTEGER NOT NULL,
      section_path TEXT NOT NULL,
      section_heading TEXT NOT NULL,
      body_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_tables_document_provider_table
      ON document_tables (document_id, provider, table_index);
    CREATE INDEX IF NOT EXISTS idx_document_tables_project
      ON document_tables (project_id, filename, table_index);

    ALTER TABLE document_tables
      ADD COLUMN IF NOT EXISTS section_number TEXT,
      ADD COLUMN IF NOT EXISTS heading_path TEXT,
      ADD COLUMN IF NOT EXISTS table_json TEXT,
      ADD COLUMN IF NOT EXISTS extraction_method TEXT,
      ADD COLUMN IF NOT EXISTS source_block_id TEXT,
      ADD COLUMN IF NOT EXISTS page_start INTEGER,
      ADD COLUMN IF NOT EXISTS page_end INTEGER,
      ADD COLUMN IF NOT EXISTS source_node_ref TEXT,
      ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION;

    CREATE TABLE IF NOT EXISTS document_blocks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      provider TEXT NOT NULL,
      block_type TEXT NOT NULL,
      parent_block_id TEXT,
      document_order INTEGER NOT NULL,
      page_start INTEGER,
      page_end INTEGER,
      raw_text TEXT,
      normalized_text TEXT,
      style_hints_json TEXT,
      numbering_token TEXT,
      heading_level INTEGER,
      section_path TEXT,
      section_heading TEXT,
      parser_stage TEXT NOT NULL,
      source_parser_origin TEXT,
      source_block_ref TEXT,
      source_parent_ref TEXT,
      confidence DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_document_blocks_project
      ON document_blocks (project_id, filename, document_order);

    CREATE TABLE IF NOT EXISTS section_content_links (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      section_record_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      assignment_method TEXT NOT NULL,
      confidence DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_section_content_links_document
      ON section_content_links (document_id, section_record_id);

    CREATE TABLE IF NOT EXISTS requirement_candidates (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      provider TEXT NOT NULL,
      section_path TEXT NOT NULL,
      section_heading TEXT NOT NULL,
      source_block_id TEXT NOT NULL,
      source_page_start INTEGER,
      source_page_end INTEGER,
      modality TEXT,
      actor TEXT,
      requirement_text TEXT NOT NULL,
      normalized_requirement_text TEXT NOT NULL,
      source_text TEXT NOT NULL,
      extraction_method TEXT NOT NULL,
      table_id TEXT,
      table_row_id TEXT,
      table_row_index INTEGER,
      table_col_index INTEGER,
      source_node_ref TEXT,
      confidence DOUBLE PRECISION,
      review_flag BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_requirement_candidates_project
      ON requirement_candidates (project_id, filename);

    ALTER TABLE requirement_candidates
      ADD COLUMN IF NOT EXISTS section_number TEXT,
      ADD COLUMN IF NOT EXISTS heading_path TEXT,
      ADD COLUMN IF NOT EXISTS source_page INTEGER,
      ADD COLUMN IF NOT EXISTS source_table_id TEXT,
      ADD COLUMN IF NOT EXISTS action TEXT,
      ADD COLUMN IF NOT EXISTS object_text TEXT,
      ADD COLUMN IF NOT EXISTS deliverable_flag BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS llm_model TEXT,
      ADD COLUMN IF NOT EXISTS llm_prompt_version TEXT;

    CREATE TABLE IF NOT EXISTS deliverable_candidates (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      provider TEXT NOT NULL,
      section_path TEXT NOT NULL,
      section_heading TEXT NOT NULL,
      source_block_id TEXT NOT NULL,
      section_number TEXT,
      heading_path TEXT,
      source_page INTEGER,
      source_page_start INTEGER,
      source_page_end INTEGER,
      deliverable_text TEXT NOT NULL,
      normalized_deliverable_text TEXT NOT NULL,
      due_timing TEXT,
      format TEXT,
      source_table_id TEXT,
      extraction_method TEXT,
      review_flag BOOLEAN DEFAULT FALSE,
      source_node_ref TEXT,
      confidence DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_deliverable_candidates_project
      ON deliverable_candidates (project_id, filename);

    ALTER TABLE deliverable_candidates
      ADD COLUMN IF NOT EXISTS section_number TEXT,
      ADD COLUMN IF NOT EXISTS heading_path TEXT,
      ADD COLUMN IF NOT EXISTS source_page INTEGER,
      ADD COLUMN IF NOT EXISTS due_timing TEXT,
      ADD COLUMN IF NOT EXISTS format TEXT,
      ADD COLUMN IF NOT EXISTS source_table_id TEXT,
      ADD COLUMN IF NOT EXISTS extraction_method TEXT,
      ADD COLUMN IF NOT EXISTS review_flag BOOLEAN DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS requirement_reviews (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      item_type TEXT,
      section_number TEXT,
      heading_path TEXT,
      raw_text TEXT,
      source_block_id TEXT,
      source_page INTEGER,
      candidate_id TEXT,
      review_reason TEXT NOT NULL,
      review_severity TEXT NOT NULL,
      confidence DOUBLE PRECISION,
      details_json TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_requirement_reviews_project
      ON requirement_reviews (project_id, filename);

    ALTER TABLE requirement_reviews
      ADD COLUMN IF NOT EXISTS item_type TEXT,
      ADD COLUMN IF NOT EXISTS section_number TEXT,
      ADD COLUMN IF NOT EXISTS heading_path TEXT,
      ADD COLUMN IF NOT EXISTS raw_text TEXT,
      ADD COLUMN IF NOT EXISTS source_page INTEGER,
      ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION;

    CREATE TABLE IF NOT EXISTS extracted_table_rows (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      provider TEXT NOT NULL,
      table_id TEXT NOT NULL,
      row_index INTEGER NOT NULL,
      row_text TEXT NOT NULL,
      is_header BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_extracted_table_rows_project
      ON extracted_table_rows (project_id, filename, table_id, row_index);

    CREATE TABLE IF NOT EXISTS extracted_table_cells (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      provider TEXT NOT NULL,
      table_id TEXT NOT NULL,
      row_id TEXT NOT NULL,
      row_index INTEGER NOT NULL,
      col_index INTEGER NOT NULL,
      header_text TEXT,
      cell_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_extracted_table_cells_project
      ON extracted_table_cells (project_id, filename, table_id, row_index, col_index);

    CREATE TABLE IF NOT EXISTS appendix_sections (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      provider TEXT NOT NULL,
      section_record_id TEXT NOT NULL,
      section_path TEXT NOT NULL,
      section_heading TEXT NOT NULL,
      tree_kind TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_appendix_sections_project
      ON appendix_sections (project_id, filename, tree_kind);

    CREATE TABLE IF NOT EXISTS document_audits (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      provider TEXT NOT NULL,
      parse_mode_selected TEXT,
      fallback_reason TEXT,
      section_count INTEGER,
      coverage_ratio DOUBLE PRECISION,
      prose_block_count INTEGER,
      orphan_content_count INTEGER,
      unassigned_block_count INTEGER NOT NULL,
      unassigned_table_count INTEGER NOT NULL,
      suspicious_empty_section_count INTEGER NOT NULL,
      heading_count INTEGER NOT NULL,
      toc_signal_score DOUBLE PRECISION,
      body_signal_score DOUBLE PRECISION,
      block_count INTEGER NOT NULL,
      requirement_candidate_count INTEGER NOT NULL,
      review_count INTEGER NOT NULL,
      llm_units_processed INTEGER,
      llm_units_flagged_for_review INTEGER,
      metrics_json TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_document_audits_project
      ON document_audits (project_id, filename);

    ALTER TABLE document_audits
      ADD COLUMN IF NOT EXISTS parse_mode_selected TEXT,
      ADD COLUMN IF NOT EXISTS fallback_reason TEXT,
      ADD COLUMN IF NOT EXISTS section_count INTEGER,
      ADD COLUMN IF NOT EXISTS prose_block_count INTEGER,
      ADD COLUMN IF NOT EXISTS orphan_content_count INTEGER,
      ADD COLUMN IF NOT EXISTS toc_signal_score DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS body_signal_score DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS llm_units_processed INTEGER,
      ADD COLUMN IF NOT EXISTS llm_units_flagged_for_review INTEGER;
    """
    with psycopg.connect(postgres_dsn()) as conn:
        with conn.cursor() as cur:
            cur.execute(ddl)
        conn.commit()


def latest_documents(project_id: str) -> list[dict[str, Any]]:
    sql = """
    SELECT DISTINCT ON (filename)
      id,
      project_id,
      filename,
      content_type,
      content_sha256,
      raw_object_key,
      parsed_object_key,
      extraction_status,
      created_at
    FROM documents
    WHERE project_id = %(project_id)s
      AND extraction_status = 'extracted'
      AND filename <> ALL(%(ignored_filenames)s)
    ORDER BY filename, created_at DESC
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        rows = conn.execute(
            sql,
            {"project_id": project_id, "ignored_filenames": list(IGNORED_NORMALIZATION_FILENAMES)},
        ).fetchall()
    return [dict(row) for row in rows]


def list_active_projects() -> list[dict[str, Any]]:
    sql = """
    WITH project_rollup AS (
      SELECT
        project_id,
        COUNT(*)::INTEGER AS document_count,
        MAX(created_at) AS latest_document_at
      FROM documents
      WHERE extraction_status = 'extracted'
        AND filename <> ALL(%(ignored_filenames)s)
      GROUP BY project_id
    ),
    project_samples AS (
      SELECT
        project_id,
        ARRAY(
          SELECT sample.filename
          FROM (
            SELECT DISTINCT ON (project_id, filename)
              project_id,
              filename,
              created_at
            FROM documents
            WHERE extraction_status = 'extracted'
              AND filename <> ALL(%(ignored_filenames)s)
            ORDER BY project_id, filename, created_at DESC
          ) sample
          WHERE sample.project_id = dedup.project_id
          ORDER BY sample.created_at DESC, sample.filename ASC
          LIMIT 5
        ) AS sample_filenames
      FROM (
        SELECT DISTINCT ON (project_id, filename)
          project_id,
          filename,
          created_at
        FROM documents
        WHERE extraction_status = 'extracted'
          AND filename <> ALL(%(ignored_filenames)s)
        ORDER BY project_id, filename, created_at DESC
      ) dedup
      GROUP BY project_id
    )
    SELECT
      project_rollup.project_id,
      project_rollup.document_count,
      project_rollup.latest_document_at,
      project_samples.sample_filenames
    FROM project_rollup
    JOIN project_samples USING (project_id)
    ORDER BY project_rollup.latest_document_at DESC, project_rollup.project_id ASC
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        rows = conn.execute(
            sql,
            {"ignored_filenames": list(IGNORED_NORMALIZATION_FILENAMES)},
        ).fetchall()

    projects: list[dict[str, Any]] = []
    for row in rows:
        project = dict(row)
        sample_filenames = [str(item) for item in (project.get("sample_filenames") or []) if item]
        project["sample_filenames"] = sample_filenames
        project["display_name"] = infer_project_display_name(project["project_id"], sample_filenames)
        projects.append(project)
    return projects


def infer_project_display_name(project_id: str, sample_filenames: list[str]) -> str:
    upper_samples = [filename.upper() for filename in sample_filenames]
    if any("STRATA" in filename for filename in upper_samples):
        return "STRATA"
    for filename in sample_filenames:
        stem = re.sub(r"\.[A-Za-z0-9]+$", "", filename).strip()
        if stem:
            return stem[:80]
    return project_id


def latest_normalization(document_id: str) -> dict[str, Any] | None:
    sql = """
    SELECT document_id, content_sha256, normalization_status
    FROM document_normalizations
    WHERE document_id = %(document_id)s
      AND provider = %(provider)s
    ORDER BY updated_at DESC
    LIMIT 1
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        row = conn.execute(
            sql,
            {"document_id": document_id, "provider": NORMALIZATION_PROVIDER},
        ).fetchone()
    return dict(row) if row else None


def load_raw_bytes(raw_object_key: str) -> bytes:
    client = get_minio_client()
    response = client.get_object(MINIO_BUCKET_RAW, raw_object_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def load_parsed_text(parsed_object_key: str | None) -> str | None:
    if not parsed_object_key:
        return None
    client = get_minio_client()
    response = client.get_object(MINIO_BUCKET_PARSED, parsed_object_key)
    try:
        payload = response.read()
    finally:
        response.close()
        response.release_conn()
    return payload.decode("utf-8", errors="replace")


def load_normalized_object(object_key: str | None) -> bytes | None:
    if not object_key:
        return None
    client = get_minio_client()
    response = client.get_object(MINIO_BUCKET_NORMALIZED, object_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def put_normalized_object(object_key: str, content: bytes, content_type: str) -> None:
    client = get_minio_client()
    client.put_object(
        MINIO_BUCKET_NORMALIZED,
        object_key,
        io.BytesIO(content),
        length=len(content),
        content_type=content_type,
    )


def normalize_with_docling(filename: str, content: bytes) -> tuple[str, str | None]:
    source = DocumentStream(name=filename, stream=io.BytesIO(content))
    result = get_converter().convert(source)
    markdown = result.document.export_to_markdown()
    structured_json = export_structured_payload(result.document)
    return markdown, structured_json


def extract_pws_payload(
    *,
    filename: str,
    content: bytes,
    project_id: str,
    document_id: str | None = None,
    tika_text: str | None = None,
) -> dict[str, Any]:
    if not content:
        raise ValueError("PWS content is empty")

    markdown, structured_json = normalize_with_docling(filename, content)
    if not structured_json:
        raise ValueError("Docling did not return structured JSON for this document")
    if not is_likely_pws_document(filename, markdown):
        raise ValueError("Document does not look like a PWS")

    resolved_document_id = document_id or str(uuid.uuid4())
    content_sha256 = hashlib.sha256(content).hexdigest()
    artifacts = parse_pws_document(
        document_id=resolved_document_id,
        project_id=project_id,
        filename=filename,
        content_sha256=content_sha256,
        structured_json=structured_json,
        markdown=markdown,
        tika_text=tika_text,
        llm_extractor=None,
    )
    return {
        "document_id": resolved_document_id,
        "project_id": project_id,
        "filename": filename,
        "content_sha256": content_sha256,
        "provider": artifacts["provider"],
        "normalized_markdown": markdown,
        "docling_structured_document": json.loads(structured_json),
        "pws_extract": artifacts,
    }


def build_pws_llm_extractor() -> Any:
    def extractor(unit: dict[str, Any]) -> dict[str, Any]:
        prompt = {
            "instruction": (
                "Extract atomic requirements and deliverables from one bounded PWS unit. "
                "Do not invent hierarchy or source breadcrumbs. Preserve exact source text. "
                "Return strict JSON with keys requirements, deliverables, review_items."
            ),
            "schema": {
                "requirements": [
                    {
                        "source_text": "exact source clause",
                        "normalized_text": "concise normalized requirement",
                        "modality": "shall|must|will|required|informational",
                        "actor": "contractor|government|cor|pm|co|null",
                        "action": "verb phrase or null",
                        "object": "object phrase or null",
                        "deliverable_flag": False,
                        "review_flag": False,
                        "confidence": 0.0,
                        "llm_model": PWS_LLM_MODEL,
                        "llm_prompt_version": PWS_LLM_PROMPT_VERSION,
                    }
                ],
                "deliverables": [
                    {
                        "source_text": "exact deliverable text",
                        "normalized_text": "normalized deliverable text",
                        "due_timing": None,
                        "format": None,
                        "review_flag": False,
                        "confidence": 0.0,
                    }
                ],
                "review_items": [
                    {
                        "reason": "why review is needed",
                        "raw_text": "exact ambiguous span",
                        "confidence": 0.0,
                    }
                ],
            },
            "unit": unit,
        }
        payload = json.dumps(
            {
                "model": PWS_LLM_MODEL,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": "You extract structured PWS requirements into strict JSON only."},
                    {"role": "user", "content": json.dumps(prompt)},
                ],
            }
        ).encode("utf-8")
        req = urllib_request.Request(
            f"{PWS_LLM_BASE_URL}/chat/completions",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib_request.urlopen(req, timeout=PWS_LLM_TIMEOUT_SECONDS) as response:
                response_payload = json.loads(response.read().decode("utf-8"))
        except (URLError, HTTPError, TimeoutError, json.JSONDecodeError):
            raise
        content = response_payload["choices"][0]["message"]["content"]
        return json.loads(content)

    return extractor


def upsert_normalization_record(
    *,
    document_id: str,
    project_id: str,
    filename: str,
    content_sha256: str | None,
    status: str,
    normalized_markdown: str | None,
    structured_json: str | None,
    normalized_markdown_object_key: str | None,
    structured_json_object_key: str | None,
    canonical_artifact_object_key: str | None,
    error_message: str | None,
) -> None:
    sql = """
    INSERT INTO document_normalizations (
      id,
      document_id,
      project_id,
      filename,
      content_sha256,
      provider,
      normalization_status,
      normalized_markdown,
      structured_json,
      normalized_markdown_object_key,
      structured_json_object_key,
      canonical_artifact_object_key,
      error_message,
      created_at,
      updated_at
    ) VALUES (
      %(id)s,
      %(document_id)s,
      %(project_id)s,
      %(filename)s,
      %(content_sha256)s,
      %(provider)s,
      %(normalization_status)s,
      %(normalized_markdown)s,
      %(structured_json)s,
      %(normalized_markdown_object_key)s,
      %(structured_json_object_key)s,
      %(canonical_artifact_object_key)s,
      %(error_message)s,
      %(created_at)s,
      %(updated_at)s
    )
    ON CONFLICT (document_id, provider)
    DO UPDATE SET
      project_id = EXCLUDED.project_id,
      filename = EXCLUDED.filename,
      content_sha256 = EXCLUDED.content_sha256,
      normalization_status = EXCLUDED.normalization_status,
      normalized_markdown = EXCLUDED.normalized_markdown,
      structured_json = EXCLUDED.structured_json,
      normalized_markdown_object_key = EXCLUDED.normalized_markdown_object_key,
      structured_json_object_key = EXCLUDED.structured_json_object_key,
      canonical_artifact_object_key = EXCLUDED.canonical_artifact_object_key,
      error_message = EXCLUDED.error_message,
      updated_at = EXCLUDED.updated_at
    """
    timestamp = now_utc()
    with psycopg.connect(postgres_dsn()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "id": f"{document_id}:{NORMALIZATION_PROVIDER}",
                    "document_id": document_id,
                    "project_id": project_id,
                    "filename": filename,
                    "content_sha256": content_sha256,
                    "provider": NORMALIZATION_PROVIDER,
                    "normalization_status": status,
                    "normalized_markdown": normalized_markdown,
                    "structured_json": structured_json,
                    "normalized_markdown_object_key": normalized_markdown_object_key,
                    "structured_json_object_key": structured_json_object_key,
                    "canonical_artifact_object_key": canonical_artifact_object_key,
                    "error_message": error_message,
                    "created_at": timestamp,
                    "updated_at": timestamp,
                },
            )
        conn.commit()


def post_json(url: str, payload: dict[str, Any], timeout: float = 60.0) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib_request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib_request.urlopen(req, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return json.loads(response.read().decode(charset))


def fetch_semantic_requirement_matches(project_id: str, query_text: str, top_k: int) -> list[dict[str, Any]]:
    try:
        payload = post_json(
            f"{RETRIEVAL_SERVICE_BASE_URL}/v1/query",
            {
                "project_id": project_id,
                "query": query_text,
                "top_k": top_k,
                "chunk_kind": "requirement",
            },
            timeout=120.0,
        )
        matches = payload.get("matches", [])
        return matches if isinstance(matches, list) else []
    except Exception:
        return []


def replace_document_artifacts(
    *,
    document_id: str,
    project_id: str,
    filename: str,
    content_sha256: str | None,
    sections: list[dict[str, str]],
    tables: list[dict[str, str]],
) -> None:
    timestamp = now_utc()
    section_rows: list[dict[str, Any]] = []
    requirement_rows: list[dict[str, Any]] = []
    table_rows: list[dict[str, Any]] = []

    for section_index, section in enumerate(sections):
        section_id = f"{document_id}:{NORMALIZATION_PROVIDER}:section:{section_index}"
        section_rows.append(
            {
                "id": section_id,
                "document_id": document_id,
                "project_id": project_id,
                "filename": filename,
                "provider": NORMALIZATION_PROVIDER,
                "content_sha256": content_sha256,
                "section_index": section_index,
                "section_number": section.get("section_number", section["section_path"].split(" > ")[-1]),
                "section_title": section.get("section_title", section["section_heading"].split(" > ")[-1]),
                "section_path": section["section_path"],
                "section_heading": section["section_heading"],
                "heading_path": section.get("heading_path", section["section_path"]),
                "body_text": section["body"],
                "body_text_normalized": section.get("body_text_normalized", section["body"]),
                "extraction_method": section.get("extraction_method", "docling_sections"),
                "source_block_id": section.get("source_block_id"),
                "parent_section_record_id": section.get("parent_section_record_id"),
                "page_start": section.get("page_start"),
                "page_end": section.get("page_end"),
                "tree_kind": section.get("tree_kind", "MAIN"),
                "parser_stage": section.get("parser_stage", "docling_sections"),
                "source_node_ref": section.get("source_node_ref"),
                "confidence": section.get("confidence", 1.0),
                "created_at": timestamp,
                "updated_at": timestamp,
            }
        )
        for requirement in extract_requirement_records(section):
            requirement_index = int(requirement["requirement_index"])
            requirement_rows.append(
                {
                    "id": f"{document_id}:{NORMALIZATION_PROVIDER}:requirement:{section_index}:{requirement_index}",
                    "document_id": document_id,
                    "project_id": project_id,
                    "filename": filename,
                    "provider": NORMALIZATION_PROVIDER,
                    "content_sha256": content_sha256,
                    "section_record_id": section_id,
                    "section_index": section_index,
                    "requirement_index": requirement_index,
                    "requirement_type": requirement["requirement_type"],
                    "section_number": section.get("section_number", requirement["section_path"].split(" > ")[-1]),
                    "section_path": requirement["section_path"],
                    "section_heading": requirement["section_heading"],
                    "heading_path": requirement.get("heading_path", requirement["section_path"]),
                    "requirement_text": requirement["requirement_text"],
                    "source_block_id": section.get("source_block_id"),
                    "source_page": section.get("page_start"),
                    "source_table_id": None,
                    "source_page_start": section.get("page_start"),
                    "source_page_end": section.get("page_end"),
                    "modality": requirement["requirement_type"],
                    "actor": None,
                    "action": None,
                    "object_text": None,
                    "deliverable_flag": False,
                    "normalized_requirement_text": requirement["requirement_text"],
                    "extraction_method": "section_sentence_rule",
                    "llm_model": None,
                    "llm_prompt_version": None,
                    "source_node_ref": section.get("source_node_ref"),
                    "confidence": section.get("confidence", 1.0),
                    "review_flag": False,
                    "created_at": timestamp,
                    "updated_at": timestamp,
                }
            )

    for table_index, table in enumerate(tables):
        table_rows.append(
            {
                "id": f"{document_id}:{NORMALIZATION_PROVIDER}:table:{table_index}",
                "document_id": document_id,
                "project_id": project_id,
                "filename": filename,
                "provider": NORMALIZATION_PROVIDER,
                "content_sha256": content_sha256,
                "table_index": table_index,
                "section_number": table.get("section_number", table["section_path"].split(" > ")[-1]),
                "section_path": table["section_path"],
                "section_heading": table["section_heading"],
                "heading_path": table.get("heading_path", table["section_path"]),
                "body_text": table["body"],
                "table_json": table.get("table_json", json.dumps(table.get("rows") or [])),
                "extraction_method": table.get("extraction_method", "docling_table"),
                "source_block_id": table.get("source_block_id"),
                "page_start": table.get("page_start"),
                "page_end": table.get("page_end"),
                "source_node_ref": table.get("source_node_ref"),
                "confidence": table.get("confidence", 1.0),
                "created_at": timestamp,
                "updated_at": timestamp,
            }
        )

    with psycopg.connect(postgres_dsn()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM document_requirements WHERE document_id = %(document_id)s AND provider = %(provider)s",
                {"document_id": document_id, "provider": NORMALIZATION_PROVIDER},
            )
            cur.execute(
                "DELETE FROM document_tables WHERE document_id = %(document_id)s AND provider = %(provider)s",
                {"document_id": document_id, "provider": NORMALIZATION_PROVIDER},
            )
            cur.execute(
                "DELETE FROM document_sections WHERE document_id = %(document_id)s AND provider = %(provider)s",
                {"document_id": document_id, "provider": NORMALIZATION_PROVIDER},
            )

            if section_rows:
                cur.executemany(
                    """
                    INSERT INTO document_sections (
                      id, document_id, project_id, filename, provider, content_sha256,
                      section_index, section_number, section_title, section_path, section_heading, heading_path, body_text, body_text_normalized, extraction_method,
                      source_block_id, parent_section_record_id, page_start, page_end, tree_kind,
                      parser_stage, source_node_ref, confidence, created_at, updated_at
                    ) VALUES (
                      %(id)s, %(document_id)s, %(project_id)s, %(filename)s, %(provider)s, %(content_sha256)s,
                      %(section_index)s, %(section_number)s, %(section_title)s, %(section_path)s, %(section_heading)s, %(heading_path)s, %(body_text)s, %(body_text_normalized)s, %(extraction_method)s,
                      %(source_block_id)s, %(parent_section_record_id)s, %(page_start)s, %(page_end)s, %(tree_kind)s,
                      %(parser_stage)s, %(source_node_ref)s, %(confidence)s, %(created_at)s, %(updated_at)s
                    )
                    """,
                    section_rows,
                )
            if requirement_rows:
                cur.executemany(
                    """
                    INSERT INTO document_requirements (
                      id, document_id, project_id, filename, provider, content_sha256,
                      section_record_id, section_index, requirement_index, requirement_type,
                      section_number, section_path, section_heading, heading_path, requirement_text, source_block_id,
                      source_page, source_table_id, source_page_start, source_page_end, modality, actor, action, object_text, deliverable_flag, normalized_requirement_text,
                      extraction_method, llm_model, llm_prompt_version, source_node_ref, confidence, review_flag, created_at, updated_at
                    ) VALUES (
                      %(id)s, %(document_id)s, %(project_id)s, %(filename)s, %(provider)s, %(content_sha256)s,
                      %(section_record_id)s, %(section_index)s, %(requirement_index)s, %(requirement_type)s,
                      %(section_number)s, %(section_path)s, %(section_heading)s, %(heading_path)s, %(requirement_text)s, %(source_block_id)s,
                      %(source_page)s, %(source_table_id)s, %(source_page_start)s, %(source_page_end)s, %(modality)s, %(actor)s, %(action)s, %(object_text)s, %(deliverable_flag)s, %(normalized_requirement_text)s,
                      %(extraction_method)s, %(llm_model)s, %(llm_prompt_version)s, %(source_node_ref)s, %(confidence)s, %(review_flag)s, %(created_at)s, %(updated_at)s
                    )
                    """,
                    requirement_rows,
                )
            if table_rows:
                cur.executemany(
                    """
                    INSERT INTO document_tables (
                      id, document_id, project_id, filename, provider, content_sha256,
                      table_index, section_number, section_path, section_heading, heading_path, body_text, table_json, extraction_method, source_block_id,
                      page_start, page_end, source_node_ref, confidence, created_at, updated_at
                    ) VALUES (
                      %(id)s, %(document_id)s, %(project_id)s, %(filename)s, %(provider)s, %(content_sha256)s,
                      %(table_index)s, %(section_number)s, %(section_path)s, %(section_heading)s, %(heading_path)s, %(body_text)s, %(table_json)s, %(extraction_method)s, %(source_block_id)s,
                      %(page_start)s, %(page_end)s, %(source_node_ref)s, %(confidence)s, %(created_at)s, %(updated_at)s
                    )
                    """,
                    table_rows,
                )
        conn.commit()


def replace_pws_artifacts(
    *,
    document_id: str,
    project_id: str,
    filename: str,
    artifacts: dict[str, Any],
) -> None:
    timestamp = now_utc()
    provider = artifacts.get("provider", "docling_pws")
    block_rows = [
        {
            "id": block["block_id"],
            "document_id": document_id,
            "project_id": project_id,
            "filename": filename,
            "provider": provider,
            "block_type": block["block_type"],
            "parent_block_id": block.get("parent_block_id"),
            "document_order": block["document_order"],
            "page_start": block.get("page_start"),
            "page_end": block.get("page_end"),
            "raw_text": block.get("raw_text"),
            "normalized_text": block.get("normalized_text"),
            "style_hints_json": json.dumps(block.get("style_hints") or {}),
            "numbering_token": block.get("numbering_token"),
            "heading_level": block.get("heading_level"),
            "section_path": block.get("section_path"),
            "section_heading": block.get("section_heading"),
            "parser_stage": block.get("parser_stage", "pws_dom"),
            "source_parser_origin": block.get("source_parser_origin"),
            "source_block_ref": block.get("source_block_ref"),
            "source_parent_ref": block.get("source_parent_ref"),
            "confidence": block.get("confidence", 1.0),
            "created_at": timestamp,
            "updated_at": timestamp,
        }
        for block in artifacts.get("blocks", [])
    ]
    link_rows = [
        {
            "id": link["link_id"],
            "document_id": document_id,
            "section_record_id": link["section_record_id"],
            "block_id": link["block_id"],
            "assignment_method": link["assignment_method"],
            "confidence": link["confidence"],
            "created_at": timestamp,
        }
        for link in artifacts.get("section_links", [])
    ]
    requirement_rows = [
        {
            "id": row["candidate_id"],
            "document_id": document_id,
            "project_id": project_id,
            "filename": filename,
            "provider": provider,
            "section_number": row.get("section_number"),
            "section_path": row["section_path"],
            "section_heading": row["section_heading"],
            "heading_path": row.get("heading_path", row["section_path"]),
            "source_block_id": row["source_block_id"],
            "source_page": row.get("source_page"),
            "source_table_id": row.get("source_table_id"),
            "source_page_start": row.get("source_page_start"),
            "source_page_end": row.get("source_page_end"),
            "modality": row.get("modality"),
            "actor": row.get("actor"),
            "action": row.get("action"),
            "object_text": row.get("object"),
            "deliverable_flag": row.get("deliverable_flag", False),
            "requirement_text": row["requirement_text"],
            "normalized_requirement_text": row["normalized_requirement_text"],
            "source_text": row["source_text"],
            "extraction_method": row["extraction_method"],
            "llm_model": row.get("llm_model"),
            "llm_prompt_version": row.get("llm_prompt_version"),
            "table_id": row.get("table_id"),
            "table_row_id": row.get("table_row_id"),
            "table_row_index": row.get("table_row_index"),
            "table_col_index": row.get("table_col_index"),
            "source_node_ref": row.get("source_node_ref"),
            "confidence": row.get("confidence", 1.0),
            "review_flag": row.get("review_flag", False),
            "created_at": timestamp,
            "updated_at": timestamp,
        }
        for row in artifacts.get("requirements", [])
    ]
    deliverable_rows = [
        {
            "id": row["deliverable_id"],
            "document_id": document_id,
            "project_id": project_id,
            "filename": filename,
            "provider": provider,
            "section_number": row.get("section_number"),
            "section_path": row["section_path"],
            "section_heading": row["section_heading"],
            "heading_path": row.get("heading_path", row["section_path"]),
            "source_block_id": row["source_block_id"],
            "source_page": row.get("source_page"),
            "source_page_start": row.get("source_page_start"),
            "source_page_end": row.get("source_page_end"),
            "deliverable_text": row["deliverable_text"],
            "normalized_deliverable_text": row["normalized_deliverable_text"],
            "due_timing": row.get("due_timing"),
            "format": row.get("format"),
            "source_table_id": row.get("source_table_id"),
            "extraction_method": row.get("extraction_method"),
            "review_flag": row.get("review_flag", False),
            "source_node_ref": row.get("source_node_ref"),
            "confidence": row.get("confidence", 1.0),
            "created_at": timestamp,
            "updated_at": timestamp,
        }
        for row in artifacts.get("deliverables", [])
    ]
    review_rows = [
        {
            "id": row["review_id"],
            "document_id": document_id,
            "project_id": project_id,
            "filename": filename,
            "item_type": row.get("item_type"),
            "section_number": row.get("section_number"),
            "heading_path": row.get("heading_path"),
            "raw_text": row.get("raw_text"),
            "source_block_id": row.get("source_block_id"),
            "source_page": row.get("source_page"),
            "candidate_id": row.get("candidate_id"),
            "review_reason": row["review_reason"],
            "review_severity": row["review_severity"],
            "confidence": row.get("confidence"),
            "details_json": row.get("details", "{}"),
            "status": "open",
            "created_at": timestamp,
            "updated_at": timestamp,
        }
        for row in artifacts.get("reviews", [])
    ]
    appendix_rows = [
        {
            "id": f"{row['section_record_id']}:appendix",
            "document_id": document_id,
            "project_id": project_id,
            "filename": filename,
            "provider": provider,
            "section_record_id": row["section_record_id"],
            "section_path": row["section_path"],
            "section_heading": row["section_heading"],
            "tree_kind": row["tree_kind"],
            "created_at": timestamp,
            "updated_at": timestamp,
        }
        for row in artifacts.get("appendix_sections", [])
    ]
    table_row_rows = [
        {
            "id": row["row_id"],
            "document_id": document_id,
            "project_id": project_id,
            "filename": filename,
            "provider": provider,
            "table_id": row["table_id"],
            "row_index": row["row_index"],
            "row_text": row["row_text"],
            "is_header": row["is_header"],
            "created_at": timestamp,
            "updated_at": timestamp,
        }
        for row in artifacts.get("table_rows", [])
    ]
    table_cell_rows = [
        {
            "id": row["cell_id"],
            "document_id": document_id,
            "project_id": project_id,
            "filename": filename,
            "provider": provider,
            "table_id": row["table_id"],
            "row_id": row["row_id"],
            "row_index": row["row_index"],
            "col_index": row["col_index"],
            "header_text": row.get("header_text"),
            "cell_text": row["cell_text"],
            "created_at": timestamp,
            "updated_at": timestamp,
        }
        for row in artifacts.get("table_cells", [])
    ]
    audit = artifacts.get("audit")

    with psycopg.connect(postgres_dsn()) as conn:
        with conn.cursor() as cur:
            for table_name in (
                "document_blocks",
                "section_content_links",
                "requirement_candidates",
                "deliverable_candidates",
                "requirement_reviews",
                "extracted_table_rows",
                "extracted_table_cells",
                "appendix_sections",
                "document_audits",
            ):
                cur.execute(f"DELETE FROM {table_name} WHERE document_id = %(document_id)s", {"document_id": document_id})

            if block_rows:
                cur.executemany(
                    """
                    INSERT INTO document_blocks (
                      id, document_id, project_id, filename, provider, block_type, parent_block_id,
                      document_order, page_start, page_end, raw_text, normalized_text, style_hints_json,
                      numbering_token, heading_level, section_path, section_heading, parser_stage,
                      source_parser_origin, source_block_ref, source_parent_ref, confidence, created_at, updated_at
                    ) VALUES (
                      %(id)s, %(document_id)s, %(project_id)s, %(filename)s, %(provider)s, %(block_type)s, %(parent_block_id)s,
                      %(document_order)s, %(page_start)s, %(page_end)s, %(raw_text)s, %(normalized_text)s, %(style_hints_json)s,
                      %(numbering_token)s, %(heading_level)s, %(section_path)s, %(section_heading)s, %(parser_stage)s,
                      %(source_parser_origin)s, %(source_block_ref)s, %(source_parent_ref)s, %(confidence)s, %(created_at)s, %(updated_at)s
                    )
                    """,
                    block_rows,
                )
            if link_rows:
                cur.executemany(
                    """
                    INSERT INTO section_content_links (
                      id, document_id, section_record_id, block_id, assignment_method, confidence, created_at
                    ) VALUES (
                      %(id)s, %(document_id)s, %(section_record_id)s, %(block_id)s, %(assignment_method)s, %(confidence)s, %(created_at)s
                    )
                    """,
                    link_rows,
                )
            if requirement_rows:
                cur.executemany(
                    """
                    INSERT INTO requirement_candidates (
                      id, document_id, project_id, filename, provider, section_number, section_path, section_heading, heading_path,
                      source_block_id, source_page, source_table_id, source_page_start, source_page_end, modality, actor, action, object_text, deliverable_flag, requirement_text,
                      normalized_requirement_text, source_text, extraction_method, llm_model, llm_prompt_version, table_id, table_row_id,
                      table_row_index, table_col_index, source_node_ref, confidence, review_flag, created_at, updated_at
                    ) VALUES (
                      %(id)s, %(document_id)s, %(project_id)s, %(filename)s, %(provider)s, %(section_number)s, %(section_path)s, %(section_heading)s, %(heading_path)s,
                      %(source_block_id)s, %(source_page)s, %(source_table_id)s, %(source_page_start)s, %(source_page_end)s, %(modality)s, %(actor)s, %(action)s, %(object_text)s, %(deliverable_flag)s, %(requirement_text)s,
                      %(normalized_requirement_text)s, %(source_text)s, %(extraction_method)s, %(llm_model)s, %(llm_prompt_version)s, %(table_id)s, %(table_row_id)s,
                      %(table_row_index)s, %(table_col_index)s, %(source_node_ref)s, %(confidence)s, %(review_flag)s, %(created_at)s, %(updated_at)s
                    )
                    """,
                    requirement_rows,
                )
            if deliverable_rows:
                cur.executemany(
                    """
                    INSERT INTO deliverable_candidates (
                      id, document_id, project_id, filename, provider, section_number, section_path, section_heading, heading_path,
                      source_block_id, source_page, source_page_start, source_page_end, deliverable_text,
                      normalized_deliverable_text, due_timing, format, source_table_id, extraction_method, review_flag, source_node_ref, confidence, created_at, updated_at
                    ) VALUES (
                      %(id)s, %(document_id)s, %(project_id)s, %(filename)s, %(provider)s, %(section_number)s, %(section_path)s, %(section_heading)s, %(heading_path)s,
                      %(source_block_id)s, %(source_page)s, %(source_page_start)s, %(source_page_end)s, %(deliverable_text)s,
                      %(normalized_deliverable_text)s, %(due_timing)s, %(format)s, %(source_table_id)s, %(extraction_method)s, %(review_flag)s, %(source_node_ref)s, %(confidence)s, %(created_at)s, %(updated_at)s
                    )
                    """,
                    deliverable_rows,
                )
            if review_rows:
                cur.executemany(
                    """
                    INSERT INTO requirement_reviews (
                      id, document_id, project_id, filename, item_type, section_number, heading_path, raw_text, source_block_id, source_page, candidate_id,
                      review_reason, review_severity, confidence, details_json, status, created_at, updated_at
                    ) VALUES (
                      %(id)s, %(document_id)s, %(project_id)s, %(filename)s, %(item_type)s, %(section_number)s, %(heading_path)s, %(raw_text)s, %(source_block_id)s, %(source_page)s, %(candidate_id)s,
                      %(review_reason)s, %(review_severity)s, %(confidence)s, %(details_json)s, %(status)s, %(created_at)s, %(updated_at)s
                    )
                    """,
                    review_rows,
                )
            if table_row_rows:
                cur.executemany(
                    """
                    INSERT INTO extracted_table_rows (
                      id, document_id, project_id, filename, provider, table_id, row_index, row_text, is_header, created_at, updated_at
                    ) VALUES (
                      %(id)s, %(document_id)s, %(project_id)s, %(filename)s, %(provider)s, %(table_id)s, %(row_index)s, %(row_text)s, %(is_header)s, %(created_at)s, %(updated_at)s
                    )
                    """,
                    table_row_rows,
                )
            if table_cell_rows:
                cur.executemany(
                    """
                    INSERT INTO extracted_table_cells (
                      id, document_id, project_id, filename, provider, table_id, row_id, row_index, col_index,
                      header_text, cell_text, created_at, updated_at
                    ) VALUES (
                      %(id)s, %(document_id)s, %(project_id)s, %(filename)s, %(provider)s, %(table_id)s, %(row_id)s, %(row_index)s, %(col_index)s,
                      %(header_text)s, %(cell_text)s, %(created_at)s, %(updated_at)s
                    )
                    """,
                    table_cell_rows,
                )
            if appendix_rows:
                cur.executemany(
                    """
                    INSERT INTO appendix_sections (
                      id, document_id, project_id, filename, provider, section_record_id,
                      section_path, section_heading, tree_kind, created_at, updated_at
                    ) VALUES (
                      %(id)s, %(document_id)s, %(project_id)s, %(filename)s, %(provider)s, %(section_record_id)s,
                      %(section_path)s, %(section_heading)s, %(tree_kind)s, %(created_at)s, %(updated_at)s
                    )
                    """,
                    appendix_rows,
                )
            if audit is not None:
                cur.execute(
                    """
                    INSERT INTO document_audits (
                      id, document_id, project_id, filename, provider, parse_mode_selected, fallback_reason, section_count, coverage_ratio, prose_block_count, orphan_content_count, unassigned_block_count,
                      unassigned_table_count, suspicious_empty_section_count, heading_count, toc_signal_score, body_signal_score, block_count,
                      requirement_candidate_count, review_count, llm_units_processed, llm_units_flagged_for_review, metrics_json, created_at, updated_at
                    ) VALUES (
                      %(id)s, %(document_id)s, %(project_id)s, %(filename)s, %(provider)s, %(parse_mode_selected)s, %(fallback_reason)s, %(section_count)s, %(coverage_ratio)s, %(prose_block_count)s, %(orphan_content_count)s, %(unassigned_block_count)s,
                      %(unassigned_table_count)s, %(suspicious_empty_section_count)s, %(heading_count)s, %(toc_signal_score)s, %(body_signal_score)s, %(block_count)s,
                      %(requirement_candidate_count)s, %(review_count)s, %(llm_units_processed)s, %(llm_units_flagged_for_review)s, %(metrics_json)s, %(created_at)s, %(updated_at)s
                    )
                    """,
                    {
                        "id": f"{document_id}:{provider}:audit",
                        "document_id": document_id,
                        "project_id": project_id,
                        "filename": filename,
                        "provider": provider,
                        "parse_mode_selected": audit.get("parse_mode_selected"),
                        "fallback_reason": audit.get("fallback_reason"),
                        "section_count": audit.get("section_count"),
                        "coverage_ratio": audit["coverage_ratio"],
                        "prose_block_count": audit.get("prose_block_count"),
                        "orphan_content_count": audit.get("orphan_content_count"),
                        "unassigned_block_count": audit["unassigned_block_count"],
                        "unassigned_table_count": audit["unassigned_table_count"],
                        "suspicious_empty_section_count": audit["suspicious_empty_section_count"],
                        "heading_count": audit["heading_count"],
                        "toc_signal_score": audit.get("toc_signal_score"),
                        "body_signal_score": audit.get("body_signal_score"),
                        "block_count": audit["block_count"],
                        "requirement_candidate_count": audit["requirement_candidate_count"],
                        "review_count": audit["review_count"],
                        "llm_units_processed": audit.get("llm_units_processed"),
                        "llm_units_flagged_for_review": audit.get("llm_units_flagged_for_review"),
                        "metrics_json": audit["metrics_json"],
                        "created_at": timestamp,
                        "updated_at": timestamp,
                    },
                )
        conn.commit()


def delete_pws_artifacts(document_id: str) -> None:
    with psycopg.connect(postgres_dsn()) as conn:
        with conn.cursor() as cur:
            for table_name in (
                "document_blocks",
                "section_content_links",
                "requirement_candidates",
                "deliverable_candidates",
                "requirement_reviews",
                "extracted_table_rows",
                "extracted_table_cells",
                "appendix_sections",
                "document_audits",
            ):
                cur.execute(f"DELETE FROM {table_name} WHERE document_id = %(document_id)s", {"document_id": document_id})
        conn.commit()


def normalize_document_record(document: dict[str, Any], skip_existing: bool) -> dict[str, Any]:
    existing = latest_normalization(document["id"])
    if (
        skip_existing
        and existing
        and existing.get("content_sha256")
        and existing["content_sha256"] == document.get("content_sha256")
        and existing.get("normalization_status") == "normalized"
    ):
        return {
            "document_id": document["id"],
            "filename": document["filename"],
            "status": "skipped",
            "provider": NORMALIZATION_PROVIDER,
        }

    try:
        content = load_raw_bytes(document["raw_object_key"])
        tika_text = load_parsed_text(document.get("parsed_object_key"))
        markdown, structured_json = normalize_with_docling(document["filename"], content)
        sections: list[dict[str, str]] = []
        tables: list[dict[str, str]] = []
        provider = NORMALIZATION_PROVIDER
        pws_artifacts: dict[str, Any] | None = None
        if structured_json:
            if is_likely_pws_document(document["filename"], markdown):
                pws_artifacts = parse_pws_document(
                    document_id=document["id"],
                    project_id=document["project_id"],
                    filename=document["filename"],
                    content_sha256=document.get("content_sha256"),
                    structured_json=structured_json,
                    markdown=markdown,
                    tika_text=tika_text,
                    llm_extractor=build_pws_llm_extractor(),
                    llm_model=PWS_LLM_MODEL,
                    llm_prompt_version=PWS_LLM_PROMPT_VERSION,
                )
                sections = pws_artifacts["sections"]
                tables = [
                    {
                        "section_number": table.get("section_number"),
                        "section_path": table["section_path"],
                        "section_heading": table["section_heading"],
                        "heading_path": table.get("heading_path", table["section_path"]),
                        "body": table["normalized_text"],
                        "table_json": table.get("table_json"),
                        "extraction_method": table.get("extraction_method"),
                        "source_block_id": table["block_id"],
                        "page_start": table.get("page_start"),
                        "page_end": table.get("page_end"),
                        "source_node_ref": table.get("source_block_ref"),
                        "confidence": table.get("confidence", 1.0),
                    }
                    for table in pws_artifacts["tables"]
                ]
                provider = pws_artifacts["provider"]
            else:
                sections, tables = build_structured_records_from_docling(structured_json)
        markdown_key = f"{document['project_id']}/{document['id']}/{NORMALIZATION_PROVIDER}/normalized.md"
        json_key = f"{document['project_id']}/{document['id']}/{NORMALIZATION_PROVIDER}/normalized.json"
        canonical_key = f"{document['project_id']}/{document['id']}/{NORMALIZATION_PROVIDER}/structured_document_v1.json"
        put_normalized_object(markdown_key, markdown.encode("utf-8"), "text/markdown; charset=utf-8")
        if structured_json is not None:
            put_normalized_object(json_key, structured_json.encode("utf-8"), "application/json")
        else:
            json_key = None
        structured_artifact = build_structured_document_artifact(
            document_id=document["id"],
            filename=document["filename"],
            content_sha256=document.get("content_sha256"),
            provider=provider,
            normalized_markdown=markdown,
            sections=sections,
            tables=tables,
            blocks=(pws_artifacts or {}).get("blocks"),
            pws_artifacts=pws_artifacts,
        )
        put_normalized_object(canonical_key, json.dumps(structured_artifact).encode("utf-8"), "application/json")

        upsert_normalization_record(
            document_id=document["id"],
            project_id=document["project_id"],
            filename=document["filename"],
            content_sha256=document.get("content_sha256"),
            status="normalized",
            normalized_markdown=markdown,
            structured_json=structured_json,
            normalized_markdown_object_key=markdown_key,
            structured_json_object_key=json_key,
            canonical_artifact_object_key=canonical_key,
            error_message=None,
        )
        replace_document_artifacts(
            document_id=document["id"],
            project_id=document["project_id"],
            filename=document["filename"],
            content_sha256=document.get("content_sha256"),
            sections=sections,
            tables=tables,
        )
        if pws_artifacts is not None:
            replace_pws_artifacts(
                document_id=document["id"],
                project_id=document["project_id"],
                filename=document["filename"],
                artifacts=pws_artifacts,
            )
            requirement_count = len(pws_artifacts["requirements"])
            review_count = len(pws_artifacts["reviews"])
        else:
            delete_pws_artifacts(document["id"])
            requirement_count = sum(len(extract_requirement_records(section)) for section in sections)
            review_count = 0
        return {
            "document_id": document["id"],
            "filename": document["filename"],
            "status": "normalized",
            "provider": provider,
            "normalized_markdown_object_key": markdown_key,
            "structured_json_object_key": json_key,
            "canonical_artifact_object_key": canonical_key,
            "section_count": len(sections),
            "requirement_count": requirement_count,
            "table_count": len(tables),
            "review_count": review_count,
        }
    except Exception as exc:
        upsert_normalization_record(
            document_id=document["id"],
            project_id=document["project_id"],
            filename=document["filename"],
            content_sha256=document.get("content_sha256"),
            status="failed",
            normalized_markdown=None,
            structured_json=None,
            normalized_markdown_object_key=None,
            structured_json_object_key=None,
            canonical_artifact_object_key=None,
            error_message=str(exc),
        )
        return {
            "document_id": document["id"],
            "filename": document["filename"],
            "status": "failed",
            "provider": NORMALIZATION_PROVIDER,
            "error": str(exc),
        }


class NormalizeProjectRequest(BaseModel):
    project_id: str = Field(min_length=1)
    skip_existing: bool = Field(default=True)


class NormalizeDocumentRequest(BaseModel):
    document_id: str = Field(min_length=1)
    skip_existing: bool = Field(default=True)


class RelatedRequirementSearchRequest(BaseModel):
    source_requirement_id: str | None = None
    source_text: str | None = None
    query_text: str | None = None
    source_filename: str | None = None
    limit: int = Field(default=20, ge=1, le=100)


def fetch_project_sections(project_id: str) -> list[dict[str, Any]]:
    sql = """
    SELECT id, document_id, project_id, filename, provider, content_sha256,
           section_index, section_number, section_title, section_path, section_heading, heading_path,
           body_text, body_text_normalized, page_start, page_end, extraction_method, confidence, updated_at
    FROM document_sections
    WHERE project_id = %(project_id)s
    ORDER BY filename, section_index
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        rows = conn.execute(sql, {"project_id": project_id}).fetchall()
    return [dict(row) for row in rows]


def fetch_structured_artifact_record(project_id: str, document_id: str) -> dict[str, Any] | None:
    sql = """
    SELECT document_id, project_id, filename, provider, canonical_artifact_object_key
    FROM document_normalizations
    WHERE project_id = %(project_id)s
      AND document_id = %(document_id)s
      AND normalization_status = 'normalized'
    ORDER BY updated_at DESC
    LIMIT 1
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        row = conn.execute(sql, {"project_id": project_id, "document_id": document_id}).fetchone()
    return dict(row) if row else None


def fetch_project_requirements(project_id: str) -> list[dict[str, Any]]:
    sql = """
    SELECT id, document_id, project_id, filename, provider, content_sha256,
           section_record_id, section_index, requirement_index, requirement_type,
           section_number, section_path, section_heading, heading_path, requirement_text, normalized_requirement_text,
           modality, actor, action, object_text, deliverable_flag, source_block_id, source_page, source_table_id,
           extraction_method, llm_model, llm_prompt_version, confidence, review_flag, updated_at
    FROM document_requirements
    WHERE project_id = %(project_id)s
    ORDER BY filename, section_index, requirement_index
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        rows = conn.execute(sql, {"project_id": project_id}).fetchall()
    return [dict(row) for row in rows]


def fetch_project_tables(project_id: str) -> list[dict[str, Any]]:
    sql = """
    SELECT id, document_id, project_id, filename, provider, content_sha256,
           table_index, section_number, section_path, section_heading, heading_path, body_text, table_json,
           page_start, page_end, extraction_method, confidence, updated_at
    FROM document_tables
    WHERE project_id = %(project_id)s
    ORDER BY filename, table_index
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        rows = conn.execute(sql, {"project_id": project_id}).fetchall()
    return [dict(row) for row in rows]


def fetch_project_blocks(project_id: str) -> list[dict[str, Any]]:
    sql = """
    SELECT id, document_id, project_id, filename, provider, block_type, parent_block_id,
           document_order, page_start, page_end, raw_text, normalized_text, style_hints_json,
           numbering_token, heading_level, section_path, section_heading, parser_stage,
           source_parser_origin, source_block_ref, source_parent_ref, confidence, updated_at
    FROM document_blocks
    WHERE project_id = %(project_id)s
    ORDER BY filename, document_order
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        rows = conn.execute(sql, {"project_id": project_id}).fetchall()
    return [dict(row) for row in rows]


def fetch_requirement_candidates(project_id: str) -> list[dict[str, Any]]:
    sql = """
    SELECT id, document_id, project_id, filename, provider, section_number, section_path, section_heading, heading_path,
           source_block_id, source_page, source_table_id, source_page_start, source_page_end, modality, actor, action, object_text, deliverable_flag,
           requirement_text, normalized_requirement_text, source_text, extraction_method, llm_model, llm_prompt_version,
           table_id, table_row_id, table_row_index, table_col_index, source_node_ref,
           confidence, review_flag, updated_at
    FROM requirement_candidates
    WHERE project_id = %(project_id)s
    ORDER BY filename, section_path, id
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        rows = conn.execute(sql, {"project_id": project_id}).fetchall()
    return [dict(row) for row in rows]


def fetch_deliverable_candidates(project_id: str) -> list[dict[str, Any]]:
    sql = """
    SELECT id, document_id, project_id, filename, provider, section_number, section_path, section_heading, heading_path,
           source_block_id, source_page, source_page_start, source_page_end, deliverable_text,
           normalized_deliverable_text, due_timing, format, source_table_id, extraction_method, review_flag,
           source_node_ref, confidence, updated_at
    FROM deliverable_candidates
    WHERE project_id = %(project_id)s
    ORDER BY filename, section_path, id
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        rows = conn.execute(sql, {"project_id": project_id}).fetchall()
    return [dict(row) for row in rows]


def fetch_requirement_reviews(project_id: str) -> list[dict[str, Any]]:
    sql = """
    SELECT id, document_id, project_id, filename, item_type, section_number, heading_path, raw_text,
           source_block_id, source_page, candidate_id, review_reason, review_severity, confidence, details_json, status, updated_at
    FROM requirement_reviews
    WHERE project_id = %(project_id)s
    ORDER BY filename, id
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        rows = conn.execute(sql, {"project_id": project_id}).fetchall()
    return [dict(row) for row in rows]


def fetch_document_audits(project_id: str) -> list[dict[str, Any]]:
    sql = """
    SELECT id, document_id, project_id, filename, provider, parse_mode_selected, fallback_reason,
           section_count, coverage_ratio, prose_block_count, orphan_content_count, unassigned_block_count, unassigned_table_count, suspicious_empty_section_count,
           heading_count, toc_signal_score, body_signal_score, block_count, requirement_candidate_count, review_count,
           llm_units_processed, llm_units_flagged_for_review, metrics_json, updated_at
    FROM document_audits
    WHERE project_id = %(project_id)s
    ORDER BY filename, updated_at DESC
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        rows = conn.execute(sql, {"project_id": project_id}).fetchall()
    return [dict(row) for row in rows]


def fetch_appendix_sections(project_id: str) -> list[dict[str, Any]]:
    sql = """
    SELECT id, document_id, project_id, filename, provider, section_record_id,
           section_path, section_heading, tree_kind, updated_at
    FROM appendix_sections
    WHERE project_id = %(project_id)s
    ORDER BY filename, section_path
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        rows = conn.execute(sql, {"project_id": project_id}).fetchall()
    return [dict(row) for row in rows]


def build_pws_excel_workbook(project_id: str) -> bytes:
    sections = fetch_project_sections(project_id)
    requirements = fetch_requirement_candidates(project_id)
    deliverables = fetch_deliverable_candidates(project_id)
    tables = fetch_project_tables(project_id)
    appendices = fetch_appendix_sections(project_id)
    reviews = fetch_requirement_reviews(project_id)
    audits = fetch_document_audits(project_id)
    return build_workbook(
        [
            ("Sections", sections),
            ("Requirements", requirements),
            ("Deliverables", deliverables),
            ("Tables", tables),
            ("Appendices_Attachments", appendices),
            ("Review_Queue", reviews),
            ("Audit", audits),
        ]
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_schema()
    get_minio_client()
    get_converter()
    yield


app = FastAPI(title="Perfect RFP Normalization Service", version="0.1.0", lifespan=lifespan)


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    checks: dict[str, str] = {}

    try:
        with psycopg.connect(postgres_dsn()) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        checks["postgres"] = "ok"
    except Exception as exc:
        checks["postgres"] = f"error: {exc}"

    try:
        client = get_minio_client()
        client.bucket_exists(MINIO_BUCKET_NORMALIZED)
        checks["minio"] = "ok"
    except Exception as exc:
        checks["minio"] = f"error: {exc}"

    try:
        get_converter()
        checks["docling"] = "ok"
    except Exception as exc:
        checks["docling"] = f"error: {exc}"

    ok = all(value == "ok" for value in checks.values())
    return {"status": "ok" if ok else "degraded", "checks": checks, "provider": NORMALIZATION_PROVIDER}


@app.post("/v1/normalize/project")
def normalize_project(request: NormalizeProjectRequest) -> dict[str, Any]:
    documents = latest_documents(request.project_id)
    if not documents:
        raise HTTPException(status_code=404, detail=f"No extracted documents found for project_id={request.project_id}")

    results = [normalize_document_record(document, request.skip_existing) for document in documents]
    return {
        "project_id": request.project_id,
        "provider": NORMALIZATION_PROVIDER,
        "documents_total": len(documents),
        "normalized_count": sum(1 for item in results if item["status"] == "normalized"),
        "skipped_count": sum(1 for item in results if item["status"] == "skipped"),
        "failed_count": sum(1 for item in results if item["status"] == "failed"),
        "results": results,
    }


@app.post("/v1/normalize/document")
def normalize_document(request: NormalizeDocumentRequest) -> dict[str, Any]:
    sql = """
    SELECT id, project_id, filename, content_type, content_sha256, raw_object_key, parsed_object_key, extraction_status
    FROM documents
    WHERE id = %(document_id)s
    LIMIT 1
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        row = conn.execute(sql, {"document_id": request.document_id}).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Document not found: {request.document_id}")
    document = dict(row)
    if document["extraction_status"] != "extracted":
        raise HTTPException(status_code=409, detail=f"Document is not ready for normalization: {request.document_id}")
    return normalize_document_record(document, request.skip_existing)


@app.post("/v1/pws/extract")
async def extract_pws_document(
    project_id: str = Form(...),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    content = await file.read()
    filename = file.filename or "uploaded-pws.bin"
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    try:
        payload = extract_pws_payload(
            filename=filename,
            content=content,
            project_id=project_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return payload


@app.post("/v1/pws/extract.xlsx")
async def extract_pws_document_xlsx(
    project_id: str = Form(...),
    file: UploadFile = File(...),
) -> Response:
    content = await file.read()
    filename = file.filename or "uploaded-pws.bin"
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    try:
        payload = extract_pws_payload(
            filename=filename,
            content=content,
            project_id=project_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    workbook = build_pws_hierarchy_workbook(payload)
    export_name = f"{os.path.splitext(filename)[0]}-hierarchy.xlsx"
    return Response(
        content=workbook,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{export_name}"'},
    )


@app.get("/v1/projects/{project_id}/sections")
def project_sections(project_id: str) -> dict[str, Any]:
    sections = fetch_project_sections(project_id)
    return {"project_id": project_id, "count": len(sections), "sections": sections}


@app.get("/v1/projects")
def projects() -> dict[str, Any]:
    projects = list_active_projects()
    return {"count": len(projects), "projects": projects}


@app.get("/v1/projects/{project_id}/documents/status")
def project_document_status(project_id: str) -> dict[str, Any]:
    sql = """
    WITH latest_normalizations AS (
      SELECT DISTINCT ON (document_id)
        document_id,
        normalization_status,
        error_message,
        updated_at
      FROM document_normalizations
      WHERE provider = %(provider)s
      ORDER BY document_id, updated_at DESC
    )
    SELECT
      d.id AS document_id,
      d.project_id,
      d.filename,
      d.extraction_status,
      d.created_at,
      ln.normalization_status,
      ln.error_message,
      ln.updated_at AS normalization_updated_at
    FROM documents d
    LEFT JOIN latest_normalizations ln
      ON ln.document_id = d.id
    WHERE d.project_id = %(project_id)s
      AND d.extraction_status = 'extracted'
      AND d.filename <> ALL(%(ignored_filenames)s)
    ORDER BY d.filename ASC, d.created_at DESC
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        rows = conn.execute(
            sql,
            {
                "project_id": project_id,
                "provider": NORMALIZATION_PROVIDER,
                "ignored_filenames": list(IGNORED_NORMALIZATION_FILENAMES),
            },
        ).fetchall()

    documents = []
    for row in rows:
        item = dict(row)
        item["normalization_status"] = item.get("normalization_status") or "pending"
        documents.append(item)

    return {"project_id": project_id, "count": len(documents), "documents": documents}


@app.get("/v1/projects/{project_id}/documents/{document_id}/structured-artifact")
def get_structured_artifact(project_id: str, document_id: str) -> dict[str, Any]:
    record = fetch_structured_artifact_record(project_id, document_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"No structured artifact found for document_id={document_id}")
    payload = load_normalized_object(record.get("canonical_artifact_object_key"))
    if payload is None:
        raise HTTPException(status_code=404, detail=f"Structured artifact object missing for document_id={document_id}")
    try:
        return json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Structured artifact decode failed for document_id={document_id}") from exc


@app.get("/v1/projects/{project_id}/status")
def project_status(project_id: str) -> dict[str, Any]:
    totals_sql = """
    SELECT COUNT(*) AS total_documents
    FROM documents
    WHERE project_id = %(project_id)s
    """
    normalization_sql = """
    SELECT
      COUNT(DISTINCT CASE WHEN dn.normalization_status = 'normalized' THEN dn.document_id END) AS normalized_documents,
      COUNT(DISTINCT CASE WHEN dn.normalization_status = 'failed' THEN dn.document_id END) AS failed_documents
    FROM documents d
    LEFT JOIN document_normalizations dn
      ON dn.document_id = d.id
     AND dn.provider = %(provider)s
    WHERE d.project_id = %(project_id)s
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        total_row = conn.execute(totals_sql, {"project_id": project_id}).fetchone()
        normalization_row = conn.execute(
            normalization_sql,
            {"project_id": project_id, "provider": NORMALIZATION_PROVIDER},
        ).fetchone()

    total_documents = int((total_row or {}).get("total_documents") or 0)
    normalized_documents = int((normalization_row or {}).get("normalized_documents") or 0)
    failed_documents = int((normalization_row or {}).get("failed_documents") or 0)
    pending_documents = max(total_documents - normalized_documents - failed_documents, 0)
    return {
        "project_id": project_id,
        "provider": NORMALIZATION_PROVIDER,
        "total_documents": total_documents,
        "normalized_documents": normalized_documents,
        "failed_documents": failed_documents,
        "pending_documents": pending_documents,
    }


@app.get("/v1/projects/{project_id}/requirements")
def project_requirements(project_id: str) -> dict[str, Any]:
    requirements = fetch_project_requirements(project_id)
    return {"project_id": project_id, "count": len(requirements), "requirements": requirements}


@app.post("/v1/projects/{project_id}/requirements/search-related")
def project_search_related_requirements(
    project_id: str, request: RelatedRequirementSearchRequest
) -> dict[str, Any]:
    requirements = fetch_project_requirements(project_id)
    if not requirements:
        raise HTTPException(
            status_code=404,
            detail=f"No normalized requirements found for project_id={project_id}",
        )
    try:
        semantic_matches = fetch_semantic_requirement_matches(
            project_id=project_id,
            query_text=(request.query_text or request.source_text or "").strip(),
            top_k=max(request.limit * 3, 20),
        )
        result = search_related_requirements(
            requirements=requirements,
            source_requirement_id=request.source_requirement_id,
            source_text=request.source_text,
            query_text=request.query_text,
            limit=request.limit,
            semantic_matches=semantic_matches,
            source_filename=request.source_filename,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "project_id": project_id,
        "source_requirement": result["source_requirement"],
        "count": len(result["results"]),
        "results": result["results"],
    }


@app.get("/v1/projects/{project_id}/tables")
def project_tables(project_id: str) -> dict[str, Any]:
    tables = fetch_project_tables(project_id)
    return {"project_id": project_id, "count": len(tables), "tables": tables}


@app.get("/v1/projects/{project_id}/blocks")
def project_blocks(project_id: str) -> dict[str, Any]:
    blocks = fetch_project_blocks(project_id)
    return {"project_id": project_id, "count": len(blocks), "blocks": blocks}


@app.get("/v1/projects/{project_id}/requirement-candidates")
def project_requirement_candidates(project_id: str) -> dict[str, Any]:
    requirements = fetch_requirement_candidates(project_id)
    return {"project_id": project_id, "count": len(requirements), "requirements": requirements}


@app.get("/v1/projects/{project_id}/deliverables")
def project_deliverables(project_id: str) -> dict[str, Any]:
    deliverables = fetch_deliverable_candidates(project_id)
    return {"project_id": project_id, "count": len(deliverables), "deliverables": deliverables}


@app.get("/v1/projects/{project_id}/reviews")
def project_reviews(project_id: str) -> dict[str, Any]:
    reviews = fetch_requirement_reviews(project_id)
    return {"project_id": project_id, "count": len(reviews), "reviews": reviews}


@app.get("/v1/projects/{project_id}/appendices")
def project_appendices(project_id: str) -> dict[str, Any]:
    appendices = fetch_appendix_sections(project_id)
    return {"project_id": project_id, "count": len(appendices), "appendices": appendices}


@app.get("/v1/projects/{project_id}/audits")
def project_audits(project_id: str) -> dict[str, Any]:
    audits = fetch_document_audits(project_id)
    return {"project_id": project_id, "count": len(audits), "audits": audits}


@app.get("/v1/projects/{project_id}/exports/pws-requirements.csv")
def export_pws_requirements_csv(project_id: str) -> Response:
    rows = fetch_requirement_candidates(project_id)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No requirement candidates found for project_id={project_id}")
    filename = f"{project_id}-pws-requirements.csv"
    return Response(
        content=export_requirement_candidates_to_csv(rows),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/v1/projects/{project_id}/exports/pws-review-queue.csv")
def export_pws_review_queue_csv(project_id: str) -> Response:
    rows = fetch_requirement_reviews(project_id)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No review queue rows found for project_id={project_id}")
    filename = f"{project_id}-pws-review-queue.csv"
    return Response(
        content=export_reviews_to_csv(rows),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/v1/projects/{project_id}/exports/pws-extract.xlsx")
def export_pws_extract_xlsx(project_id: str) -> Response:
    workbook = build_pws_excel_workbook(project_id)
    filename = f"{project_id}-pws-extract.xlsx"
    return Response(
        content=workbook,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/v1/exports/requirements")
def export_requirements(request: RequirementExportRequest) -> dict[str, Any]:
    rows = collect_project_requirement_export_rows(
        project_id=request.project_id,
        filename_pattern=request.filename_pattern,
    )
    return {
        "project_id": request.project_id,
        "filename_pattern": request.filename_pattern,
        "count": len(rows),
        "requirements": rows,
    }


@app.get("/v1/projects/{project_id}/exports/requirements.csv")
def export_requirements_csv(project_id: str, filename_pattern: str | None = None) -> Response:
    rows = collect_project_requirement_export_rows(
        project_id=project_id,
        filename_pattern=filename_pattern,
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"No requirement export rows found for project_id={project_id}")

    csv_text = export_rows_to_csv(rows)
    pattern_suffix = ""
    if filename_pattern:
        slug = FILENAME_SLUG_PATTERN.sub("-", filename_pattern.lower()).strip("-")
        if slug:
            pattern_suffix = f"-{slug}"
    filename = f"{project_id}{pattern_suffix}-requirements-export.csv"
    return Response(
        content="\ufeff" + csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/v1/analyses/submission-requirements")
def analyze_submission_requirements(request: SubmissionRequirementRequest) -> dict[str, Any]:
    rows = collect_submission_requirement_rows(
        project_id=request.project_id,
        filename_pattern=request.filename_pattern,
    )
    return {
        "project_id": request.project_id,
        "filename_pattern": request.filename_pattern,
        "count": len(rows),
        "submission_requirements": rows,
    }


@app.get("/v1/projects/{project_id}/analyses/submission-requirements.csv")
def analyze_submission_requirements_csv(project_id: str, filename_pattern: str | None = None) -> Response:
    rows = collect_submission_requirement_rows(
        project_id=project_id,
        filename_pattern=filename_pattern,
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"No submission requirement rows found for project_id={project_id}")

    csv_text = export_submission_rows_to_csv(rows)
    pattern_suffix = ""
    if filename_pattern:
        slug = FILENAME_SLUG_PATTERN.sub("-", filename_pattern.lower()).strip("-")
        if slug:
            pattern_suffix = f"-{slug}"
    filename = f"{project_id}{pattern_suffix}-submission-requirements.csv"
    return Response(
        content="\ufeff" + csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
