import io
import json
import os
import hashlib
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import httpx
import psycopg
from docling.datamodel.base_models import DocumentStream
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.pipeline_options import PdfPipelineOptions, TesseractCliOcrOptions
from docling.datamodel.base_models import InputFormat
from psycopg_pool import AsyncConnectionPool
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from minio import Minio
from minio.error import S3Error
from redis.asyncio import Redis


DOCUMENT_SERVICE_PORT = int(os.environ.get("DOCUMENT_SERVICE_PORT", "8081"))
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "postgres")
POSTGRES_PORT = int(os.environ.get("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.environ["POSTGRES_DB"]
POSTGRES_USER = os.environ["POSTGRES_USER"]
POSTGRES_PASSWORD = os.environ["POSTGRES_PASSWORD"]
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.environ["MINIO_ACCESS_KEY"]
MINIO_SECRET_KEY = os.environ["MINIO_SECRET_KEY"]
MINIO_BUCKET_RAW = os.environ.get("MINIO_BUCKET_RAW", "raw")
MINIO_BUCKET_PARSED = os.environ.get("MINIO_BUCKET_PARSED", "parsed")
TIKA_BASE_URL = os.environ.get("TIKA_BASE_URL", "http://tika:9998").rstrip("/")
DOCUMENT_EXTRACTOR = os.environ.get("DOCUMENT_EXTRACTOR", "docling").strip().lower()
DOCLING_ENABLE_TIKA_FALLBACK = os.environ.get("DOCLING_ENABLE_TIKA_FALLBACK", "true").strip().lower() not in {"0", "false", "no"}
DOCLING_FORCE_FULL_PAGE_OCR = os.environ.get("DOCLING_FORCE_FULL_PAGE_OCR", "false").strip().lower() in {"1", "true", "yes"}
DOCLING_MIN_TEXT_LENGTH = int(os.environ.get("DOCLING_MIN_TEXT_LENGTH", "1500"))
DOCLING_MIN_ALPHA_RATIO = float(os.environ.get("DOCLING_MIN_ALPHA_RATIO", "0.55"))
EXTRACTION_STATUS_EXTRACTED = "extracted"
EXTRACTION_STATUS_FAILED = "failed"

db_pool: AsyncConnectionPool | None = None
redis_client: Redis | None = None
minio_client: Minio | None = None
docling_fast_converter: DocumentConverter | None = None
docling_ocr_converter: DocumentConverter | None = None


def postgres_dsn() -> str:
    return (
        f"host={POSTGRES_HOST} port={POSTGRES_PORT} dbname={POSTGRES_DB} "
        f"user={POSTGRES_USER} password={POSTGRES_PASSWORD}"
    )


def get_minio_client() -> Minio:
    if minio_client is None:
        raise RuntimeError("MinIO client is not initialized")
    return minio_client


def get_redis_client() -> Redis:
    if redis_client is None:
        raise RuntimeError("Redis client is not initialized")
    return redis_client


def get_db_pool() -> AsyncConnectionPool:
    if db_pool is None:
        raise RuntimeError("Database pool is not initialized")
    return db_pool


def build_pdf_converter(*, do_ocr: bool) -> DocumentConverter:
    pdf_pipeline_options = PdfPipelineOptions()
    pdf_pipeline_options.do_ocr = do_ocr
    if do_ocr:
        pdf_pipeline_options.ocr_options = TesseractCliOcrOptions(
            force_full_page_ocr=DOCLING_FORCE_FULL_PAGE_OCR,
        )
    return DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pdf_pipeline_options),
        }
    )


def get_fast_converter() -> DocumentConverter:
    global docling_fast_converter
    if docling_fast_converter is None:
        docling_fast_converter = build_pdf_converter(do_ocr=False)
    return docling_fast_converter


def get_ocr_converter() -> DocumentConverter:
    global docling_ocr_converter
    if docling_ocr_converter is None:
        docling_ocr_converter = build_pdf_converter(do_ocr=True)
    return docling_ocr_converter


def is_probably_weak_text(text: str) -> bool:
    normalized = str(text or "").strip()
    if len(normalized) < DOCLING_MIN_TEXT_LENGTH:
        return True
    visible_chars = [char for char in normalized if not char.isspace()]
    if not visible_chars:
        return True
    alpha_chars = sum(1 for char in visible_chars if char.isalpha())
    alpha_ratio = alpha_chars / len(visible_chars)
    return alpha_ratio < DOCLING_MIN_ALPHA_RATIO


async def ensure_schema() -> None:
    ddl = """
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT,
      content_sha256 TEXT,
      size_bytes BIGINT NOT NULL,
      raw_object_key TEXT NOT NULL,
      parsed_object_key TEXT NOT NULL,
      extraction_status TEXT NOT NULL,
      extracted_text TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    """
    async with get_db_pool().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(ddl)
            await cur.execute(
                """
                ALTER TABLE documents
                ADD COLUMN IF NOT EXISTS content_sha256 TEXT;
                """
            )
        await conn.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    global db_pool, redis_client, minio_client

    db_pool = AsyncConnectionPool(
        conninfo=postgres_dsn(),
        open=False,
        kwargs={"autocommit": False},
        min_size=1,
        max_size=5,
    )
    await db_pool.open(wait=True)
    redis_client = Redis.from_url(REDIS_URL, decode_responses=True)
    minio_client = Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=False,
    )
    await ensure_schema()
    try:
        yield
    finally:
        if redis_client is not None:
            await redis_client.aclose()
        if db_pool is not None:
            await db_pool.close()


app = FastAPI(title="Perfect RFP Document Service", version="0.1.0", lifespan=lifespan)


@app.get("/healthz")
async def healthz() -> JSONResponse:
    checks: dict[str, str] = {}

    try:
        async with get_db_pool().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1")
                await cur.fetchone()
        checks["postgres"] = "ok"
    except Exception as exc:
        checks["postgres"] = f"error: {exc}"

    try:
        client = get_redis_client()
        await client.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"

    try:
        client = get_minio_client()
        client.bucket_exists(MINIO_BUCKET_RAW)
        checks["minio"] = "ok"
    except Exception as exc:
        checks["minio"] = f"error: {exc}"

    try:
        get_fast_converter()
        get_ocr_converter()
        checks["docling"] = "ok"
    except Exception as exc:
        checks["docling"] = f"error: {exc}"

    try:
        response = httpx.get(f"{TIKA_BASE_URL}/tika", timeout=10.0)
        response.raise_for_status()
        checks["tika"] = "ok"
    except Exception as exc:
        checks["tika"] = f"error: {exc}"

    ok = all(value == "ok" for value in checks.values())
    return JSONResponse(status_code=200 if ok else 503, content={"status": "ok" if ok else "degraded", "checks": checks})


async def extract_text_with_tika(filename: str, content: bytes, content_type: str | None) -> str:
    headers = {
        "Accept": "text/plain",
        "Content-Disposition": f'attachment; filename="{filename}"',
    }
    if content_type:
        headers["Content-Type"] = content_type
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.put(f"{TIKA_BASE_URL}/tika", content=content, headers=headers)
    response.raise_for_status()
    return response.text


def extract_text_with_docling(filename: str, content: bytes, *, use_ocr: bool) -> str:
    source = DocumentStream(name=filename, stream=io.BytesIO(content))
    converter = get_ocr_converter() if use_ocr else get_fast_converter()
    result = converter.convert(source)
    markdown = result.document.export_to_markdown()
    extracted_text = str(markdown or "").strip()
    if not extracted_text:
        raise ValueError("Docling returned no text")
    return extracted_text


async def extract_text(filename: str, content: bytes, content_type: str | None) -> tuple[str, str]:
    extractor = DOCUMENT_EXTRACTOR or "docling"
    if extractor == "tika":
        return await extract_text_with_tika(filename, content, content_type), "tika"

    try:
        suffix = Path(filename).suffix.lower()
        if suffix == ".pdf":
            started = time.perf_counter()
            fast_text = extract_text_with_docling(filename, content, use_ocr=False)
            fast_elapsed = round(time.perf_counter() - started, 2)
            if not is_probably_weak_text(fast_text):
                print(
                    json.dumps(
                        {
                            "event": "document.extract",
                            "filename": filename,
                            "extractor": "docling_fast",
                            "elapsed_seconds": fast_elapsed,
                            "chars": len(fast_text),
                        }
                    ),
                    flush=True,
                )
                return fast_text, "docling_fast"

            started = time.perf_counter()
            ocr_text = extract_text_with_docling(filename, content, use_ocr=True)
            ocr_elapsed = round(time.perf_counter() - started, 2)
            print(
                json.dumps(
                    {
                        "event": "document.extract",
                        "filename": filename,
                        "extractor": "docling_ocr",
                        "elapsed_seconds": ocr_elapsed,
                        "chars": len(ocr_text),
                        "fallback_from": "docling_fast",
                        "fast_chars": len(fast_text),
                    }
                ),
                flush=True,
            )
            return ocr_text, "docling_ocr"

        started = time.perf_counter()
        text = extract_text_with_docling(filename, content, use_ocr=False)
        elapsed = round(time.perf_counter() - started, 2)
        print(
            json.dumps(
                {
                    "event": "document.extract",
                    "filename": filename,
                    "extractor": "docling",
                    "elapsed_seconds": elapsed,
                    "chars": len(text),
                }
            ),
            flush=True,
        )
        return text, "docling"
    except Exception:
        if not DOCLING_ENABLE_TIKA_FALLBACK:
            raise
        started = time.perf_counter()
        text = await extract_text_with_tika(filename, content, content_type)
        elapsed = round(time.perf_counter() - started, 2)
        print(
            json.dumps(
                {
                    "event": "document.extract",
                    "filename": filename,
                    "extractor": "tika_fallback",
                    "elapsed_seconds": elapsed,
                    "chars": len(text),
                }
            ),
            flush=True,
        )
        return text, "tika_fallback"


async def insert_document(
    document_id: str,
    project_id: str,
    filename: str,
    content_type: str | None,
    content_sha256: str,
    size_bytes: int,
    raw_object_key: str,
    parsed_object_key: str,
    extracted_text: str,
) -> None:
    now = datetime.now(timezone.utc)
    sql = """
    INSERT INTO documents (
      id, project_id, filename, content_type, content_sha256, size_bytes,
      raw_object_key, parsed_object_key, extraction_status,
      extracted_text, created_at, updated_at
    ) VALUES (
      %(id)s, %(project_id)s, %(filename)s, %(content_type)s, %(content_sha256)s, %(size_bytes)s,
      %(raw_object_key)s, %(parsed_object_key)s, %(extraction_status)s,
      %(extracted_text)s, %(created_at)s, %(updated_at)s
    )
    """
    async with get_db_pool().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                sql,
                {
                    "id": document_id,
                    "project_id": project_id,
                    "filename": filename,
                    "content_type": content_type,
                    "content_sha256": content_sha256,
                    "size_bytes": size_bytes,
                    "raw_object_key": raw_object_key,
                    "parsed_object_key": parsed_object_key,
                    "extraction_status": EXTRACTION_STATUS_EXTRACTED,
                    "extracted_text": extracted_text,
                    "created_at": now,
                    "updated_at": now,
                },
            )
        await conn.commit()


async def publish_event(document_id: str, project_id: str, raw_object_key: str, parsed_object_key: str) -> None:
    payload = {
        "event": "document.extracted",
        "document_id": document_id,
        "project_id": project_id,
        "raw_object_key": raw_object_key,
        "parsed_object_key": parsed_object_key,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    client = get_redis_client()
    await client.lpush("perfect-rfp:document-events", json.dumps(payload))


@app.post("/v1/documents/upload")
async def upload_document(
    project_id: str = Form(...),
    file: UploadFile = File(...),
) -> JSONResponse:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    document_id = str(uuid.uuid4())
    filename = file.filename or f"{document_id}.bin"
    content_sha256 = hashlib.sha256(content).hexdigest()
    suffix = Path(filename).suffix
    raw_object_key = f"{project_id}/{document_id}/original{suffix}"
    parsed_object_key = f"{project_id}/{document_id}/text.txt"

    minio_client = get_minio_client()
    parsed_uploaded = False
    try:
        minio_client.put_object(
            MINIO_BUCKET_RAW,
            raw_object_key,
            io.BytesIO(content),
            length=len(content),
            content_type=file.content_type or "application/octet-stream",
        )
    except S3Error as exc:
        raise HTTPException(status_code=502, detail=f"MinIO upload failed: {exc}") from exc

    try:
        extracted_text, extractor_used = await extract_text(filename, content, file.content_type)
    except Exception as exc:
        minio_client.remove_object(MINIO_BUCKET_RAW, raw_object_key)
        raise HTTPException(status_code=502, detail=f"Document extraction failed: {exc}") from exc

    encoded_text = extracted_text.encode("utf-8")
    try:
        minio_client.put_object(
            MINIO_BUCKET_PARSED,
            parsed_object_key,
            io.BytesIO(encoded_text),
            length=len(encoded_text),
            content_type="text/plain; charset=utf-8",
        )
        parsed_uploaded = True
        await insert_document(
            document_id=document_id,
            project_id=project_id,
            filename=filename,
            content_type=file.content_type,
            content_sha256=content_sha256,
            size_bytes=len(content),
            raw_object_key=raw_object_key,
            parsed_object_key=parsed_object_key,
            extracted_text=extracted_text,
        )
        await publish_event(document_id, project_id, raw_object_key, parsed_object_key)
    except Exception as exc:
        if parsed_uploaded:
            minio_client.remove_object(MINIO_BUCKET_PARSED, parsed_object_key)
        minio_client.remove_object(MINIO_BUCKET_RAW, raw_object_key)
        raise HTTPException(status_code=502, detail=f"Document persistence failed: {exc}") from exc

    return JSONResponse(
        {
            "document_id": document_id,
            "project_id": project_id,
            "filename": filename,
            "content_sha256": content_sha256,
            "raw_object_key": raw_object_key,
            "parsed_object_key": parsed_object_key,
            "extracted_text_chars": len(extracted_text),
            "status": "extracted",
            "extractor": extractor_used,
            "service": "document-service",
            "runtime": "document-pipeline",
            "port": DOCUMENT_SERVICE_PORT,
        }
    )


@app.post("/v1/documents/extract")
async def extract_document(file: UploadFile = File(...)) -> JSONResponse:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    filename = file.filename or "uploaded-document.bin"

    try:
        extracted_text, extractor_used = await extract_text(filename, content, file.content_type)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Document extraction failed: {exc}") from exc

    return JSONResponse(
        {
            "filename": filename,
            "content_type": file.content_type or "application/octet-stream",
            "extracted_text": extracted_text,
            "extracted_text_chars": len(extracted_text),
            "status": "extracted",
            "extractor": extractor_used,
            "service": "document-service",
            "runtime": "document-extract",
            "port": DOCUMENT_SERVICE_PORT,
        }
    )
