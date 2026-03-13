# Normalization Service

`normalization-service` is the structured document conversion layer for the Perfect RFP stack.

Current responsibilities:

- reads extracted document records from Postgres
- loads raw originals from MinIO
- converts documents with Docling
- stores normalized Markdown and structured JSON in MinIO
- persists normalization status and artifacts in Postgres
- materializes first-class `document_sections`, `document_requirements`, and `document_tables` records
- exports requirement-like statements across a project for analysis tools and agents

Dependencies:

- Postgres
- MinIO
- `document-service`
- Docling

Container:

- `perfect-rfp-normalization-service`

Port:

- `8091`

Endpoints:

- `GET /healthz`
- `POST /v1/normalize/project`
- `POST /v1/normalize/document`
- `GET /v1/projects/{project_id}/sections`
- `GET /v1/projects/{project_id}/requirements`
- `GET /v1/projects/{project_id}/tables`
- `POST /v1/exports/requirements`
- `GET /v1/projects/{project_id}/exports/requirements.csv`
- `POST /v1/analyses/submission-requirements`
- `GET /v1/projects/{project_id}/analyses/submission-requirements.csv`

Example:

```bash
curl -sS -X POST http://127.0.0.1:8091/v1/normalize/project \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "starting-test-set",
    "skip_existing": true
  }'
```

CSV export example:

```bash
curl -OJ "http://127.0.0.1:8091/v1/projects/starting-test-set/exports/requirements.csv?filename_pattern=%25PWS%25"
```

JSON export example:

```bash
curl -sS -X POST http://127.0.0.1:8091/v1/exports/requirements \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "starting-test-set",
    "filename_pattern": "%PWS%"
  }'
```

Submission requirements example:

```bash
curl -sS -X POST http://127.0.0.1:8091/v1/analyses/submission-requirements \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "starting-test-set",
    "filename_pattern": "%Section L%"
  }'
curl -OJ "http://127.0.0.1:8091/v1/projects/starting-test-set/analyses/submission-requirements.csv?filename_pattern=%25Section%20L%25"
```
