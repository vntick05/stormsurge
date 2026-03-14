#!/usr/bin/env bash
set -euo pipefail

: "${MODEL_HANDLE:=openai/gpt-oss-120b}"
: "${LLM_PORT:=8455}"
: "${MAX_BATCH_SIZE:=32}"
: "${FREE_GPU_MEMORY_FRACTION:=0.90}"
: "${TIKTOKEN_ENCODINGS_BASE:=/tmp/harmony-reqs}"

log() { printf '[stormsurge] %s\n' "$*"; }

mkdir -p "${TIKTOKEN_ENCODINGS_BASE}"
export TIKTOKEN_ENCODINGS_BASE

log "Verifying model cache for ${MODEL_HANDLE}..."
hf download "${MODEL_HANDLE}"

cat > /tmp/extra-llm-api-config.yml <<EOF
print_iter_log: false
kv_cache_config:
  dtype: "auto"
  free_gpu_memory_fraction: ${FREE_GPU_MEMORY_FRACTION}
cuda_graph_config:
  enable_padding: true
disable_overlap_scheduler: true
EOF

log "Starting trtllm-serve with model=${MODEL_HANDLE} port=${LLM_PORT} max_batch_size=${MAX_BATCH_SIZE}"
exec trtllm-serve "${MODEL_HANDLE}" \
    --host 0.0.0.0 \
    --port "${LLM_PORT}" \
    --max_batch_size "${MAX_BATCH_SIZE}" \
    --trust_remote_code \
    --extra_llm_api_options /tmp/extra-llm-api-config.yml
