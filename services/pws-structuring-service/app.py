import io
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError

from docling.datamodel.base_models import DocumentStream
from docling.document_converter import DocumentConverter
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel

from outline_view import (
    build_generic_outline,
    build_outline,
    count_outline_stats,
    render_result_page,
    render_upload_page,
)
from related_linker import build_related_links
from stage1_parser import build_stage1_section_tree, load_stage1_input
from xlsx_export import build_hierarchy_workbook


app = FastAPI(title="Perfect PWS Structuring Service", version="0.1.0")
converter: DocumentConverter | None = None
NORMALIZATION_SERVICE_BASE_URL = os.environ.get(
    "NORMALIZATION_SERVICE_BASE_URL", "http://127.0.0.1:8191"
).rstrip("/")
RETRIEVAL_SERVICE_BASE_URL = os.environ.get(
    "RETRIEVAL_SERVICE_BASE_URL", "http://127.0.0.1:8481"
).rstrip("/")
API_GATEWAY_BASE_URL = os.environ.get(
    "API_GATEWAY_BASE_URL", "http://127.0.0.1:8460"
).rstrip("/")
COMPANION_MAX_REQUIREMENTS = int(os.environ.get("COMPANION_MAX_REQUIREMENTS", "6"))
COMPANION_EVIDENCE_TOP_K = int(os.environ.get("COMPANION_EVIDENCE_TOP_K", "4"))
_DEFAULT_WORKSPACE_STORAGE_DIR = Path(__file__).resolve().parent / "outputs" / "pws-workspaces"
WORKSPACE_STORAGE_DIR = Path(
    os.environ.get("PWS_WORKSPACE_STORAGE_DIR", str(_DEFAULT_WORKSPACE_STORAGE_DIR))
)


class Stage1ArtifactRequest(BaseModel):
    filename: str
    structured_document: dict[str, Any] | str | None = None
    docling_structured_document: dict[str, Any] | str | None = None
    normalized_markdown: str | None = None
    markdown: str | None = None


class RelatedRequirementSearchRequest(BaseModel):
    source_requirement_id: str | None = None
    source_text: str | None = None
    query_text: str | None = None
    source_filename: str | None = None
    limit: int = 20


class SaveWorkspaceRequest(BaseModel):
    workspace_name: str | None = None
    filename: str
    project_id: str | None = None
    outline: list[dict[str, Any]]
    linked_requirements_by_source: dict[str, list[dict[str, Any]]] | None = None
    selected_requirement_id: str | None = None
    selected_requirement_ids: list[str] | None = None
    active_tool: str | None = None
    solution_groups: list[dict[str, Any]] | None = None
    companion_notes_by_requirement: dict[str, list[dict[str, Any]]] | None = None


class ExportHierarchyRequest(BaseModel):
    filename: str
    rows: list[dict[str, Any]]


class CompanionRequirement(BaseModel):
    id: str
    section: str | None = None
    text: str


class LLMCompanionRequest(BaseModel):
    project_id: str | None = None
    prompt: str
    checked_requirements: list[CompanionRequirement] = []
    mode: str = "ask"
    use_project_evidence: bool = True
    persona: str = "solution_architect"


def get_converter() -> DocumentConverter:
    global converter
    if converter is None:
        converter = DocumentConverter()
    return converter


def normalize_with_docling(filename: str, content: bytes) -> tuple[str | None, dict[str, Any]]:
    suffix = Path(filename).suffix.lower()
    if suffix in {".md", ".markdown", ".txt"}:
        return content.decode("utf-8", errors="ignore"), {}
    stream = DocumentStream(name=filename, stream=io.BytesIO(content))
    result = get_converter().convert(stream)
    markdown = result.document.export_to_markdown()
    if hasattr(result.document, "export_to_dict"):
        structured_document = result.document.export_to_dict()
    elif hasattr(result.document, "model_dump"):
        structured_document = result.document.model_dump()
    else:
        structured_document = json.loads(result.document.export_to_json())
    return markdown, structured_document


def build_outline_payload(filename: str, markdown: str | None) -> dict[str, Any]:
    if not markdown:
        raise ValueError("Docling did not return normalized markdown")
    outline = build_outline(markdown)
    if not outline and markdown.strip():
        outline = build_generic_outline(markdown, Path(filename).stem or "Imported Document")
    return {
        "filename": filename,
        "format": "simple_pws_outline_v1",
        "root_sections": outline,
    }


async def read_upload_to_outline(file: UploadFile) -> dict[str, Any]:
    content = await file.read()
    filename = file.filename or "uploaded-pws.bin"
    if not content:
        raise ValueError(f"Uploaded file is empty: {filename}")
    markdown, _ = normalize_with_docling(filename, content)
    payload = build_outline_payload(filename, markdown)
    return {
        "filename": filename,
        "outline": payload["root_sections"],
    }


def build_correlation_payload(
    primary: dict[str, Any],
    supporting_documents: list[dict[str, Any]],
    notices: list[str] | None = None,
) -> dict[str, Any]:
    related_links = build_related_links(
        primary_filename=primary["filename"],
        primary_outline=primary["outline"],
        supporting_documents=supporting_documents,
    )
    stats = count_outline_stats(primary["outline"])
    return {
        "primary_document": primary["filename"],
        "outline": primary["outline"],
        "related_links": related_links,
        "related_document_count": len(supporting_documents),
        "stats": stats,
        "notices": notices or [],
        "supporting_documents": [item["filename"] for item in supporting_documents],
    }


def post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib_request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=30) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            raw_body = response.read().decode(charset)
            try:
                return json.loads(raw_body)
            except json.JSONDecodeError as exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"Upstream returned non-JSON response from {url}: {raw_body[:400]}",
                ) from exc
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=exc.code, detail=detail) from exc
    except URLError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Normalization service unavailable: {exc}",
        ) from exc


def post_json_with_timeout(url: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib_request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=timeout) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            raw_body = response.read().decode(charset)
            try:
                return json.loads(raw_body)
            except json.JSONDecodeError as exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"Upstream returned non-JSON response from {url}: {raw_body[:400]}",
                ) from exc
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=exc.code, detail=detail) from exc
    except URLError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Upstream service unavailable: {exc}",
        ) from exc


def get_json(url: str) -> dict[str, Any]:
    req = urllib_request.Request(url, method="GET")
    try:
        with urllib_request.urlopen(req, timeout=15) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return json.loads(response.read().decode(charset))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=exc.code, detail=detail) from exc
    except URLError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Normalization service unavailable: {exc}",
        ) from exc


def fetch_active_projects() -> list[dict[str, Any]]:
    try:
        payload = get_json(f"{NORMALIZATION_SERVICE_BASE_URL}/v1/projects")
        projects = payload.get("projects", [])
        return projects if isinstance(projects, list) else []
    except HTTPException:
        return []


def fetch_gateway_model_id() -> str:
    payload = get_json(f"{API_GATEWAY_BASE_URL}/v1/models")
    models = payload.get("data", [])
    if not isinstance(models, list) or not models:
        raise HTTPException(status_code=502, detail="No gateway models available")
    for model in models:
        model_id = model.get("id")
        owned_by = str(model.get("owned_by") or "")
        if isinstance(model_id, str) and model_id.strip() and owned_by != "perfect_rfp_project":
            return model_id
    model_id = models[0].get("id")
    if not isinstance(model_id, str) or not model_id.strip():
        raise HTTPException(status_code=502, detail="Gateway model id unavailable")
    return model_id


def fetch_project_evidence(project_id: str, query: str, top_k: int = 8) -> list[dict[str, Any]]:
    payload = post_json(
        f"{RETRIEVAL_SERVICE_BASE_URL}/v1/query",
        {
            "project_id": project_id,
            "query": query,
            "top_k": top_k,
        },
    )
    matches = payload.get("matches", [])
    return matches if isinstance(matches, list) else []


def clean_companion_text(text: str, limit: int = 500) -> str:
    cleaned = " ".join(str(text or "").replace("\r", "\n").split())
    cleaned = re.sub(r"\b(?:Table|Figure)\s+\d+[A-Za-z0-9.\-]*\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\|{2,}", " ", cleaned)
    cleaned = re.sub(r"(?:\s+[A-Z]{1,4}\s+){4,}", " ", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 3].rstrip() + "..."


def build_companion_system_prompt(
    mode: str,
    checked_requirements: list[CompanionRequirement],
    evidence: list[dict[str, Any]],
    persona: str = "solution_architect",
    use_project_evidence: bool = True,
) -> str:
    mode_instruction = (
        "Help the user develop a shared solution approach for the checked requirements."
        if mode == "solution"
        else "Answer the user's question using the checked requirements and evidence."
    )
    lines = [
        "You are StormSurge for a PWS review workspace.",
        mode_instruction,
        (
            "Ground your response in the checked requirements and the retrieved project evidence."
            if use_project_evidence
            else "Ground your response only in the checked requirements provided in this request."
        ),
        "Write in clear, human prose.",
        "Do not dump raw tables, OCR fragments, line noise, or copied chunk text.",
        "Synthesize the evidence into readable sentences and short bullets only when useful.",
        "Prefer short paragraphs over long enumerations.",
        "Do not use markdown tables.",
        "Do not invent section headers unless the user asked for an outline.",
        "Do not start with decorative headings like '###'.",
        "For solution drafting, write like a practical proposal manager, not a report generator.",
        "Default format: 1 short intro paragraph, then 3-6 flat bullets if needed.",
        "If a source contains noisy formatting, ignore the noise and keep only the substantive meaning.",
        "Be concrete and concise.",
        "Cite filenames and section headings when using evidence.",
        "If evidence is weak or missing, say so clearly.",
        "Do not mention prompt mechanics, checked-requirement counts, truncation, missing hidden context, or source-retrieval limitations unless the user explicitly asks about them.",
        "",
        f"Response persona: {persona}",
    ]
    if persona == "solution_architect":
        lines.extend(
            [
                "Act like a senior solution architect shaping a practical technical approach.",
                "Do not restate requirements unless necessary.",
                "Focus on implementation approach, components, interfaces, operations, risks, assumptions, and delivery shape.",
                "When helpful, propose an architecture or execution approach rather than summarizing source text.",
                "",
            ]
        )
    elif persona == "proposal_manager":
        lines.extend(
            [
                "Act like a proposal manager organizing a response strategy.",
                "Focus on compliance coverage, response themes, risks, assumptions, and win strategy alignment.",
                "Treat the checked requirements included below as the complete working requirement set for this answer.",
                "Synthesize across the full set instead of disclaiming that only some requirements were expanded.",
                "",
            ]
        )
    else:
        lines.extend(
            [
                "Act like a technical analyst.",
                "Focus on clear interpretation and grounded explanation.",
                "",
            ]
        )
    lines.extend([
        "Checked requirements:",
    ])
    max_requirements = (
        len(checked_requirements)
        if persona == "proposal_manager" and not use_project_evidence
        else COMPANION_MAX_REQUIREMENTS
    )
    trimmed_requirements = checked_requirements[:max_requirements]
    for index, requirement in enumerate(trimmed_requirements, start=1):
        lines.extend(
            [
                f"[Requirement {index}] {requirement.id}",
                f"Section: {requirement.section or ''}",
                f"Text: {clean_companion_text(requirement.text, limit=420)}",
                "",
            ]
        )
    if len(checked_requirements) > len(trimmed_requirements) and use_project_evidence:
        lines.append(
            f"Additional checked requirements not expanded here: {len(checked_requirements) - len(trimmed_requirements)}"
        )
        lines.append("")
    if evidence:
        lines.append("Retrieved evidence:")
        for index, match in enumerate(evidence[:COMPANION_EVIDENCE_TOP_K], start=1):
            lines.extend(
                [
                    f"[Evidence {index}]",
                    f"Document: {match.get('filename')}",
                    f"Section: {match.get('section_number') or match.get('section_path') or ''} {match.get('section_heading') or ''}".strip(),
                    f"Chunk Kind: {match.get('chunk_kind') or ''}",
                    f"Text: {clean_companion_text(str(match.get('body_text') or match.get('text') or ''))}",
                    "",
                ]
            )
    return "\n".join(lines).strip()


def build_companion_upstream_payload(
    request: LLMCompanionRequest,
    checked: list[CompanionRequirement],
    evidence: list[dict[str, Any]],
    stream: bool,
) -> dict[str, Any]:
    system_prompt = build_companion_system_prompt(
        request.mode,
        checked,
        evidence,
        request.persona,
        request.use_project_evidence,
    )
    model_id = fetch_gateway_model_id()
    return {
        "model": model_id,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": request.prompt.strip()},
        ],
        "temperature": 0.1,
        "stream": stream,
    }


def slugify_workspace_name(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "workspace"


def ensure_workspace_storage_dir() -> None:
    WORKSPACE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def list_saved_workspaces() -> list[dict[str, Any]]:
    ensure_workspace_storage_dir()
    workspaces: list[dict[str, Any]] = []
    for path in sorted(WORKSPACE_STORAGE_DIR.glob("*.json"), reverse=True):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        workspaces.append(
            {
                "workspace_id": payload.get("workspace_id") or path.stem,
                "workspace_name": payload.get("workspace_name") or path.stem,
                "filename": payload.get("filename") or "",
                "project_id": payload.get("project_id") or "",
                "updated_at": payload.get("updated_at") or payload.get("created_at") or "",
            }
        )
    return workspaces


def load_saved_workspace(workspace_id: str) -> dict[str, Any]:
    ensure_workspace_storage_dir()
    path = WORKSPACE_STORAGE_DIR / f"{workspace_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Saved workspace not found")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="Saved workspace is unreadable") from exc


def write_saved_workspace(request: SaveWorkspaceRequest) -> dict[str, Any]:
    ensure_workspace_storage_dir()
    now = datetime.now(timezone.utc).isoformat()
    requested_name = (request.workspace_name or "").strip()
    default_name = Path(request.filename or "workspace").stem
    workspace_name = requested_name or default_name
    existing_id = slugify_workspace_name(workspace_name)
    path = WORKSPACE_STORAGE_DIR / f"{existing_id}.json"
    created_at = now
    if path.exists():
        try:
            existing_payload = json.loads(path.read_text(encoding="utf-8"))
            created_at = existing_payload.get("created_at") or now
        except (OSError, json.JSONDecodeError):
            created_at = now
    payload = {
        "workspace_id": existing_id,
        "workspace_name": workspace_name,
        "filename": request.filename,
        "project_id": request.project_id,
        "outline": request.outline,
        "linked_requirements_by_source": request.linked_requirements_by_source or {},
        "selected_requirement_id": request.selected_requirement_id,
        "selected_requirement_ids": request.selected_requirement_ids or [],
        "active_tool": request.active_tool or "requirement-search",
        "solution_groups": request.solution_groups or [],
        "companion_notes_by_requirement": request.companion_notes_by_requirement or {},
        "created_at": created_at,
        "updated_at": now,
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return {
        "workspace_id": existing_id,
        "workspace_name": workspace_name,
        "updated_at": now,
    }


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "stormsurge-pws-structuring-service"}


@app.get("/", response_class=HTMLResponse)
def upload_page() -> str:
    return render_upload_page(
        active_projects=fetch_active_projects(),
        saved_workspaces=list_saved_workspaces(),
    )


@app.post("/v1/pws/stage1/from-artifact")
def stage1_from_artifact(request: Stage1ArtifactRequest) -> dict[str, Any]:
    try:
        filename, structured_document, normalized_markdown = load_stage1_input(
            request.model_dump()
        )
        return build_stage1_section_tree(
            filename=filename,
            structured_document=structured_document,
            normalized_markdown=normalized_markdown,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/v1/pws/stage1/upload")
async def stage1_upload(file: UploadFile = File(...)) -> dict[str, Any]:
    content = await file.read()
    filename = file.filename or "uploaded-pws.bin"
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    try:
        markdown, structured_document = normalize_with_docling(filename, content)
        return build_stage1_section_tree(
            filename=filename,
            structured_document=structured_document,
            normalized_markdown=markdown,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unable to build Stage 1 structure: {exc}") from exc


@app.post("/v1/pws/outline/upload")
async def outline_upload(
    file: UploadFile = File(...),
    project_id: str | None = Form(default=None),
) -> dict[str, Any]:
    content = await file.read()
    filename = file.filename or "uploaded-pws.bin"
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    try:
        markdown, _ = normalize_with_docling(filename, content)
        payload = build_outline_payload(filename, markdown)
        payload["project_id"] = project_id.strip() if project_id else None
        return payload
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unable to build outline: {exc}") from exc


@app.post("/v1/pws/correlate/upload")
async def correlate_upload(
    primary_file: UploadFile = File(...),
    related_files: list[UploadFile] = File(default=[]),
) -> dict[str, Any]:
    try:
        primary = await read_upload_to_outline(primary_file)
        supporting_documents: list[dict[str, Any]] = []
        notices: list[str] = []
        for related_file in related_files:
            if not related_file.filename:
                continue
            try:
                supporting_documents.append(await read_upload_to_outline(related_file))
            except Exception as exc:
                notices.append(f"Skipped related document {related_file.filename}: {exc}")
        return build_correlation_payload(primary, supporting_documents, notices)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unable to correlate documents: {exc}") from exc


@app.post("/v1/projects/{project_id}/requirements/search-related")
def proxy_search_related_requirements(
    project_id: str, request: RelatedRequirementSearchRequest
) -> dict[str, Any]:
    payload = post_json(
        f"{NORMALIZATION_SERVICE_BASE_URL}/v1/projects/{project_id}/requirements/search-related",
        request.model_dump(),
    )
    return payload


@app.get("/v1/projects")
def proxy_projects() -> dict[str, Any]:
    return get_json(f"{NORMALIZATION_SERVICE_BASE_URL}/v1/projects")


@app.post("/v1/pws/workspaces")
def save_workspace(request: SaveWorkspaceRequest) -> dict[str, Any]:
    return write_saved_workspace(request)


@app.post("/v1/pws/export/hierarchy")
def export_hierarchy(request: ExportHierarchyRequest) -> Response:
    workbook = build_hierarchy_workbook(request.rows)
    stem = Path(request.filename or "perfect-pws").stem
    safe_name = slugify_workspace_name(stem) or "perfect-pws"
    return Response(
        content=workbook,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}-hierarchy.xlsx"'
        },
    )


@app.post("/v1/pws/llm-companion")
def llm_companion(request: LLMCompanionRequest) -> dict[str, Any]:
    try:
        checked = request.checked_requirements or []
        if not checked:
            raise HTTPException(status_code=400, detail="checked_requirements are required")
        prompt = (request.prompt or "").strip()
        if not prompt:
            raise HTTPException(status_code=400, detail="prompt is required")

        evidence: list[dict[str, Any]] = []
        if request.project_id and request.use_project_evidence:
            query = "\n".join(
                [prompt] + [f"{item.id} {item.section or ''} {item.text}" for item in checked]
            )
            try:
                evidence = fetch_project_evidence(request.project_id, query, top_k=COMPANION_EVIDENCE_TOP_K)
            except HTTPException:
                evidence = []

        upstream_payload = build_companion_upstream_payload(request, checked, evidence, stream=False)
        response = post_json_with_timeout(
            f"{API_GATEWAY_BASE_URL}/v1/chat/completions",
            upstream_payload,
            timeout=300,
        )
        content = ""
        choices = response.get("choices", [])
        if isinstance(choices, list) and choices:
            message = choices[0].get("message", {})
            if isinstance(message, dict):
                content = str(message.get("content") or "")
        return {
            "answer": content,
            "evidence": evidence,
            "checked_requirement_count": len(checked),
            "mode": request.mode,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LLM companion failed: {exc}") from exc


@app.post("/v1/pws/llm-companion/stream")
def llm_companion_stream(request: LLMCompanionRequest) -> StreamingResponse:
    checked = request.checked_requirements or []
    if not checked:
        raise HTTPException(status_code=400, detail="checked_requirements are required")
    prompt = (request.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    evidence: list[dict[str, Any]] = []
    if request.project_id and request.use_project_evidence:
        query = "\n".join(
            [prompt] + [f"{item.id} {item.section or ''} {item.text}" for item in checked]
        )
        try:
            evidence = fetch_project_evidence(request.project_id, query, top_k=COMPANION_EVIDENCE_TOP_K)
        except HTTPException:
            evidence = []

    upstream_payload = build_companion_upstream_payload(request, checked, evidence, stream=True)

    def event_stream():
        yield f"event: evidence\ndata: {json.dumps({'evidence': evidence})}\n\n"
        data = json.dumps(upstream_payload).encode("utf-8")
        req = urllib_request.Request(
            f"{API_GATEWAY_BASE_URL}/v1/chat/completions",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib_request.urlopen(req, timeout=300) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                for raw_line in response:
                    line = raw_line.decode(charset, errors="replace").strip()
                    if not line or not line.startswith("data: "):
                        continue
                    payload = line[6:].strip()
                    if payload == "[DONE]":
                        yield "event: done\ndata: {}\n\n"
                        return
                    try:
                        chunk = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    choices = chunk.get("choices", [])
                    if not isinstance(choices, list) or not choices:
                        continue
                    delta = choices[0].get("delta", {})
                    content = ""
                    if isinstance(delta, dict):
                        content = str(delta.get("content") or "")
                    if content:
                        yield f"event: token\ndata: {json.dumps({'delta': content})}\n\n"
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            yield f"event: error\ndata: {json.dumps({'detail': detail})}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'detail': str(exc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/ui/workspaces/{workspace_id}", response_class=HTMLResponse)
def load_workspace_page(workspace_id: str) -> str:
    payload = load_saved_workspace(workspace_id)
    return render_result_page(
        payload.get("filename") or "Saved workspace",
        payload.get("outline") or [],
        project_id=payload.get("project_id"),
        related_links=None,
        related_document_count=0,
        notices=None,
        workspace_id=payload.get("workspace_id"),
        workspace_name=payload.get("workspace_name"),
        initial_linked_requirements_by_source=payload.get("linked_requirements_by_source") or {},
        initial_selected_requirement_id=payload.get("selected_requirement_id"),
        initial_selected_requirement_ids=payload.get("selected_requirement_ids") or [],
        initial_active_tool=payload.get("active_tool") or "requirement-search",
        initial_solution_groups=payload.get("solution_groups") or [],
        initial_companion_notes_by_requirement=payload.get("companion_notes_by_requirement") or {},
    )


@app.post("/ui/upload", response_class=HTMLResponse)
async def ui_upload(
    primary_file: UploadFile = File(...),
    related_files: list[UploadFile] = File(default=[]),
    project_id: str | None = Form(default=None),
) -> str:
    try:
        primary = await read_upload_to_outline(primary_file)
        supporting_documents: list[dict[str, Any]] = []
        notices: list[str] = []
        for related_file in related_files:
            if not related_file.filename:
                continue
            try:
                supporting_documents.append(await read_upload_to_outline(related_file))
            except Exception as exc:
                notices.append(f"Skipped related document {related_file.filename}: {exc}")
        payload = build_correlation_payload(primary, supporting_documents, notices)
        return render_result_page(
            primary["filename"],
            primary["outline"],
            project_id=project_id.strip() if project_id else None,
            related_links=payload["related_links"],
            related_document_count=payload["related_document_count"],
            notices=payload["notices"],
        )
    except Exception as exc:
        return render_upload_page(
            f"Unable to build outline: {exc}",
            active_projects=fetch_active_projects(),
            saved_workspaces=list_saved_workspaces(),
        )
