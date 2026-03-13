import json
import os
import re
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field


ANALYSIS_SERVICE_PORT = int(os.environ.get("ANALYSIS_SERVICE_PORT", "8092"))
NORMALIZATION_SERVICE_BASE_URL = os.environ.get(
    "ANALYSIS_NORMALIZATION_SERVICE_BASE_URL", "http://normalization-service:8091"
).rstrip("/")
RETRIEVAL_SERVICE_BASE_URL = os.environ.get(
    "ANALYSIS_RETRIEVAL_SERVICE_BASE_URL", "http://retrieval-service:8381"
).rstrip("/")
LLM_BASE_URL = os.environ.get("ANALYSIS_LLM_BASE_URL", "http://host.docker.internal:8360/v1").rstrip("/")
LLM_MODEL = os.environ.get("ANALYSIS_LLM_MODEL", "")
SUMMARY_TOP_K_PER_QUERY = int(os.environ.get("ANALYSIS_SUMMARY_TOP_K_PER_QUERY", "6"))
SUMMARY_MAX_MATCHES = int(os.environ.get("ANALYSIS_SUMMARY_MAX_MATCHES", "30"))
SUMMARY_TEMPERATURE = float(os.environ.get("ANALYSIS_SUMMARY_TEMPERATURE", "0.2"))
HTTP_TIMEOUT = 300.0
MAX_CONTEXT_CHARS_PER_MATCH = int(os.environ.get("ANALYSIS_MAX_CONTEXT_CHARS_PER_MATCH", "700"))

SUMMARY_QUERY_SPECS: list[tuple[str, str]] = [
    ("mission_scope", "Summarize the customer mission, scope of work, and what the package is trying to buy."),
    ("submission", "What are the main submission instructions, proposal organization, and formatting expectations?"),
    ("evaluation", "What are the main evaluation factors, discriminators, and selection considerations?"),
    ("deliverables", "What are the key deliverables, milestones, transition obligations, and management expectations?"),
    ("security", "What security, classification, clearance, SCIF, or data handling requirements are present?"),
]
PRIMARY_DOC_PATTERNS: list[tuple[int, re.Pattern[str]]] = [
    (0, re.compile(r"section\s+l", re.IGNORECASE)),
    (0, re.compile(r"section\s+m", re.IGNORECASE)),
    (0, re.compile(r"\bpws\b", re.IGNORECASE)),
    (1, re.compile(r"hm\d+.*\.pdf", re.IGNORECASE)),
    (2, re.compile(r"appendix", re.IGNORECASE)),
]
NOISY_DOC_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"pricing template", re.IGNORECASE),
    re.compile(r"\bboe\b", re.IGNORECASE),
    re.compile(r"questionnaire", re.IGNORECASE),
    re.compile(r"resume template", re.IGNORECASE),
    re.compile(r"clearance template", re.IGNORECASE),
    re.compile(r"security clearance template", re.IGNORECASE),
    re.compile(r"small business participation template", re.IGNORECASE),
    re.compile(r"master project template", re.IGNORECASE),
    re.compile(r"oci disclosure form", re.IGNORECASE),
    re.compile(r"\.xlsx$", re.IGNORECASE),
]


class PackageAnalysisRequest(BaseModel):
    project_id: str = Field(min_length=1)
    filename_pattern: str | None = Field(default=None)
    top_k_per_query: int = Field(default=SUMMARY_TOP_K_PER_QUERY, ge=1, le=15)
    max_matches: int = Field(default=SUMMARY_MAX_MATCHES, ge=5, le=80)


async def fetch_json(client: httpx.AsyncClient, url: str, *, method: str = "GET", payload: dict[str, Any] | None = None) -> Any:
    response = await client.request(method, url, json=payload, timeout=HTTP_TIMEOUT)
    response.raise_for_status()
    return response.json()


async def fetch_retrieval_matches(
    client: httpx.AsyncClient,
    *,
    project_id: str,
    query: str,
    top_k: int,
) -> list[dict[str, Any]]:
    payload = {"project_id": project_id, "query": query, "top_k": top_k}
    result = await fetch_json(client, f"{RETRIEVAL_SERVICE_BASE_URL}/v1/query", method="POST", payload=payload)
    return result.get("matches", [])


def filter_matches_by_filename_pattern(matches: list[dict[str, Any]], filename_pattern: str | None) -> list[dict[str, Any]]:
    if not filename_pattern:
        return matches
    needle = filename_pattern.replace("%", "").lower()
    if not needle:
        return matches
    return [match for match in matches if needle in (match.get("filename") or "").lower()]


def dedupe_matches(matches: list[dict[str, Any]], max_matches: int) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for match in matches:
        key = (
            match.get("filename") or "",
            str(match.get("chunk_index") or ""),
            match.get("text") or "",
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(match)
        if len(deduped) >= max_matches:
            break
    return deduped


def doc_priority(filename: str | None) -> tuple[int, str]:
    if not filename:
        return (99, "")
    for priority, pattern in PRIMARY_DOC_PATTERNS:
        if pattern.search(filename):
            return (priority, filename.lower())
    return (50, filename.lower())


def is_noisy_doc(filename: str | None) -> bool:
    if not filename:
        return True
    return any(pattern.search(filename) for pattern in NOISY_DOC_PATTERNS)


def curate_package_matches(matches: list[dict[str, Any]], max_matches: int) -> list[dict[str, Any]]:
    primary = [match for match in matches if not is_noisy_doc(match.get("filename"))]
    fallback = [match for match in matches if is_noisy_doc(match.get("filename"))]
    primary.sort(key=lambda match: doc_priority(match.get("filename")))
    fallback.sort(key=lambda match: doc_priority(match.get("filename")))
    ordered = primary + fallback
    return dedupe_matches(ordered, max_matches)


def compact_match_text(match: dict[str, Any]) -> str:
    text = (match.get("text") or match.get("body_text") or "").strip()
    if len(text) <= MAX_CONTEXT_CHARS_PER_MATCH:
        return text
    return text[: MAX_CONTEXT_CHARS_PER_MATCH - 3].rstrip() + "..."


def build_context_block(block_label: str, matches: list[dict[str, Any]]) -> str:
    lines = [f"[{block_label}]"]
    for index, match in enumerate(matches, start=1):
        lines.append(
            "\n".join(
                [
                    f"Match {index}",
                    f"Document: {match.get('filename')}",
                    f"Section Path: {match.get('section_path')}",
                    f"Section Heading: {match.get('section_heading')}",
                    f"Chunk Kind: {match.get('chunk_kind')}",
                    f"Requirement Type: {match.get('requirement_type')}",
                    f"Text: {compact_match_text(match)}",
                ]
            )
        )
    return "\n\n".join(lines)


def build_summary_prompt(project_id: str, sections_count: int, requirements_count: int, tables_count: int, context_block: str) -> list[dict[str, str]]:
    system_prompt = (
        "You are an RFP analyst. "
        "Given curated evidence from an RFP package, produce a concise human-readable markdown summary for business users. "
        "Do not invent facts. "
        "Use only the supplied evidence. "
        "If something is uncertain, say so. "
        "For package understanding, prioritize primary narrative documents such as the solicitation PDF, PWS, Section L, and Section M over templates, forms, questionnaires, or pricing spreadsheets. "
        "Do not let low-context templates define the overall package summary. "
        "Return markdown only with these exact headings: "
        "## Executive Summary, "
        "## Scope Of Work, "
        "## Submission Overview, "
        "## Evaluation Overview, "
        "## Key Documents, "
        "## Risks And Watchouts, "
        "## Notable Dates, "
        "## Security Notes. "
        "Use short paragraphs or flat bullets under each heading."
    )
    user_prompt = (
        f"Project ID: {project_id}\n"
        f"Structured artifact counts: sections={sections_count}, requirements={requirements_count}, tables={tables_count}\n\n"
        "Evidence:\n\n"
        + context_block
    )
    return [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]


def normalize_markdown_response(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
    return stripped


def parse_markdown_summary(markdown: str) -> dict[str, Any]:
    section_map = {
        "executive summary": "executive_summary",
        "scope of work": "scope_of_work",
        "submission overview": "submission_overview",
        "evaluation overview": "evaluation_overview",
        "key documents": "key_documents",
        "risks and watchouts": "risks_and_watchouts",
        "notable dates": "notable_dates",
        "security notes": "security_notes",
    }
    parsed: dict[str, Any] = {
        "executive_summary": "",
        "scope_of_work": "",
        "submission_overview": "",
        "evaluation_overview": "",
        "key_documents": [],
        "risks_and_watchouts": [],
        "notable_dates": [],
        "security_notes": [],
    }
    current_key: str | None = None
    buffers: dict[str, list[str]] = {key: [] for key in section_map.values()}

    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if line.startswith("## "):
            heading = line[3:].strip().lower()
            current_key = section_map.get(heading)
            continue
        if current_key is None:
            continue
        buffers[current_key].append(raw_line.rstrip())

    for key, value in buffers.items():
        text = "\n".join(line for line in value if line.strip()).strip()
        if key in {"key_documents", "risks_and_watchouts", "notable_dates", "security_notes"}:
            items = []
            for line in text.splitlines():
                normalized = line.strip()
                if normalized.startswith(("- ", "* ")):
                    items.append(normalized[2:].strip())
                elif normalized:
                    items.append(normalized)
            parsed[key] = items
        else:
            parsed[key] = text
    return parsed


def build_summary_markdown(summary: dict[str, Any]) -> str:
    def section(title: str, body: Any) -> str:
        if isinstance(body, list):
            content = "\n".join(f"- {item}" for item in body) if body else "- None identified"
        else:
            content = str(body).strip() or "None identified."
        return f"## {title}\n{content}"

    parts = [
        section("Executive Summary", summary.get("executive_summary", "")),
        section("Scope Of Work", summary.get("scope_of_work", "")),
        section("Submission Overview", summary.get("submission_overview", "")),
        section("Evaluation Overview", summary.get("evaluation_overview", "")),
        section("Key Documents", summary.get("key_documents", [])),
        section("Risks And Watchouts", summary.get("risks_and_watchouts", [])),
        section("Notable Dates", summary.get("notable_dates", [])),
        section("Security Notes", summary.get("security_notes", [])),
    ]
    return "\n\n".join(parts).strip() + "\n"


async def call_llm_summary(client: httpx.AsyncClient, messages: list[dict[str, str]]) -> tuple[dict[str, Any], str]:
    model_name = LLM_MODEL
    if not model_name:
        models_response = await client.get(f"{LLM_BASE_URL}/models", timeout=HTTP_TIMEOUT)
        models_response.raise_for_status()
        models_payload = models_response.json()
        model_items = models_payload.get("data", [])
        if not model_items:
            raise RuntimeError("LLM /models endpoint returned no models")
        model_name = model_items[0].get("id")
        if not model_name:
            raise RuntimeError("LLM /models endpoint returned a model without an id")

    payload: dict[str, Any] = {
        "model": model_name,
        "messages": messages,
        "temperature": SUMMARY_TEMPERATURE,
        "stream": False,
    }

    response = await client.post(f"{LLM_BASE_URL}/chat/completions", json=payload, timeout=HTTP_TIMEOUT)
    response.raise_for_status()
    result = response.json()
    choices = result.get("choices", [])
    if not choices:
        raise RuntimeError("LLM response contained no choices")
    content = choices[0].get("message", {}).get("content", "")
    if not content:
        raise RuntimeError("LLM response contained no content")
    markdown = normalize_markdown_response(content)
    parsed = parse_markdown_summary(markdown)
    if not any(parsed.values()):
        parsed = {
            "executive_summary": markdown,
            "scope_of_work": "",
            "submission_overview": "",
            "evaluation_overview": "",
            "key_documents": [],
            "risks_and_watchouts": [],
            "notable_dates": [],
            "security_notes": [],
        }
        markdown = build_summary_markdown(parsed)
    return parsed, markdown


async def run_package_analysis(request: PackageAnalysisRequest) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        sections_payload = await fetch_json(
            client,
            f"{NORMALIZATION_SERVICE_BASE_URL}/v1/projects/{request.project_id}/sections",
        )
        requirements_payload = await fetch_json(
            client,
            f"{NORMALIZATION_SERVICE_BASE_URL}/v1/projects/{request.project_id}/requirements",
        )
        tables_payload = await fetch_json(
            client,
            f"{NORMALIZATION_SERVICE_BASE_URL}/v1/projects/{request.project_id}/tables",
        )

        if sections_payload.get("count", 0) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"No normalized sections found for project_id={request.project_id}. Normalize the package first.",
            )

        all_matches: list[dict[str, Any]] = []
        for _, query_text in SUMMARY_QUERY_SPECS:
            matches = await fetch_retrieval_matches(
                client,
                project_id=request.project_id,
                query=query_text,
                top_k=request.top_k_per_query,
            )
            matches = filter_matches_by_filename_pattern(matches, request.filename_pattern)
            all_matches.extend(matches)

        curated_matches = curate_package_matches(all_matches, request.max_matches)
        if not curated_matches:
            raise HTTPException(
                status_code=404,
                detail=f"No retrieval matches found for project_id={request.project_id}. Index the package first.",
            )

        doc_names = sorted({match.get("filename") for match in curated_matches if match.get("filename")})
        context_block = build_context_block("curated_package_evidence", curated_matches)
        summary_messages = build_summary_prompt(
            project_id=request.project_id,
            sections_count=sections_payload.get("count", 0),
            requirements_count=requirements_payload.get("count", 0),
            tables_count=tables_payload.get("count", 0),
            context_block=context_block,
        )
        summary, summary_markdown = await call_llm_summary(client, summary_messages)

    citations = [
        {
            "filename": match.get("filename"),
            "section_path": match.get("section_path"),
            "section_heading": match.get("section_heading"),
            "chunk_kind": match.get("chunk_kind"),
            "requirement_type": match.get("requirement_type"),
            "chunk_index": match.get("chunk_index"),
        }
        for match in curated_matches
    ]

    return {
        "project_id": request.project_id,
        "filename_pattern": request.filename_pattern,
        "artifact_counts": {
            "sections": sections_payload.get("count", 0),
            "requirements": requirements_payload.get("count", 0),
            "tables": tables_payload.get("count", 0),
        },
        "documents_considered": doc_names,
        "summary": summary,
        "summary_markdown": summary_markdown,
        "citations": citations,
    }


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title="Perfect RFP Analysis Service", version="0.1.0", lifespan=lifespan)


@app.get("/healthz")
async def healthz() -> dict[str, Any]:
    checks: dict[str, str] = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        for key, url in (
            ("normalization_service", f"{NORMALIZATION_SERVICE_BASE_URL}/healthz"),
            ("retrieval_service", f"{RETRIEVAL_SERVICE_BASE_URL}/healthz"),
        ):
            try:
                response = await client.get(url)
                response.raise_for_status()
                checks[key] = "ok"
            except Exception as exc:  # pragma: no cover - operational path
                checks[key] = f"error: {exc}"

        try:
            response = await client.get(f"{LLM_BASE_URL}/models")
            response.raise_for_status()
            checks["llm_service"] = "ok"
        except Exception as exc:  # pragma: no cover - operational path
            checks["llm_service"] = f"error: {exc}"

    ok = all(value == "ok" for value in checks.values())
    return {"status": "ok" if ok else "degraded", "checks": checks}


@app.post("/v1/analyze/rfp-package")
async def analyze_rfp_package(request: PackageAnalysisRequest) -> dict[str, Any]:
    return await run_package_analysis(request)


@app.get("/v1/projects/{project_id}/analyses/rfp-package-summary.md")
async def download_rfp_package_summary(
    project_id: str,
    filename_pattern: str | None = None,
    top_k_per_query: int = SUMMARY_TOP_K_PER_QUERY,
    max_matches: int = SUMMARY_MAX_MATCHES,
) -> Response:
    result = await run_package_analysis(
        PackageAnalysisRequest(
            project_id=project_id,
            filename_pattern=filename_pattern,
            top_k_per_query=top_k_per_query,
            max_matches=max_matches,
        )
    )
    suffix = ""
    if filename_pattern:
        suffix = "-filtered"
    filename = f"{project_id}{suffix}-rfp-package-summary.md"
    return Response(
        content=result["summary_markdown"],
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
