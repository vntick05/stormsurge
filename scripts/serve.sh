#!/usr/bin/env bash
set -euo pipefail

: "${MODEL_HANDLE:=openai/gpt-oss-120b}"
: "${LLM_PORT:=8455}"
: "${MAX_BATCH_SIZE:=32}"
: "${FREE_GPU_MEMORY_FRACTION:=0.90}"
: "${TRT_STARTUP_MODE:=safe}"
: "${TIKTOKEN_ENCODINGS_BASE:=/tmp/harmony-reqs}"

log() { printf '[stormsurge] %s\n' "$*"; }

mkdir -p "${TIKTOKEN_ENCODINGS_BASE}"
export TIKTOKEN_ENCODINGS_BASE

if [[ "${TRT_STARTUP_MODE}" == "safe" ]]; then
    # GB10 uses shared system memory; force low-pressure startup to avoid
    # weight-load spikes that can take the whole machine down.
    export HF_HUB_OFFLINE=1
    export TRANSFORMERS_OFFLINE=1
    export HF_ENABLE_PARALLEL_LOADING=false
    export HF_PARALLEL_LOADING_WORKERS=1
    export OMP_NUM_THREADS=1
    export TOKENIZERS_PARALLELISM=false
fi

MODEL_CACHE_ROOT="/root/.cache/huggingface/hub/models--${MODEL_HANDLE//\//--}"
MODEL_REFS_PATH="${MODEL_CACHE_ROOT}/refs/main"
MODEL_SNAPSHOTS_DIR="${MODEL_CACHE_ROOT}/snapshots"

log "Resolving cached model snapshot for ${MODEL_HANDLE}..."
if [[ -f "${MODEL_REFS_PATH}" ]]; then
    MODEL_SNAPSHOT_PATH="${MODEL_SNAPSHOTS_DIR}/$(<"${MODEL_REFS_PATH}")"
elif [[ -d "${MODEL_SNAPSHOTS_DIR}" ]]; then
    MODEL_SNAPSHOT_PATH="$(find "${MODEL_SNAPSHOTS_DIR}" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
else
    log "Model cache is missing for ${MODEL_HANDLE}"
    exit 1
fi

if [[ ! -d "${MODEL_SNAPSHOT_PATH}" ]]; then
    log "Resolved snapshot path does not exist: ${MODEL_SNAPSHOT_PATH}"
    exit 1
fi

log "Using local snapshot ${MODEL_SNAPSHOT_PATH}"

cat > /tmp/extra-llm-api-config.yml <<EOF
print_iter_log: false
kv_cache_config:
  dtype: "auto"
  free_gpu_memory_fraction: ${FREE_GPU_MEMORY_FRACTION}
cuda_graph_config:
  enable_padding: true
disable_overlap_scheduler: true
EOF

log "Starting trtllm-serve with model=${MODEL_HANDLE} port=${LLM_PORT} max_batch_size=${MAX_BATCH_SIZE} startup_mode=${TRT_STARTUP_MODE}"
exec trtllm-serve "${MODEL_SNAPSHOT_PATH}" \
    --host 0.0.0.0 \
    --port "${LLM_PORT}" \
    --max_batch_size "${MAX_BATCH_SIZE}" \
    --trust_remote_code \
    --extra_llm_api_options /tmp/extra-llm-api-config.yml
