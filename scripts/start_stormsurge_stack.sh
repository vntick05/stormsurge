#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/admin/stormsurge"
LOG_DIR="${HOME}/.stormsurge"
LOG_FILE="${LOG_DIR}/stack-launch.log"
STACK_URL="http://127.0.0.1:3200/"
STACK_V2_URL="http://127.0.0.1:3201/"
STACK_V3_URL="http://127.0.0.1:3202/"
BUILD_FLAG=""

mkdir -p "${LOG_DIR}"
touch "${LOG_FILE}"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "${LOG_FILE}"
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-90}"
  local sleep_seconds="${4:-2}"
  local i

  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      log "${label} is ready"
      return 0
    fi
    sleep "${sleep_seconds}"
  done

  log "Timed out waiting for ${label} (${url})"
  return 1
}

usage() {
  cat <<'EOF'
Usage: start_stormsurge_stack.sh [--build]

Starts the full StormSurge stack from /home/admin/stormsurge.

Options:
  --build   Rebuild images before starting containers.
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --build)
        BUILD_FLAG="--build"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        printf 'Unknown argument: %s\n' "$1" >&2
        usage >&2
        exit 1
        ;;
    esac
  done
}

open_browser() {
  if command -v xdg-open >/dev/null 2>&1; then
    log "Opening ${STACK_URL}"
    nohup xdg-open "${STACK_URL}" >/dev/null 2>&1 &
  else
    log "xdg-open not found; open ${STACK_URL} manually"
  fi
}

main() {
  parse_args "$@"
  log "Starting StormSurge stack"
  cd "${ROOT_DIR}"
  docker compose --env-file .env -f compose.yaml up -d ${BUILD_FLAG} | tee -a "${LOG_FILE}"

  wait_for_http "http://127.0.0.1:8355/health" "TRT service"
  wait_for_http "http://127.0.0.1:8181/healthz" "Document service"
  wait_for_http "http://127.0.0.1:8191/healthz" "Normalization service"
  wait_for_http "http://127.0.0.1:8481/healthz" "Retrieval service"
  wait_for_http "http://127.0.0.1:8193/healthz" "PWS structuring service"
  wait_for_http "http://127.0.0.1:3200/" "StormSurge studio v1"
  wait_for_http "http://127.0.0.1:3201/" "StormSurge studio v2"
  wait_for_http "http://127.0.0.1:3202/" "StormSurge studio v3"

  open_browser
  log "StormSurge stack is ready"
  log "StormSurge Studio v1: ${STACK_URL}"
  log "StormSurge Studio v2: ${STACK_V2_URL}"
  log "StormSurge Studio v3: ${STACK_V3_URL}"
}

main "$@"
