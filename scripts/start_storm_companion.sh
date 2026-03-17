#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/admin/stormsurge"
LOG_DIR="${HOME}/.stormsurge"
LOG_FILE="${LOG_DIR}/launch.log"
APP_URL="http://127.0.0.1:3200/"

mkdir -p "${LOG_DIR}"
touch "${LOG_FILE}"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "${LOG_FILE}"
}

port_from_url() {
  local url="$1"
  if [[ "${url}" =~ ^https?://[^:/]+:([0-9]+)(/.*)?$ ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

is_port_listening() {
  local port="$1"
  ss -ltn 2>/dev/null | grep -Eq "[[:space:]](127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::\\]):${port}[[:space:]]"
}

wait_for_service() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"
  local sleep_seconds="${4:-2}"
  local port=""
  local i

  port="$(port_from_url "${url}" || true)"
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      log "${label} is ready"
      return 0
    fi
    if [[ -n "${port}" ]] && is_port_listening "${port}"; then
      log "${label} is listening on port ${port}"
      return 0
    fi
    sleep "${sleep_seconds}"
  done

  log "Timed out waiting for ${label} (${url})"
  return 1
}

start_studio_ui() {
  if wait_for_service "${APP_URL}" "StormSurge UI" 1 0; then
    log "StormSurge UI already available"
    return 0
  fi

  log "Starting StormSurge Studio v1 on :3200"
  if ! docker compose -f "${ROOT_DIR}/compose.yaml" up -d --build stormsurge-studio-v1 >>"${LOG_FILE}" 2>&1; then
    log "StormSurge Studio v1 container failed to start"
    return 1
  fi
}

open_browser() {
  if command -v xdg-open >/dev/null 2>&1; then
    log "Opening ${APP_URL}"
    nohup xdg-open "${APP_URL}" >/dev/null 2>&1 &
  else
    log "xdg-open not found; open ${APP_URL} manually"
  fi
}

main() {
  log "Launcher invoked"
  if ! wait_for_service "http://127.0.0.1:8460/health" "API gateway" 5 1; then
    log "StormSurge services are not running."
    log "Start the StormSurge backend services first."
    exit 1
  fi
  if ! wait_for_service "http://127.0.0.1:8191/healthz" "Normalization service" 5 1; then
    log "Normalization service is not running."
    log "Start the StormSurge backend services first."
    exit 1
  fi
  if ! wait_for_service "http://127.0.0.1:8481/healthz" "Retrieval service" 5 1; then
    log "Retrieval service is not running."
    log "Start the StormSurge backend services first."
    exit 1
  fi
  start_studio_ui
  wait_for_service "${APP_URL}" "StormSurge UI" 60 1
  open_browser
  log "StormSurge is ready"
}

main "$@"
