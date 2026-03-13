# Perfect RFP TRT-LLM Service

This directory contains the local Perfect RFP foundation stack:

- TensorRT-LLM inference
- stable internal LLM API boundary
- Open WebUI
- reusable document infrastructure
- Apache Tika for document extraction

Serving runtime:
- TensorRT-LLM

Serving image:
- `nvcr.io/nvidia/tensorrt-llm/release:1.2.0rc6`

Serving command:
- `trtllm-serve`

## Files

- `compose.yaml`: single TRT-LLM service
- `.env.example`: required environment variables
- `scripts/serve.sh`: startup script that verifies model access and launches `trtllm-serve`
- `gateway/`: thin HTTP proxy that exposes one stable endpoint for future apps
- `docs/PLAN.md`: execution plan for the document and agent platform
- `services/`: scaffolding for the next application services
- `open-webui-data/`: persistent Open WebUI app data

## Setup

Create a runtime env file:

```bash
cd /home/admin/perfect-rfp-trt
cp .env.example .env
```

Edit `.env` and set:
- `HF_TOKEN`
- `MODEL_HANDLE` if you want a different NVIDIA Spark-supported TRT-LLM model

## Start

```bash
cd /home/admin/perfect-rfp-trt
docker compose --env-file .env -f compose.yaml up -d
```

## Stop

```bash
cd /home/admin/perfect-rfp-trt
docker compose --env-file .env -f compose.yaml down
```

## Validate

```bash
docker logs -f perfect-rfp-postgres
docker logs -f perfect-rfp-redis
docker logs -f perfect-rfp-minio
docker logs -f perfect-rfp-qdrant
docker logs -f perfect-rfp-tika
docker logs -f perfect-rfp-trtllm
docker logs -f perfect-rfp-api
docker logs -f perfect-rfp-open-webui
curl -sS http://127.0.0.1:9998/tika
curl -sS http://127.0.0.1:6333/healthz
curl -sS http://127.0.0.1:8355/health
curl -sS http://127.0.0.1:8360/health
curl -sS http://127.0.0.1:8355/v1/models
curl -sS http://127.0.0.1:8360/v1/models
```

## Stable API boundary

Future apps should call the proxy on port `8360`, not the raw TRT-LLM port.

- Stable endpoint: `http://127.0.0.1:8360`
- Internal TRT-LLM endpoint: `http://127.0.0.1:8355`

Exposed routes:
- `GET /health`
- `GET /version`
- `GET /v1/models`
- `POST /v1/completions`
- `POST /v1/chat/completions`

## Open WebUI

Open WebUI is exposed on `http://127.0.0.1:3000`.

It is configured to use the stable API boundary, not the raw TRT-LLM server:

- Open WebUI -> `http://host.docker.internal:8360/v1`
- Stable API -> `http://127.0.0.1:8360`
- TensorRT-LLM -> `http://127.0.0.1:8355`

## Document Infrastructure

Additional services in this stack:

- Postgres: `127.0.0.1:5432`
- Redis: `127.0.0.1:6379`
- Qdrant: `127.0.0.1:6333`
- MinIO S3: `127.0.0.1:9000`
- MinIO console: `127.0.0.1:9001`
- Tika: `127.0.0.1:9998`
- Document service: `127.0.0.1:8081`
- Normalization service: `127.0.0.1:8091`
- Retrieval service: `127.0.0.1:8381`
- Analysis service: `127.0.0.1:8092`

## Document Service

The first application service is `document-service`.

Current responsibilities:

- accepts file uploads
- stores raw files in MinIO
- extracts text through Apache Tika
- writes document metadata and extracted text to Postgres
- emits a Redis event for downstream indexing work

Validation example:

```bash
curl -sS http://127.0.0.1:8081/healthz
curl -sS -X POST http://127.0.0.1:8081/v1/documents/upload \
  -F project_id=demo-project \
  -F file=@/path/to/file.pdf
```

## Retrieval Service

The first Haystack-backed retrieval service is `retrieval-service`.

Current responsibilities:

- ingests a local folder through `document-service`
- prefers Docling structured JSON from `normalization-service` when available, with Markdown/text fallback
- builds section-aware records from normalized document structure instead of reparsing Markdown tables
- indexes first-class table chunks in addition to section and requirement chunks
- extracts requirement-oriented statements from those sections
- builds chunked embeddings into Qdrant
- retrieves semantically relevant chunks filtered by `project_id`

## Normalization Service

`normalization-service` converts raw uploaded documents into richer structured artifacts.

Current responsibilities:

- reads raw originals from MinIO
- converts with Docling
- writes normalized Markdown and structured JSON into MinIO bucket `normalized`
- persists normalization records in Postgres
- materializes first-class `sections`, `requirements`, and `tables` records in Postgres
- exposes a direct upload path for PWS-only structural extraction

Validation example:

```bash
curl -sS http://127.0.0.1:8091/healthz
curl -sS -X POST http://127.0.0.1:8091/v1/normalize/project \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "starting-test-set",
    "skip_existing": true
  }'
```

Direct PWS extraction example:

```bash
curl -sS -X POST http://127.0.0.1:8091/v1/pws/extract \
  -F project_id=demo-pws \
  -F file=@/path/to/PWS.docx
```

That direct extraction response includes normalized Markdown, the Docling structured document JSON, and the PWS-specific structured extraction payload with blocks, sections, tables, table rows, table cells, appendix sections, and audit metadata.

If host access to `127.0.0.1:8091` is unreliable in your shell, use the repo script instead:

```bash
./scripts/extract_pws.sh demo-pws /path/to/PWS.docx outputs/demo-pws-extract.json
./scripts/extract_pws_hierarchy_xlsx.sh demo-pws /path/to/PWS.docx outputs/demo-pws-hierarchy.xlsx
```

Artifact review examples:

```bash
curl -sS http://127.0.0.1:8091/v1/projects/starting-test-set/sections
curl -sS http://127.0.0.1:8091/v1/projects/starting-test-set/requirements
curl -sS http://127.0.0.1:8091/v1/projects/starting-test-set/tables
curl -OJ "http://127.0.0.1:8091/v1/projects/starting-test-set/exports/requirements.csv?filename_pattern=%25PWS%25"
curl -OJ "http://127.0.0.1:8091/v1/projects/starting-test-set/analyses/submission-requirements.csv?filename_pattern=%25Section%20L%25"
```

Validation examples:

```bash
curl -sS http://127.0.0.1:8381/healthz
curl -sS -X POST http://127.0.0.1:8381/v1/seed/setup \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "strata-rfp",
    "skip_existing": true
  }'
curl -sS -X POST http://127.0.0.1:8381/v1/query \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "strata-rfp",
    "query": "What are the Section L submission requirements?",
    "top_k": 5
  }'
```

Troubleshooting note:

- sandboxed terminal sessions can report false-negative connection errors for `127.0.0.1:8381` and `127.0.0.1:8092`
- if Docker shows `retrieval-service` or `analysis-service` as healthy but sandboxed `curl` fails, verify those ports from the host outside the sandbox before treating it as a service failure

Behavior notes:

- folder ingest skips only files whose latest stored `content_sha256` matches the local file, not just the filename
- retrieval chunks include `section_path` and `section_heading` so headings stay attached to the text returned to services and agents
- retrieval also labels chunks with `chunk_kind` and `requirement_type` so agent/tooling can distinguish `section`, `requirement`, and `table` records
- normalized retrieval records include `normalization_provider`, so downstream services know whether a hit came from Docling-backed structure
- normalization can now export project-wide requirement statements as JSON or Excel-friendly CSV, with optional filename filtering such as `%PWS%`
- normalization now also provides a reusable submission-requirements analysis endpoint and CSV export for downstream tools and agents
- project reindex deletes prior chunk vectors for each reindexed filename before writing fresh chunks
- `seed/setup` aborts with an error if any file upload fails
- `seed/setup` now runs folder ingest, project normalization, and only then indexing, aborting if either ingest or normalization reports failures
- retrieval is always filtered by `project_id`, so RFPs stay isolated
- ingest fails fast if the RFP folder is empty or contains no regular files
- retrieval embeddings can come from local FastEmbed or an OpenAI-compatible embeddings API, configured through `RETRIEVAL_EMBEDDING_PROVIDER`
- the default retrieval collection is now `perfect_rfp_chunks_structured` so the new structure-aware index does not collide with older heuristic indexes
- `bge-m3` is supported through an external OpenAI-compatible embeddings endpoint; the local FastEmbed fallback remains `BAAI/bge-small-en-v1.5` because FastEmbed in this stack does not support `BAAI/bge-m3`

Seed dataset:

- multi-RFP repo path: `data/rfps/<project_id>/`
- mounted in `retrieval-service` as `/opt/perfect-rfp/data/rfps/<project_id>/`

Convenience ingest:

```bash
./scripts/ingest_rfp.sh strata-rfp
./scripts/ingest_rfp.sh strata-rfp /opt/perfect-rfp/data/rfps/strata-rfp
```

## Analysis Service

`analysis-service` generates human-readable RFP package summaries from the normalized and retrieved project evidence.

Example:

```bash
curl -sS -X POST http://127.0.0.1:8092/v1/analyze/rfp-package \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "starting-test-set"
  }'
curl -OJ "http://127.0.0.1:8092/v1/projects/starting-test-set/analyses/rfp-package-summary.md"
```

## Notes

- This stack includes Open WebUI as a separate UI container.
- This service does not include vLLM, Ollama, llama.cpp, TGI, or SGLang in the serving path.
- First boot can take several minutes while the model is prepared.
