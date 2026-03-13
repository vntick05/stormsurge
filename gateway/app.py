import json
import os
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse


TRTLLM_BASE_URL = os.environ.get("TRTLLM_BASE_URL", "http://127.0.0.1:8355").rstrip("/")
RETRIEVAL_SERVICE_BASE_URL = os.environ.get("RETRIEVAL_SERVICE_BASE_URL", "http://127.0.0.1:8481").rstrip("/")
PROJECTS_ROOT = Path(os.environ.get("PROJECTS_ROOT", "/opt/perfect-rfp/data/rfps"))
API_PORT = int(os.environ.get("API_PORT", "8460"))
PROJECT_CHAT_TOP_K = int(os.environ.get("PROJECT_CHAT_TOP_K", "8"))
PROJECT_CHAT_CONTEXT_CHARS = int(os.environ.get("PROJECT_CHAT_CONTEXT_CHARS", "900"))
IGNORED_CHAT_FILENAMES = {"project.json"}

app = FastAPI(title="Perfect RFP API", version="0.1.0")


def _copy_response_headers(response: httpx.Response) -> dict[str, str]:
    headers: dict[str, str] = {}
    for key in ("content-type", "cache-control"):
        if key in response.headers:
            headers[key] = response.headers[key]
    return headers


def load_project_manifests() -> list[dict[str, Any]]:
    manifests: list[dict[str, Any]] = []
    if not PROJECTS_ROOT.exists():
        return manifests
    for project_dir in sorted(path for path in PROJECTS_ROOT.iterdir() if path.is_dir()):
        manifest_path = project_dir / "project.json"
        if not manifest_path.exists():
            continue
        try:
            manifest = json.loads(manifest_path.read_text())
        except Exception:
            continue
        project_id = manifest.get("project_id") or project_dir.name
        display_name = manifest.get("display_name") or project_id
        model_id = manifest.get("model_id") or display_name
        manifests.append(
            {
                "project_id": project_id,
                "display_name": display_name,
                "model_id": model_id,
                "description": manifest.get("description", ""),
            }
        )
    return manifests


def resolve_project_manifest(model_id: str) -> dict[str, Any] | None:
    for manifest in load_project_manifests():
        if model_id in {manifest["model_id"], manifest["display_name"], manifest["project_id"]}:
            return manifest
    return None


async def get_upstream_model_id(client: httpx.AsyncClient) -> str:
    response = await client.get(f"{TRTLLM_BASE_URL}/v1/models", timeout=30.0)
    response.raise_for_status()
    payload = response.json()
    models = payload.get("data", [])
    if not models:
        raise RuntimeError("Upstream model list is empty")
    model_id = models[0].get("id")
    if not model_id:
        raise RuntimeError("Upstream model entry has no id")
    return model_id


async def _proxy_json(method: str, path: str, request: Request) -> Response:
    body = await request.body()
    headers = {"content-type": request.headers.get("content-type", "application/json")}
    async with httpx.AsyncClient(timeout=300.0) as client:
        upstream = await client.request(method, f"{TRTLLM_BASE_URL}{path}", content=body, headers=headers)
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=_copy_response_headers(upstream),
    )


def compact_context_text(match: dict[str, Any]) -> str:
    text = (match.get("body_text") or match.get("text") or "").strip()
    if len(text) <= PROJECT_CHAT_CONTEXT_CHARS:
        return text
    return text[: PROJECT_CHAT_CONTEXT_CHARS - 3].rstrip() + "..."


def build_project_rag_system_prompt(project_name: str, project_id: str, matches: list[dict[str, Any]]) -> str:
    lines = [
        f"You are the RFP assistant for project '{project_name}' (project_id={project_id}).",
        "Answer only from the provided project evidence.",
        "If the evidence is insufficient, say so clearly.",
        "Always cite filenames and section headings in the answer.",
        "",
        "Project evidence:",
    ]
    for index, match in enumerate(matches, start=1):
        lines.extend(
            [
                f"[Evidence {index}]",
                f"Document: {match.get('filename')}",
                f"Section Path: {match.get('section_path')}",
                f"Section Heading: {match.get('section_heading')}",
                f"Chunk Kind: {match.get('chunk_kind')}",
                f"Requirement Type: {match.get('requirement_type')}",
                f"Text: {compact_context_text(match)}",
                "",
            ]
        )
    return "\n".join(lines).strip()


async def fetch_project_matches(client: httpx.AsyncClient, project_id: str, query: str) -> list[dict[str, Any]]:
    response = await client.post(
        f"{RETRIEVAL_SERVICE_BASE_URL}/v1/query",
        json={"project_id": project_id, "query": query, "top_k": PROJECT_CHAT_TOP_K},
        timeout=120.0,
    )
    response.raise_for_status()
    payload = response.json()
    return [
        match
        for match in payload.get("matches", [])
        if (match.get("filename") or "") not in IGNORED_CHAT_FILENAMES
    ]


async def handle_project_chat(payload: dict[str, Any]) -> Response:
    manifest = resolve_project_manifest(payload.get("model", ""))
    if manifest is None:
        raise HTTPException(status_code=404, detail="Project model not found")

    messages = payload.get("messages", [])
    if not isinstance(messages, list) or not messages:
        raise HTTPException(status_code=400, detail="messages are required")

    user_messages = [message for message in messages if message.get("role") == "user"]
    if not user_messages:
        raise HTTPException(status_code=400, detail="at least one user message is required")
    latest_question = user_messages[-1].get("content", "")
    if not isinstance(latest_question, str) or not latest_question.strip():
        raise HTTPException(status_code=400, detail="latest user message must be text")

    client = httpx.AsyncClient(timeout=None)
    try:
        retrieval_matches = await fetch_project_matches(client, manifest["project_id"], latest_question)
        if not retrieval_matches:
            raise HTTPException(status_code=404, detail=f"No retrieval matches found for project_id={manifest['project_id']}")

        upstream_model_id = await get_upstream_model_id(client)
        system_prompt = build_project_rag_system_prompt(
            project_name=manifest["display_name"],
            project_id=manifest["project_id"],
            matches=retrieval_matches,
        )

        upstream_messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
        for message in messages:
            role = message.get("role")
            content = message.get("content")
            if role not in {"user", "assistant", "system"} or not isinstance(content, str):
                continue
            if role == "system":
                continue
            upstream_messages.append({"role": role, "content": content})

        upstream_payload = {
            "model": upstream_model_id,
            "messages": upstream_messages,
            "temperature": payload.get("temperature", 0.2),
            "stream": bool(payload.get("stream", False)),
        }

        if not upstream_payload["stream"]:
            upstream = await client.post(
                f"{TRTLLM_BASE_URL}/v1/chat/completions",
                json=upstream_payload,
                timeout=300.0,
            )
            return Response(
                content=upstream.content,
                status_code=upstream.status_code,
                headers=_copy_response_headers(upstream),
            )

        upstream = await client.send(
            client.build_request(
                "POST",
                f"{TRTLLM_BASE_URL}/v1/chat/completions",
                json=upstream_payload,
            ),
            stream=True,
        )
        if upstream.status_code >= 400:
            detail = await upstream.aread()
            await upstream.aclose()
            return Response(
                content=detail,
                status_code=upstream.status_code,
                headers=_copy_response_headers(upstream),
            )

        async def stream():
            try:
                async for chunk in upstream.aiter_bytes():
                    if chunk:
                        yield chunk
            finally:
                await upstream.aclose()
                await client.aclose()

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )
    finally:
        if not payload.get("stream", False):
            await client.aclose()


@app.get("/health")
async def health() -> Response:
    async with httpx.AsyncClient(timeout=10.0) as client:
        upstream = await client.get(f"{TRTLLM_BASE_URL}/health")
    return Response(status_code=upstream.status_code, headers=_copy_response_headers(upstream))


@app.get("/version")
async def version() -> JSONResponse:
    return JSONResponse(
        {
            "service": "stormsurge-api",
            "runtime": "TensorRT-LLM",
            "upstream": TRTLLM_BASE_URL,
            "port": API_PORT,
            "projects_root": str(PROJECTS_ROOT),
        }
    )


@app.get("/v1/models")
async def models() -> JSONResponse:
    async with httpx.AsyncClient(timeout=30.0) as client:
        upstream = await client.get(f"{TRTLLM_BASE_URL}/v1/models")
        upstream.raise_for_status()
        payload = upstream.json()

    project_models = [
        {
            "id": manifest["model_id"],
            "object": "model",
            "created": 0,
            "owned_by": "perfect_rfp_project",
            "project_id": manifest["project_id"],
            "display_name": manifest["display_name"],
            "description": manifest["description"],
        }
        for manifest in load_project_manifests()
    ]
    payload["data"] = project_models + payload.get("data", [])
    return JSONResponse(payload)


@app.post("/v1/completions")
async def completions(request: Request) -> Response:
    return await _proxy_json("POST", "/v1/completions", request)


@app.post("/v1/chat/completions")
async def chat_completions(request: Request) -> Response:
    payload = await request.json()
    if resolve_project_manifest(payload.get("model", "")) is not None:
        return await handle_project_chat(payload)

    body = await request.body()
    headers = {"content-type": request.headers.get("content-type", "application/json")}
    if not payload.get("stream", False):
        return await _proxy_json("POST", "/v1/chat/completions", request)

    client = httpx.AsyncClient(timeout=None)
    upstream = await client.send(
        client.build_request(
            "POST",
            f"{TRTLLM_BASE_URL}/v1/chat/completions",
            content=body,
            headers=headers,
        ),
        stream=True,
    )
    if upstream.status_code >= 400:
        detail = await upstream.aread()
        await upstream.aclose()
        await client.aclose()
        return Response(
            content=detail,
            status_code=upstream.status_code,
            headers=_copy_response_headers(upstream),
        )

    async def stream():
        try:
            async for chunk in upstream.aiter_bytes():
                if chunk:
                    yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
