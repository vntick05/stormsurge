# Perfect RFP Execution Plan

## Foundation

Keep these as the fixed base:

- `perfect-rfp-trtllm`: TensorRT-LLM inference runtime
- `perfect-rfp-api`: stable internal LLM API boundary
- `perfect-rfp-open-webui`: optional human-facing UI

## Reused Infrastructure

Rebuild these services inside the new stack while reusing old persistent data volumes:

- `perfect-rfp-postgres`
- `perfect-rfp-redis`
- `perfect-rfp-minio`
- `perfect-rfp-qdrant`

Reason:

- preserves useful data
- keeps the new project architecture clean
- avoids reviving the old app containers

## Document Ingestion

Add and use:

- `perfect-rfp-tika`

Planned document flow:

1. upload file
2. store original in MinIO
3. extract text and metadata with Tika
4. normalize and chunk
5. persist metadata in Postgres
6. write vectors to Qdrant
7. retrieve through Haystack-backed retrieval service

## Next Services To Build

- `services/document-service`
  - upload API
  - Tika integration
  - MinIO writes
  - Postgres metadata
  - Redis jobs

- `services/retrieval-service`
  - Haystack indexing
  - Haystack retrieval
  - Qdrant integration
  - citations and filtering

- `services/agent-service`
  - agent orchestration
  - calls `perfect-rfp-api` for LLM access
  - calls retrieval/document services for context

## Rules

- all agents call the LLM through `perfect-rfp-api`
- document parsing stays separate from inference
- do not reintroduce old app containers
- do not let future services bypass the stable LLM boundary
