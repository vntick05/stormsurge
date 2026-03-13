# Document Service

`document-service` is the first application service in the Perfect RFP stack.

Current responsibilities:

- accepts multipart file uploads
- stores raw files in MinIO
- extracts text through Apache Tika
- stores extracted text in MinIO
- persists document metadata and extracted text in Postgres
- emits a Redis event for downstream indexing/retrieval work

Dependencies:

- Postgres
- Redis
- MinIO
- Tika

Container:

- `perfect-rfp-document-service`

Port:

- `8081`

Endpoints:

- `GET /healthz`
- `POST /v1/documents/upload`

Upload contract:

- form field `project_id`
- form field `file`

Example:

```bash
tmp=/tmp/perfect-rfp-sample.txt
printf "Perfect RFP sample document\nThis is a test upload for Tika extraction.\n" > "$tmp"

curl -sS -X POST http://127.0.0.1:8081/v1/documents/upload \
  -F project_id=demo-project \
  -F file=@"$tmp"
```

Validation:

```bash
curl -sS http://127.0.0.1:8081/healthz
docker logs --tail 50 perfect-rfp-document-service
docker exec -u postgres perfect-rfp-postgres \
  psql -U gov_rfp -d gov_rfp \
  -c "SELECT id, project_id, filename, extraction_status FROM documents ORDER BY created_at DESC LIMIT 3;"
docker exec perfect-rfp-redis \
  redis-cli LRANGE perfect-rfp:document-events 0 2
```

Current behavior:

- successful uploads write:
  - raw file to MinIO bucket `raw`
  - extracted text to MinIO bucket `parsed`
  - metadata row to Postgres table `documents`
  - event to Redis list `perfect-rfp:document-events`
