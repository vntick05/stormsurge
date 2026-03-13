#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/admin/stormsurge"
PWS_DIR="${ROOT_DIR}/services/pws-structuring-service"
PYTHON_BIN="${PWS_DIR}/.venv/bin/python"
LOG_DIR="${HOME}/.stormsurge"
LOG_FILE="${LOG_DIR}/launch.log"
PWS_PID_FILE="${LOG_DIR}/pws-structuring.pid"
APP_URL="http://127.0.0.1:8193/"

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

cleanup_stale_pws() {
  if [[ -f "${PWS_PID_FILE}" ]]; then
    local pid
    pid="$(cat "${PWS_PID_FILE}")"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1; then
      if wait_for_service "${APP_URL}" "StormSurge UI" 1 0; then
        log "StormSurge UI already running (pid ${pid})"
        return 0
      fi
      log "Stopping stale StormSurge UI process ${pid}"
      kill "${pid}" >/dev/null 2>&1 || true
      sleep 1
    fi
    rm -f "${PWS_PID_FILE}"
  fi
}

start_pws_ui() {
  if wait_for_service "${APP_URL}" "StormSurge UI" 1 0; then
    log "StormSurge UI already available"
    return 0
  fi

  cleanup_stale_pws

  log "Starting StormSurge UI on :8193"
  (
    cd "${PWS_DIR}"
    NORMALIZATION_SERVICE_BASE_URL="http://127.0.0.1:8191" \
    RETRIEVAL_SERVICE_BASE_URL="http://127.0.0.1:8481" \
    API_GATEWAY_BASE_URL="http://127.0.0.1:8460" \
    setsid "${PYTHON_BIN}" -m uvicorn app:app --host 127.0.0.1 --port 8193 >>"${LOG_FILE}" 2>&1 < /dev/null &
    echo $! > "${PWS_PID_FILE}"
  )
  sleep 1
  if ! kill -0 "$(cat "${PWS_PID_FILE}")" >/dev/null 2>&1; then
    log "StormSurge UI process exited before becoming ready"
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
  start_pws_ui
  wait_for_service "${APP_URL}" "StormSurge UI" 60 1
  open_browser
  log "StormSurge is ready"
}

main "$@"
