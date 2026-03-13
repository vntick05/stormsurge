# Retrieval Service

`retrieval-service` is the first Haystack-backed retrieval layer in the Perfect RFP stack.

Current responsibilities:

- uploads a local folder into `document-service`
- triggers project normalization in `normalization-service` before indexing
- runs a Haystack indexing pipeline over extracted documents in Postgres
- prefers Docling structured JSON from `normalization-service` when available
- builds section-aware records from normalized document structure instead of reparsing Markdown
- indexes table chunks alongside section and requirement chunks
- extracts requirement-like statements such as instructions, submissions, and evaluation language
- writes chunk embeddings into Qdrant
- performs metadata-filtered semantic retrieval by `project_id`

Dependencies:

- Qdrant
- Postgres
- `document-service`
- `normalization-service`

Container:

- `perfect-rfp-retrieval-service`

Port:

- `8381`

Endpoints:

- `GET /healthz`
- `POST /v1/ingest/folder`
- `POST /v1/index/project`
- `POST /v1/seed/setup`
- `POST /v1/query`

Seed workflow:

```bash
curl -sS -X POST http://127.0.0.1:8381/v1/seed/setup \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "strata-rfp",
    "skip_existing": true
  }'
```

Default folder resolution:

- If `folder_path` is omitted, the service reads from `/opt/perfect-rfp/data/rfps/<project_id>`.
- That keeps each RFP in its own ingest directory by default.
- Empty RFP folders are rejected with `400` so ingest jobs do not silently succeed with zero files.

Query example:

```bash
curl -sS -X POST http://127.0.0.1:8381/v1/query \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "strata-rfp",
    "query": "What are the Section L submission requirements?",
    "top_k": 5
  }'
```

Notes:

- The service uses deterministic chunk IDs so rerunning indexing upserts the same filenames instead of creating duplicate vectors.
- Retrieval and indexing are always scoped by `project_id`.
- The default multi-RFP repo layout is `data/rfps/<project_id>/`.
- `scripts/ingest_rfp.sh <project_id>` is the simplest local ingest path for a prepared RFP folder.
- `POST /v1/seed/setup` performs ingest, normalization, and indexing as one flow.
- Retrieval responses now include `section_path`, `section_heading`, `chunk_kind`, `requirement_type`, `normalization_provider`, `text`, and `body_text`.
- `chunk_kind` can be `section`, `requirement`, or `table`.
- Embeddings can come from local FastEmbed or an OpenAI-compatible `/embeddings` API via `RETRIEVAL_EMBEDDING_PROVIDER`.
- The default collection name is `perfect_rfp_chunks_structured` so the structure-aware index does not conflict with the older heuristic one.
- `bge-m3` is supported through an external OpenAI-compatible embeddings endpoint; the local FastEmbed fallback remains `BAAI/bge-small-en-v1.5` because this FastEmbed build does not support `BAAI/bge-m3`.
- If you change embedding dimensionality, use a new `RETRIEVAL_QDRANT_COLLECTION` or rebuild the existing collection before reindexing.
