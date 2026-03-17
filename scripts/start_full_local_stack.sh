#!/usr/bin/env bash
set -euo pipefail

TRT_ROOT="/home/admin/perfect-rfp-trt"
APP_ROOT="/home/admin/stormsurge"

ensure_single_trt_service() {
  mapfile -t running_trt < <(docker ps --format '{{.Names}}' | rg 'trtllm' || true)
  if ((${#running_trt[@]} == 0)); then
    return 0
  fi
  if ((${#running_trt[@]} == 1)) && [[ "${running_trt[0]}" == "perfect-rfp-trtllm" ]]; then
    return 0
  fi

  printf 'Refusing to start because multiple TRT-LLM containers are running or an unexpected TRT container is present:\n' >&2
  printf '  %s\n' "${running_trt[@]}" >&2
  printf 'Expected only: perfect-rfp-trtllm\n' >&2
  exit 1
}

mkdir -p \
  "${APP_ROOT}/model-cache/document-service" \
  "${APP_ROOT}/model-cache/normalization-service" \
  "${APP_ROOT}/model-cache/retrieval-service" \
  "${APP_ROOT}/model-cache/pws-structuring-service"

ensure_single_trt_service

cd "${TRT_ROOT}"
docker compose --env-file .env -f compose.yaml up -d trtllm api

cd "${APP_ROOT}"
docker compose --env-file .env -f compose.yaml up -d

"${APP_ROOT}/scripts/warm_local_model_caches.sh"

printf 'TRT health: http://127.0.0.1:8355/health\n'
printf 'StormSurge API: http://127.0.0.1:8460/health\n'
printf 'StormSurge UI v4: http://127.0.0.1:3004/\n'
