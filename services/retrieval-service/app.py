import hashlib
import json
import mimetypes
import os
import re
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
import psycopg
from fastapi import FastAPI, HTTPException
from fastembed import TextEmbedding
from haystack import Pipeline, component
from psycopg.rows import dict_row
from pydantic import BaseModel, Field
from qdrant_client import QdrantClient, models


RETRIEVAL_SERVICE_PORT = int(os.environ.get("RETRIEVAL_SERVICE_PORT", "8381"))
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "postgres")
POSTGRES_PORT = int(os.environ.get("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.environ["POSTGRES_DB"]
POSTGRES_USER = os.environ["POSTGRES_USER"]
POSTGRES_PASSWORD = os.environ["POSTGRES_PASSWORD"]
QDRANT_URL = os.environ.get("QDRANT_URL", "http://qdrant:6333")
QDRANT_COLLECTION = os.environ.get("QDRANT_COLLECTION", "perfect_rfp_chunks")
DOCUMENT_SERVICE_BASE_URL = os.environ.get("DOCUMENT_SERVICE_BASE_URL", "http://document-service:8081").rstrip("/")
NORMALIZATION_SERVICE_BASE_URL = os.environ.get("NORMALIZATION_SERVICE_BASE_URL", "http://normalization-service:8091").rstrip("/")
DEFAULT_DATA_ROOT = os.environ.get("DEFAULT_DATA_ROOT", "/opt/perfect-rfp/data/rfps")
EMBEDDING_PROVIDER = os.environ.get("EMBEDDING_PROVIDER", "fastembed").strip().lower()
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
EMBEDDINGS_BASE_URL = os.environ.get("EMBEDDINGS_BASE_URL", "").rstrip("/")
EMBEDDINGS_API_KEY = os.environ.get("EMBEDDINGS_API_KEY", "")
CHUNK_SIZE_WORDS = int(os.environ.get("CHUNK_SIZE_WORDS", "220"))
CHUNK_OVERLAP_WORDS = int(os.environ.get("CHUNK_OVERLAP_WORDS", "40"))
DEFAULT_TOP_K = int(os.environ.get("DEFAULT_TOP_K", "5"))
EXTRACTION_STATUS = "extracted"
EMBEDDING_WARMUP_TEXT = "perfect rfp retrieval warmup"
IGNORED_INGEST_FILENAMES = {"project.json"}

qdrant_client: QdrantClient | None = None
embedding_model: TextEmbedding | None = None
embedding_ready = False
embedding_error: str | None = None
BOOKMARK_PATTERN = re.compile(r"\[bookmark:[^\]]+\]")
MULTISPACE_PATTERN = re.compile(r"[ \t]{2,}")
HEADING_REF_PATTERN = re.compile(r"^([A-Z]{1,3}\.\d+(?:\.\d+)*\.?)\s*(.*)$")
SECTION_PATTERN = re.compile(r"^(SECTION\s+[A-Z0-9IVX.\-]+)\s*[-.:]?\s*(.*)$", re.IGNORECASE)
PAGE_MARKER_PATTERN = re.compile(r"^(PAGE|Page)\s+\d+\b")
BOILERPLATE_LINES = {"UNCLASSIFIED", "CLASSIFIED"}
REQUIREMENT_SENTENCE_SPLIT_PATTERN = re.compile(r"(?<=[.!?])\s+(?=[A-Z(])")
DOC_REF_PATTERN = re.compile(r"^#/([a-z_]+)/(\d+)$")
REQUIREMENT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("submission", re.compile(r"\b(shall submit|must submit|proposal shall|offeror(?:'s)? proposal shall|shall include|required to submit)\b", re.IGNORECASE)),
    ("instruction", re.compile(r"\b(shall|must|required|are expected to|is responsible for|will provide)\b", re.IGNORECASE)),
    ("evaluation", re.compile(r"\b(will evaluate|evaluation factor|evaluation criteria|best value|rated as|pass/fail)\b", re.IGNORECASE)),
    ("security", re.compile(r"\b(clearance|classified|security|SCI|SAP|personnel security)\b", re.IGNORECASE)),
    ("deliverable", re.compile(r"\b(deliverable|CDRL|milestone|schedule|roadmap)\b", re.IGNORECASE)),
]


def postgres_dsn() -> str:
    return (
        f"host={POSTGRES_HOST} port={POSTGRES_PORT} dbname={POSTGRES_DB} "
        f"user={POSTGRES_USER} password={POSTGRES_PASSWORD}"
    )


def get_qdrant_client() -> QdrantClient:
    global qdrant_client
    if qdrant_client is None:
        qdrant_client = QdrantClient(url=QDRANT_URL)
    return qdrant_client


def get_embedding_model() -> TextEmbedding:
    global embedding_model
    if embedding_model is None:
        embedding_model = TextEmbedding(model_name=EMBEDDING_MODEL)
    return embedding_model


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []

    if EMBEDDING_PROVIDER == "openai":
        if not EMBEDDINGS_BASE_URL:
            raise RuntimeError("EMBEDDINGS_BASE_URL is required when EMBEDDING_PROVIDER=openai")
        headers = {"Content-Type": "application/json"}
        if EMBEDDINGS_API_KEY:
            headers["Authorization"] = f"Bearer {EMBEDDINGS_API_KEY}"
        response = httpx.post(
            f"{EMBEDDINGS_BASE_URL}/embeddings",
            headers=headers,
            json={"input": texts, "model": EMBEDDING_MODEL},
            timeout=300.0,
        )
        response.raise_for_status()
        payload = response.json()
        return [list(item["embedding"]) for item in payload.get("data", [])]

    model = get_embedding_model()
    return [list(vector) for vector in model.embed(texts)]


def warm_embedding_model() -> None:
    global embedding_ready, embedding_error
    try:
        embed_texts([EMBEDDING_WARMUP_TEXT])
        embedding_ready = True
        embedding_error = None
    except Exception as exc:
        embedding_ready = False
        embedding_error = str(exc)
        raise


def resolve_rfp_folder(project_id: str, folder_path: str | None) -> Path:
    if folder_path:
        return Path(folder_path)
    return Path(DEFAULT_DATA_ROOT) / project_id


def clean_extracted_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = BOOKMARK_PATTERN.sub("", text)
    lines = [MULTISPACE_PATTERN.sub(" ", line).strip() for line in text.split("\n")]
    cleaned_lines: list[str] = []
    blank_streak = 0
    for line in lines:
        if line in BOILERPLATE_LINES or PAGE_MARKER_PATTERN.match(line):
            continue
        if not line:
            blank_streak += 1
            if blank_streak <= 2:
                cleaned_lines.append("")
            continue
        blank_streak = 0
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines).strip()


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
    text = item.get("text", "")
    normalized = text.strip()
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
    if word_count > 18:
        return False
    if len(normalized) > 120:
        return False
    return bool(item.get("bold"))


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


def build_section_chunks(text: str) -> list[dict[str, str]]:
    cleaned_text = clean_extracted_text(text)
    if not cleaned_text:
        return []

    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", cleaned_text) if part.strip()]
    sections: list[dict[str, str]] = []
    heading_stack: list[tuple[int, str, str]] = []
    current_body: list[str] = []

    def flush_current() -> None:
        if not current_body:
            return
        section_path = " > ".join(item[1] for item in heading_stack)
        section_heading = " > ".join(item[2] for item in heading_stack)
        sections.append(
            {
                "section_path": section_path or "DOCUMENT",
                "section_heading": section_heading or "Document Body",
                "body": "\n\n".join(current_body).strip(),
            }
        )
        current_body.clear()

    for paragraph in paragraphs:
        heading = parse_heading(paragraph)
        if heading is None:
            current_body.append(paragraph)
            continue

        flush_current()
        reference, title, full_paragraph = heading
        level = heading_level(reference)
        while heading_stack and heading_stack[-1][0] >= level:
            heading_stack.pop()
        heading_stack.append((level, reference, title))

        first_line, separator, remainder = full_paragraph.partition("\n")
        body_text = remainder.strip() if separator else ""
        heading_only = first_line.strip()
        if body_text and body_text != heading_only:
            current_body.append(body_text)

    flush_current()
    if not sections:
        return [{"section_path": "DOCUMENT", "section_heading": "Document Body", "body": cleaned_text}]
    return sections


def split_requirement_sentences(text: str) -> list[str]:
    normalized = MULTISPACE_PATTERN.sub(" ", text.replace("\n", " ")).strip()
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


def ensure_collection(vector_size: int) -> None:
    client = get_qdrant_client()
    if client.collection_exists(QDRANT_COLLECTION):
        collection = client.get_collection(QDRANT_COLLECTION)
        existing_size = collection.config.params.vectors.size
        if existing_size != vector_size:
            raise RuntimeError(
                f"Qdrant collection '{QDRANT_COLLECTION}' dimension mismatch: existing={existing_size}, requested={vector_size}. "
                "Use a new collection name or rebuild the collection for the new embedding model."
            )
        return
    client.create_collection(
        collection_name=QDRANT_COLLECTION,
        vectors_config=models.VectorParams(size=vector_size, distance=models.Distance.COSINE),
    )


def point_id_for_chunk(project_id: str, filename: str, chunk_index: str) -> str:
    raw = f"{project_id}:{filename}:{chunk_index}"
    return str(uuid.uuid5(uuid.NAMESPACE_URL, raw))


def latest_documents_by_filename(project_id: str) -> dict[str, dict[str, Any]]:
    sql = """
    SELECT DISTINCT ON (filename)
      filename,
      content_sha256,
      size_bytes,
      updated_at
    FROM documents
    WHERE project_id = %(project_id)s
      AND extraction_status = %(extraction_status)s
      AND filename <> ALL(%(ignored_filenames)s)
    ORDER BY filename, created_at DESC
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        rows = conn.execute(
            sql,
            {
                "project_id": project_id,
                "extraction_status": EXTRACTION_STATUS,
                "ignored_filenames": list(IGNORED_INGEST_FILENAMES),
            },
        ).fetchall()
    return {row["filename"]: dict(row) for row in rows}


def distinct_documents_for_project(project_id: str) -> list[dict[str, Any]]:
    sql = """
    SELECT DISTINCT ON (filename)
      id,
      project_id,
      filename,
      content_type,
      content_sha256,
      size_bytes,
      raw_object_key,
      parsed_object_key,
      extracted_text,
      normalization.normalized_markdown,
      normalization.structured_json,
      normalization.provider AS normalization_provider,
      created_at,
      updated_at
    FROM documents
    LEFT JOIN LATERAL (
      SELECT normalized_markdown, structured_json, provider
      FROM document_normalizations
      WHERE document_id = documents.id
        AND normalization_status = 'normalized'
      ORDER BY updated_at DESC
      LIMIT 1
    ) AS normalization ON TRUE
    WHERE project_id = %(project_id)s
      AND extraction_status = %(extraction_status)s
      AND filename <> ALL(%(ignored_filenames)s)
      AND extracted_text IS NOT NULL
      AND extracted_text <> ''
    ORDER BY filename, created_at DESC
    """
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as conn:
        rows = conn.execute(
            sql,
            {
                "project_id": project_id,
                "extraction_status": EXTRACTION_STATUS,
                "ignored_filenames": list(IGNORED_INGEST_FILENAMES),
            },
        ).fetchall()
    return [dict(row) for row in rows]


def fetch_structured_artifact(project_id: str, document_id: str) -> dict[str, Any] | None:
    try:
        response = httpx.get(
            f"{NORMALIZATION_SERVICE_BASE_URL}/v1/projects/{project_id}/documents/{document_id}/structured-artifact",
            timeout=30.0,
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()
    except Exception:
        return None


def chunk_text(text: str, chunk_size_words: int, chunk_overlap_words: int) -> list[str]:
    words = text.split()
    if not words:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(words):
        end = min(len(words), start + chunk_size_words)
        chunks.append(" ".join(words[start:end]))
        if end >= len(words):
            break
        start = max(end - chunk_overlap_words, start + 1)
    return chunks


def build_chunks_from_structured_artifact(
    *,
    record: dict[str, Any],
    artifact: dict[str, Any],
    chunk_size_words: int,
    chunk_overlap_words: int,
) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    hierarchy = artifact.get("hierarchy") or {}
    sections = hierarchy.get("sections") or []
    hierarchy_quality = hierarchy.get("quality") or "weak"
    cleaned_text = ((artifact.get("cleaned_text") or {}).get("full_text")) or record["normalized_markdown"] or record["extracted_text"]
    objects = artifact.get("objects") or {}

    if hierarchy_quality in {"strong", "partial"} and sections:
        for section_index, section in enumerate(sections):
            section_number = section.get("section_number") or ""
            section_title = section.get("section_title") or "Section"
            section_heading = f"{section_number} {section_title}".strip()
            section_path = section_number or section_title
            for section_chunk_index, content in enumerate(
                chunk_text(section_heading, chunk_size_words=chunk_size_words, chunk_overlap_words=chunk_overlap_words)
            ):
                composite_index = f"s-{section_index}-{section_chunk_index}"
                chunks.append(
                    {
                        "point_id": point_id_for_chunk(record["project_id"], record["filename"], composite_index),
                        "document_id": record["id"],
                        "project_id": record["project_id"],
                        "filename": record["filename"],
                        "content_type": record["content_type"],
                        "raw_object_key": record["raw_object_key"],
                        "parsed_object_key": record["parsed_object_key"],
                        "normalization_provider": record.get("normalization_provider"),
                        "chunk_index": composite_index,
                        "chunk_kind": "section",
                        "requirement_type": None,
                        "section_path": section_path,
                        "section_heading": section_heading,
                        "section_id": section.get("section_id"),
                        "text": f"Section Heading: {section_heading}\n\n{content}",
                        "body_text": content,
                    }
                )
    else:
        for page_chunk_index, content in enumerate(
            chunk_text(cleaned_text, chunk_size_words=chunk_size_words, chunk_overlap_words=chunk_overlap_words)
        ):
            composite_index = f"p-{page_chunk_index}"
            chunks.append(
                {
                    "point_id": point_id_for_chunk(record["project_id"], record["filename"], composite_index),
                    "document_id": record["id"],
                    "project_id": record["project_id"],
                    "filename": record["filename"],
                    "content_type": record["content_type"],
                    "raw_object_key": record["raw_object_key"],
                    "parsed_object_key": record["parsed_object_key"],
                    "normalization_provider": record.get("normalization_provider"),
                    "chunk_index": composite_index,
                    "chunk_kind": "page_window",
                    "requirement_type": None,
                    "section_path": "DOCUMENT",
                    "section_heading": "Document Body",
                    "section_id": None,
                    "text": content,
                    "body_text": content,
                }
            )

    for table_index, table in enumerate(objects.get("tables") or []):
        content = "\n".join(" | ".join(row) for row in (table.get("rows") or []) if row).strip()
        if not content:
            continue
        composite_index = f"t-{table_index}"
        chunks.append(
            {
                "point_id": point_id_for_chunk(record["project_id"], record["filename"], composite_index),
                "document_id": record["id"],
                "project_id": record["project_id"],
                "filename": record["filename"],
                "content_type": record["content_type"],
                "raw_object_key": record["raw_object_key"],
                "parsed_object_key": record["parsed_object_key"],
                "normalization_provider": record.get("normalization_provider"),
                "chunk_index": composite_index,
                "chunk_kind": "table",
                "requirement_type": None,
                "section_path": table.get("attached_section_id") or "DOCUMENT",
                "section_heading": table.get("attached_section_id") or "Document Body",
                "section_id": table.get("attached_section_id"),
                "text": f"Table Content\n\n{content}",
                "body_text": content,
            }
        )

    return chunks


@component
class PostgresDocumentSource:
    @component.output_types(records=list[dict[str, Any]])
    def run(self, project_id: str) -> dict[str, list[dict[str, Any]]]:
        return {"records": distinct_documents_for_project(project_id)}


@component
class TextChunker:
    def __init__(self, chunk_size_words: int, chunk_overlap_words: int):
        self.chunk_size_words = chunk_size_words
        self.chunk_overlap_words = chunk_overlap_words

    @component.output_types(chunks=list[dict[str, Any]])
    def run(self, records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
        chunks: list[dict[str, Any]] = []
        for record in records:
            artifact = fetch_structured_artifact(record["project_id"], record["id"])
            if artifact:
                chunks.extend(
                    build_chunks_from_structured_artifact(
                        record=record,
                        artifact=artifact,
                        chunk_size_words=self.chunk_size_words,
                        chunk_overlap_words=self.chunk_overlap_words,
                    )
                )
                continue
            source_text = record["normalized_markdown"] or record["extracted_text"]
            if record.get("structured_json"):
                try:
                    section_chunks, table_chunks = build_structured_records_from_docling(record["structured_json"])
                except Exception:
                    section_chunks = build_section_chunks(source_text)
                    table_chunks = []
            else:
                section_chunks = build_section_chunks(source_text)
                table_chunks = []
            for chunk_index, section in enumerate(section_chunks):
                for section_chunk_index, content in enumerate(
                    chunk_text(
                        section["body"],
                        chunk_size_words=self.chunk_size_words,
                        chunk_overlap_words=self.chunk_overlap_words,
                    )
                ):
                    composite_index = f"{chunk_index}-{section_chunk_index}"
                    contextual_text = (
                        f"Section Path: {section['section_path']}\n"
                        f"Section Heading: {section['section_heading']}\n\n"
                        f"{content}"
                    )
                    chunks.append(
                        {
                            "point_id": point_id_for_chunk(record["project_id"], record["filename"], composite_index),
                            "document_id": record["id"],
                            "project_id": record["project_id"],
                            "filename": record["filename"],
                            "content_type": record["content_type"],
                            "raw_object_key": record["raw_object_key"],
                            "parsed_object_key": record["parsed_object_key"],
                            "normalization_provider": record.get("normalization_provider"),
                            "chunk_index": composite_index,
                            "chunk_kind": "section",
                            "requirement_type": None,
                            "section_path": section["section_path"],
                            "section_heading": section["section_heading"],
                            "section_id": None,
                            "text": contextual_text,
                            "body_text": content,
                        }
                    )
                for requirement in extract_requirement_records(section):
                    requirement_chunk_index = f"{chunk_index}-r-{requirement['requirement_index']}"
                    chunks.append(
                        {
                            "point_id": point_id_for_chunk(record["project_id"], record["filename"], requirement_chunk_index),
                            "document_id": record["id"],
                            "project_id": record["project_id"],
                            "filename": record["filename"],
                            "content_type": record["content_type"],
                            "raw_object_key": record["raw_object_key"],
                            "parsed_object_key": record["parsed_object_key"],
                            "normalization_provider": record.get("normalization_provider"),
                            "chunk_index": requirement_chunk_index,
                            "chunk_kind": "requirement",
                            "requirement_type": requirement["requirement_type"],
                            "section_path": requirement["section_path"],
                            "section_heading": requirement["section_heading"],
                            "section_id": None,
                            "text": (
                                f"Requirement Type: {requirement['requirement_type']}\n"
                                f"Section Path: {requirement['section_path']}\n"
                                f"Section Heading: {requirement['section_heading']}\n\n"
                                f"{requirement['requirement_text']}"
                            ),
                            "body_text": requirement["requirement_text"],
                        }
                    )
            for table_index, table in enumerate(table_chunks):
                for table_chunk_index, content in enumerate(
                    chunk_text(
                        table["body"],
                        chunk_size_words=self.chunk_size_words,
                        chunk_overlap_words=self.chunk_overlap_words,
                    )
                ):
                    composite_index = f"t-{table_index}-{table_chunk_index}"
                    contextual_text = (
                        f"Chunk Type: table\n"
                        f"Section Path: {table['section_path']}\n"
                        f"Section Heading: {table['section_heading']}\n\n"
                        f"{content}"
                    )
                    chunks.append(
                        {
                            "point_id": point_id_for_chunk(record["project_id"], record["filename"], composite_index),
                            "document_id": record["id"],
                            "project_id": record["project_id"],
                            "filename": record["filename"],
                            "content_type": record["content_type"],
                            "raw_object_key": record["raw_object_key"],
                            "parsed_object_key": record["parsed_object_key"],
                            "normalization_provider": record.get("normalization_provider"),
                            "chunk_index": composite_index,
                            "chunk_kind": "table",
                            "requirement_type": None,
                            "section_path": table["section_path"],
                            "section_heading": table["section_heading"],
                            "section_id": None,
                            "text": contextual_text,
                            "body_text": content,
                        }
                    )
        return {"chunks": chunks}


@component
class ChunkEmbedder:
    def __init__(self, model_name: str):
        self.model_name = model_name

    @component.output_types(payloads=list[dict[str, Any]], vector_size=int)
    def run(self, chunks: list[dict[str, Any]]) -> dict[str, Any]:
        if not chunks:
            return {"payloads": [], "vector_size": 0}

        embeddings = embed_texts([chunk["text"] for chunk in chunks])
        payloads = []
        for chunk, embedding in zip(chunks, embeddings, strict=True):
            payloads.append({"chunk": chunk, "embedding": embedding})
        return {"payloads": payloads, "vector_size": len(embeddings[0])}


@component
class QdrantWriter:
    @component.output_types(indexed_count=int)
    def run(self, payloads: list[dict[str, Any]], vector_size: int) -> dict[str, int]:
        if not payloads:
            return {"indexed_count": 0}

        ensure_collection(vector_size)
        client = get_qdrant_client()
        filenames = sorted({item["chunk"]["filename"] for item in payloads})
        for filename in filenames:
            client.delete(
                collection_name=QDRANT_COLLECTION,
                points_selector=models.FilterSelector(
                    filter=models.Filter(
                        must=[
                            models.FieldCondition(
                                key="project_id",
                                match=models.MatchValue(value=payloads[0]["chunk"]["project_id"]),
                            ),
                            models.FieldCondition(
                                key="filename",
                                match=models.MatchValue(value=filename),
                            ),
                        ]
                    )
                ),
                wait=True,
            )
        points = [
            models.PointStruct(
                id=item["chunk"]["point_id"],
                vector=item["embedding"],
                payload={
                    "document_id": item["chunk"]["document_id"],
                    "project_id": item["chunk"]["project_id"],
                    "filename": item["chunk"]["filename"],
                    "content_type": item["chunk"]["content_type"],
                    "raw_object_key": item["chunk"]["raw_object_key"],
                    "parsed_object_key": item["chunk"]["parsed_object_key"],
                    "normalization_provider": item["chunk"]["normalization_provider"],
                    "chunk_index": item["chunk"]["chunk_index"],
                    "chunk_kind": item["chunk"]["chunk_kind"],
                    "requirement_type": item["chunk"]["requirement_type"],
                    "section_path": item["chunk"]["section_path"],
                    "section_heading": item["chunk"]["section_heading"],
                    "section_id": item["chunk"].get("section_id"),
                    "text": item["chunk"]["text"],
                    "body_text": item["chunk"]["body_text"],
                },
            )
            for item in payloads
        ]
        client.upsert(collection_name=QDRANT_COLLECTION, points=points, wait=True)
        return {"indexed_count": len(points)}


@component
class QueryEmbedder:
    @component.output_types(query_vector=list[float])
    def run(self, query: str) -> dict[str, list[float]]:
        vectors = embed_texts([query])
        vector = vectors[0] if vectors else None
        if vector is None:
            return {"query_vector": []}
        return {"query_vector": vector}


@component
class QdrantRetriever:
    @component.output_types(matches=list[dict[str, Any]])
    def run(
        self,
        query_vector: list[float],
        project_id: str,
        top_k: int,
        chunk_kind: str | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        if not query_vector:
            return {"matches": []}

        client = get_qdrant_client()
        must_conditions = [
            models.FieldCondition(
                key="project_id",
                match=models.MatchValue(value=project_id),
            )
        ]
        if chunk_kind:
            must_conditions.append(
                models.FieldCondition(
                    key="chunk_kind",
                    match=models.MatchValue(value=chunk_kind),
                )
            )
        response = client.query_points(
            collection_name=QDRANT_COLLECTION,
            query=query_vector,
            limit=top_k,
            query_filter=models.Filter(must=must_conditions),
        )
        results = response.points
        matches = [
            {
                "score": result.score,
                "document_id": result.payload.get("document_id"),
                "filename": result.payload.get("filename"),
                "chunk_index": result.payload.get("chunk_index"),
                "chunk_kind": result.payload.get("chunk_kind"),
                "requirement_type": result.payload.get("requirement_type"),
                "section_path": result.payload.get("section_path"),
                "section_heading": result.payload.get("section_heading"),
                "section_id": result.payload.get("section_id"),
                "text": result.payload.get("text"),
                "body_text": result.payload.get("body_text"),
                "raw_object_key": result.payload.get("raw_object_key"),
                "parsed_object_key": result.payload.get("parsed_object_key"),
                "normalization_provider": result.payload.get("normalization_provider"),
            }
            for result in results
        ]
        return {"matches": matches}


def build_index_pipeline() -> Pipeline:
    pipeline = Pipeline()
    pipeline.add_component("source", PostgresDocumentSource())
    pipeline.add_component(
        "chunker",
        TextChunker(chunk_size_words=CHUNK_SIZE_WORDS, chunk_overlap_words=CHUNK_OVERLAP_WORDS),
    )
    pipeline.add_component("embedder", ChunkEmbedder(model_name=EMBEDDING_MODEL))
    pipeline.add_component("writer", QdrantWriter())
    pipeline.connect("source.records", "chunker.records")
    pipeline.connect("chunker.chunks", "embedder.chunks")
    pipeline.connect("embedder.payloads", "writer.payloads")
    pipeline.connect("embedder.vector_size", "writer.vector_size")
    return pipeline


def build_retrieval_pipeline() -> Pipeline:
    pipeline = Pipeline()
    pipeline.add_component("embedder", QueryEmbedder())
    pipeline.add_component("retriever", QdrantRetriever())
    pipeline.connect("embedder.query_vector", "retriever.query_vector")
    return pipeline


async def upload_file_to_document_service(project_id: str, file_path: Path) -> dict[str, Any]:
    content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    async with httpx.AsyncClient(timeout=180.0) as client:
        with file_path.open("rb") as file_handle:
            response = await client.post(
                f"{DOCUMENT_SERVICE_BASE_URL}/v1/documents/upload",
                data={"project_id": project_id},
                files={
                    "file": (
                        file_path.name,
                        file_handle,
                        content_type,
                    )
                },
            )
    response.raise_for_status()
    return response.json()


async def normalize_project_via_service(project_id: str, skip_existing: bool) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=1800.0) as client:
        response = await client.post(
            f"{NORMALIZATION_SERVICE_BASE_URL}/v1/normalize/project",
            json={"project_id": project_id, "skip_existing": skip_existing},
        )
    response.raise_for_status()
    return response.json()


class FolderIngestRequest(BaseModel):
    project_id: str = Field(min_length=1)
    folder_path: str | None = Field(default=None)
    skip_existing: bool = Field(default=True)


class ProjectIndexRequest(BaseModel):
    project_id: str = Field(min_length=1)


class QueryRequest(BaseModel):
    project_id: str = Field(min_length=1)
    query: str
    top_k: int = Field(default=DEFAULT_TOP_K, ge=1, le=20)
    chunk_kind: str | None = Field(default=None)


class SeedSetupRequest(BaseModel):
    project_id: str = Field(min_length=1)
    folder_path: str | None = Field(default=None)
    skip_existing: bool = Field(default=True)

@asynccontextmanager
async def lifespan(_: FastAPI):
    get_qdrant_client()
    try:
        warm_embedding_model()
    except Exception as exc:
        # Allow the service to start in a degraded state when the embedding
        # model cannot be fetched at boot. This keeps the UI and dependent
        # services available while surfacing the embedding failure in /healthz.
        print(f"retrieval.embedding_warmup_failed: {exc}", flush=True)
    try:
        yield
    finally:
        return


app = FastAPI(title="Perfect RFP Retrieval Service", version="0.1.0", lifespan=lifespan)
index_pipeline = build_index_pipeline()
retrieval_pipeline = build_retrieval_pipeline()


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
        response = httpx.get(f"{DOCUMENT_SERVICE_BASE_URL}/healthz", timeout=10.0)
        response.raise_for_status()
        checks["document_service"] = "ok"
    except Exception as exc:
        checks["document_service"] = f"error: {exc}"

    try:
        response = httpx.get(f"{NORMALIZATION_SERVICE_BASE_URL}/healthz", timeout=10.0)
        response.raise_for_status()
        checks["normalization_service"] = "ok"
    except Exception as exc:
        checks["normalization_service"] = f"error: {exc}"

    try:
        client = get_qdrant_client()
        client.get_collections()
        checks["qdrant"] = "ok"
    except Exception as exc:
        checks["qdrant"] = f"error: {exc}"

    checks["embedding"] = "ok" if embedding_ready else f"error: {embedding_error or 'not initialized'}"

    ok = all(value == "ok" for value in checks.values())
    return {
        "status": "ok" if ok else "degraded",
        "checks": checks,
        "embedding_provider": EMBEDDING_PROVIDER,
        "embedding_model": EMBEDDING_MODEL,
    }


@app.post("/v1/ingest/folder")
async def ingest_folder(request: FolderIngestRequest) -> dict[str, Any]:
    folder = resolve_rfp_folder(request.project_id, request.folder_path)
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(status_code=404, detail=f"Folder not found: {folder}")

    existing = latest_documents_by_filename(request.project_id) if request.skip_existing else {}
    files = sorted(
        path
        for path in folder.iterdir()
        if path.is_file() and not path.name.startswith(".") and path.name not in IGNORED_INGEST_FILENAMES
    )
    if not files:
        raise HTTPException(
            status_code=400,
            detail=f"No ingestible files found in folder: {folder}",
        )
    uploaded: list[dict[str, Any]] = []
    skipped: list[str] = []
    failed: list[dict[str, str]] = []

    for file_path in files:
        try:
            file_sha256 = hashlib.sha256(file_path.read_bytes()).hexdigest()
            existing_document = existing.get(file_path.name)
            if (
                existing_document
                and existing_document.get("content_sha256")
                and existing_document["content_sha256"] == file_sha256
            ):
                skipped.append(file_path.name)
                continue
            uploaded.append(await upload_file_to_document_service(request.project_id, file_path))
        except Exception as exc:
            failed.append({"filename": file_path.name, "error": str(exc)})

    return {
        "project_id": request.project_id,
        "folder_path": str(folder),
        "total_files": len(files),
        "uploaded_count": len(uploaded),
        "skipped_count": len(skipped),
        "failed_count": len(failed),
        "uploaded": uploaded,
        "skipped": skipped,
        "failed": failed,
    }


@app.post("/v1/index/project")
def index_project(request: ProjectIndexRequest) -> dict[str, Any]:
    result = index_pipeline.run({"source": {"project_id": request.project_id}})
    indexed_count = result["writer"]["indexed_count"]
    document_count = len(distinct_documents_for_project(request.project_id))
    return {
        "project_id": request.project_id,
        "documents_indexed": document_count,
        "chunks_indexed": indexed_count,
        "collection": QDRANT_COLLECTION,
        "embedding_provider": EMBEDDING_PROVIDER,
        "embedding_model": EMBEDDING_MODEL,
    }


@app.get("/v1/projects/{project_id}/status")
def project_index_status(project_id: str) -> dict[str, Any]:
    client = get_qdrant_client()
    count_result = client.count(
        collection_name=QDRANT_COLLECTION,
        count_filter=models.Filter(
            must=[
                models.FieldCondition(
                    key="project_id",
                    match=models.MatchValue(value=project_id),
                )
            ]
        ),
        exact=True,
    )
    return {
        "project_id": project_id,
        "collection": QDRANT_COLLECTION,
        "indexed_points": int(count_result.count or 0),
    }


@app.post("/v1/seed/setup")
async def seed_setup(request: SeedSetupRequest) -> dict[str, Any]:
    ingest_result = await ingest_folder(
        FolderIngestRequest(
            project_id=request.project_id,
            folder_path=request.folder_path,
            skip_existing=request.skip_existing,
        )
    )
    if ingest_result["failed_count"] > 0:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Folder ingest completed with failures; indexing aborted",
                "ingest": ingest_result,
            },
        )
    normalization_result = await normalize_project_via_service(
        project_id=request.project_id,
        skip_existing=request.skip_existing,
    )
    if normalization_result["failed_count"] > 0:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Normalization completed with failures; indexing aborted",
                "ingest": ingest_result,
                "normalization": normalization_result,
            },
        )
    index_result = index_project(ProjectIndexRequest(project_id=request.project_id))
    return {
        "ingest": ingest_result,
        "normalization": normalization_result,
        "index": index_result,
    }


@app.post("/v1/query")
def query_project(request: QueryRequest) -> dict[str, Any]:
    result = retrieval_pipeline.run(
        {
            "embedder": {"query": request.query},
            "retriever": {
                "project_id": request.project_id,
                "top_k": request.top_k,
                "chunk_kind": request.chunk_kind,
            },
        }
    )
    return {
        "project_id": request.project_id,
        "query": request.query,
        "top_k": request.top_k,
        "chunk_kind": request.chunk_kind,
        "matches": result["retriever"]["matches"],
    }
