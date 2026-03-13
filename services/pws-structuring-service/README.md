# Perfect PWS Structuring Service

`pws-structuring-service` is a new narrow service for the `Perfect-PWS` phase.

Scope for this phase:

- single PWS document in
- deterministic Stage 1 section tree out
- reviewable JSON first
- no requirement extraction
- no retrieval
- no Qdrant work
- no LLM dependency for structure

Intentional reuse:

- reuse Docling-style structural output when available
- reuse existing `document-service` and `normalization-service` artifacts as inputs
- keep Postgres, Redis, MinIO, Tika, the TensorRT-LLM path, `perfect-rfp-api`, and chat behavior untouched

Intentional bypass for now:

- `retrieval-service`
- `analysis-service`
- vector indexing
- project-aware chat
- LLM-based structure inference

Endpoints:

- `GET /healthz`
- `GET /`
- `POST /ui/upload`
- `POST /v1/pws/stage1/from-artifact`
- `POST /v1/pws/stage1/upload`
- `POST /v1/pws/outline/upload`

`/v1/pws/stage1/from-artifact` accepts:

- `filename`
- `structured_document` or `docling_structured_document`
- optional `normalized_markdown`

It returns:

- Stage 1 section tree
- audit counts
- rejected heading candidate preview

Browser flow:

- open `/`
- upload a `.docx`, `.pdf`, `.txt`, or `.md` PWS
- receive an in-browser hierarchy view with sections, paragraphs, and bullets

Example from an existing normalization artifact:

```bash
python3 /home/admin/perfect-rfp-trt/scripts/run_pws_stage1.py \
  /home/admin/perfect-rfp-trt/outputs/demo-pws-extract.json
```
