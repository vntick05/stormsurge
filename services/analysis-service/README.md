# Analysis Service

`analysis-service` is the orchestration layer that turns an ingested and normalized RFP package into human-readable analytical outputs.

Current responsibilities:

- verifies package data is available from normalization and retrieval layers
- gathers package-wide evidence from retrieval queries
- summarizes the RFP package with the stack's LLM service
- returns readable narrative output plus supporting citations

Endpoints:

- `GET /healthz`
- `POST /v1/analyze/rfp-package`
- `GET /v1/projects/{project_id}/analyses/rfp-package-summary.md`

Example:

```bash
curl -sS -X POST http://127.0.0.1:8092/v1/analyze/rfp-package \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "starting-test-set"
  }'
curl -OJ "http://127.0.0.1:8092/v1/projects/starting-test-set/analyses/rfp-package-summary.md"
```
