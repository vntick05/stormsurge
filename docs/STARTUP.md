# StormSurge Startup

## Full restart after reboot

Use this when you want the complete local stack back, including TRT-LLM:

```bash
cd /home/admin/stormsurge
./scripts/start_full_local_stack.sh
```

That script:

- starts `perfect-rfp-trtllm` and `perfect-rfp-api` from `/home/admin/perfect-rfp-trt`
- starts the full StormSurge stack from `/home/admin/stormsurge`
- warms local model caches for Docling and `BAAI/bge-small-en-v1.5`
- refuses to continue if any extra `trtllm` container besides `perfect-rfp-trtllm` is already running

## StormSurge-only startup

Use this only when TRT is already running and you just need the app stack:

```bash
cd /home/admin/stormsurge
./scripts/start_stormsurge_stack.sh
```

Use this only when code or Docker dependencies changed and you need fresh images:

```bash
cd /home/admin/stormsurge
./scripts/start_stormsurge_stack.sh --build
```

## What changed

- Long-running services in `compose.yaml` now use `restart: unless-stopped`.
- `minio-init` stays `restart: "no"` because it is a one-shot init container.
- The startup script now waits for:
  - TRT service
  - document-service
  - normalization-service
  - retrieval-service
  - pws-structuring-service
  - studio v1, v2, and v3

## URLs

- TRT service: `http://127.0.0.1:8355/health`
- TRT gateway: `http://127.0.0.1:8360/health`
- Studio v1: `http://127.0.0.1:3200/`
- Studio v2: `http://127.0.0.1:3201/`
- Studio v3: `http://127.0.0.1:3202/`
- Studio v4: `http://127.0.0.1:3004/`
- Document service: `http://127.0.0.1:8181/healthz`
- Normalization service: `http://127.0.0.1:8191/healthz`
- PWS structuring service: `http://127.0.0.1:8193/healthz`
- Retrieval service: `http://127.0.0.1:8481/healthz`
- API gateway: `http://127.0.0.1:8460/health`

## Sanity check

```bash
docker ps --format '{{.Names}}\t{{.Status}}' | rg 'stormsurge|perfect-rfp-trtllm'
```

## Local model caches

To keep HF-backed assets local across restarts, these services now mount persistent host cache directories:

- `/home/admin/stormsurge/model-cache/document-service`
- `/home/admin/stormsurge/model-cache/normalization-service`
- `/home/admin/stormsurge/model-cache/retrieval-service`
- `/home/admin/stormsurge/model-cache/pws-structuring-service`

Those mounts hold:

- Docling and Hugging Face cache data for `document-service`, `normalization-service`, and `pws-structuring-service`
- FastEmbed and Hugging Face cache data for `retrieval-service`

Manual cache warmup:

```bash
cd /home/admin/stormsurge
./scripts/warm_local_model_caches.sh
```

Current locally warmed model dependencies:

- TRT-LLM model: `openai/gpt-oss-120b`
- Retrieval embedding model: `BAAI/bge-small-en-v1.5`
- Docling converter assets used by document/normalization/PWS services

## TRT safety

Only one TRT container should run on this machine:

- expected container: `perfect-rfp-trtllm`

`stormsurge` does not define its own TRT container in `compose.yaml`; it points at the external TRT endpoint on `127.0.0.1:8355`.

## If the UI is down after a reboot

1. Run `./scripts/start_full_local_stack.sh`.
2. If a service changed and still looks stale, rebuild the affected stack and rerun `./scripts/warm_local_model_caches.sh`.
3. If one service is still failing, inspect logs:

```bash
docker logs --tail 120 perfect-rfp-trtllm
docker logs --tail 120 stormsurge-retrieval-service
docker logs --tail 120 stormsurge-studio-v2
docker logs --tail 120 stormsurge-pws-structuring-service
docker logs --tail 120 stormsurge-normalization-service
```
