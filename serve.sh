#!/usr/bin/env bash
set -uo pipefail

# NekoCircle production supervisor.
#
# Build before starting this script (`npm ci && npm run build`). The supervisor
# only owns the running Next process: it performs liveness checks, restarts a
# confirmed-unhealthy process, terminates the whole process group, and reaps the
# child so repeated restarts do not accumulate zombie next-server processes.

APP_DIR="${NEKOCIRCLE_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
APP_PORT="${NEKOCIRCLE_PORT:-3000}"
APP_BIND="${NEKOCIRCLE_BIND:-127.0.0.1}"
HEALTH_URL="${NEKOCIRCLE_HEALTH_URL:-http://127.0.0.1:${APP_PORT}/api/health/live}"
STARTUP_GRACE_SECONDS="${NEKOCIRCLE_STARTUP_GRACE_SECONDS:-60}"
CHECK_INTERVAL_SECONDS="${NEKOCIRCLE_CHECK_INTERVAL_SECONDS:-20}"
HEALTH_ATTEMPTS="${NEKOCIRCLE_HEALTH_ATTEMPTS:-3}"
HEALTH_RETRY_DELAY_SECONDS="${NEKOCIRCLE_HEALTH_RETRY_DELAY_SECONDS:-2}"
HEALTH_CONNECT_TIMEOUT_SECONDS="${NEKOCIRCLE_HEALTH_CONNECT_TIMEOUT_SECONDS:-1}"
HEALTH_MAX_TIME_SECONDS="${NEKOCIRCLE_HEALTH_MAX_TIME_SECONDS:-3}"
SHUTDOWN_GRACE_SECONDS="${NEKOCIRCLE_SHUTDOWN_GRACE_SECONDS:-15}"
LOCK_FILE="${NEKOCIRCLE_LOCK_FILE:-/tmp/nekocircle-serve-${APP_PORT}.lock}"
LOG_DIR="${NEKOCIRCLE_LOG_DIR:-${APP_DIR}/logs}"
APP_LOG="${NEKOCIRCLE_APP_LOG:-${LOG_DIR}/app.log}"
SUPERVISOR_LOG="${NEKOCIRCLE_SUPERVISOR_LOG:-${LOG_DIR}/supervisor.log}"

APP_PID=""
APP_PGID=""
SHUTTING_DOWN=0

log() {
  local line
  line="$(date -u '+%Y-%m-%dT%H:%M:%SZ') [serve.sh] $*"
  printf '%s\n' "$line" | tee -a "$SUPERVISOR_LOG"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'serve.sh: required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

is_app_running() {
  if [[ -z "$APP_PID" ]] || ! kill -0 "$APP_PID" 2>/dev/null; then
    return 1
  fi

  # kill -0 also succeeds for an unreaped zombie. Treat Z as stopped so the
  # monitor reaches wait(1), reaps it, and starts a clean replacement.
  local state
  state="$(ps -o stat= -p "$APP_PID" 2>/dev/null | tr -d '[:space:]')"
  [[ -n "$state" && "$state" != Z* ]]
}

health_once() {
  curl --fail --silent --show-error \
    --connect-timeout "$HEALTH_CONNECT_TIMEOUT_SECONDS" \
    --max-time "$HEALTH_MAX_TIME_SECONDS" \
    "$HEALTH_URL" >/dev/null
}

health_with_retries() {
  local attempt
  for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1)); do
    if health_once; then
      return 0
    fi
    log "liveness failed ${attempt}/${HEALTH_ATTEMPTS}"
    if (( attempt < HEALTH_ATTEMPTS )); then
      sleep "$HEALTH_RETRY_DELAY_SECONDS"
    fi
  done
  return 1
}

reap_app() {
  if [[ -n "$APP_PID" ]]; then
    wait "$APP_PID" 2>/dev/null || true
  fi
  APP_PID=""
  APP_PGID=""
}

stop_app() {
  if [[ -z "$APP_PID" ]]; then
    return
  fi

  if is_app_running; then
    log "stopping app pid=${APP_PID} pgid=${APP_PGID:-unknown}"
    if [[ -n "$APP_PGID" ]]; then
      kill -TERM -- "-${APP_PGID}" 2>/dev/null || true
    else
      kill -TERM "$APP_PID" 2>/dev/null || true
    fi

    local deadline=$((SECONDS + SHUTDOWN_GRACE_SECONDS))
    while is_app_running && (( SECONDS < deadline )); do
      sleep 1
    done

    if is_app_running; then
      log "graceful shutdown timed out; sending SIGKILL"
      if [[ -n "$APP_PGID" ]]; then
        kill -KILL -- "-${APP_PGID}" 2>/dev/null || true
      else
        kill -KILL "$APP_PID" 2>/dev/null || true
      fi
    fi
  fi

  reap_app
}

start_app() {
  mkdir -p "$LOG_DIR"
  cd "$APP_DIR"

  local next_cli="${APP_DIR}/node_modules/next/dist/bin/next"
  if [[ ! -f "$next_cli" ]]; then
    log "Next CLI not found at ${next_cli}; run npm ci first"
    exit 1
  fi
  if [[ ! -d "${APP_DIR}/.next" ]]; then
    log "production build not found; run npm run build first"
    exit 1
  fi

  log "starting Next on ${APP_BIND}:${APP_PORT}"
  setsid node "$next_cli" start --hostname "$APP_BIND" --port "$APP_PORT" \
    >>"$APP_LOG" 2>&1 9>&- &
  APP_PID=$!
  APP_PGID="$APP_PID"
  log "started app pid=${APP_PID} pgid=${APP_PGID}"
}

wait_for_startup() {
  local deadline=$((SECONDS + STARTUP_GRACE_SECONDS))
  while (( SECONDS < deadline )); do
    if ! is_app_running; then
      log "app exited during startup"
      reap_app
      return 1
    fi
    if health_once; then
      log "app is ready"
      return 0
    fi
    sleep 2
  done
  log "startup grace period expired"
  return 1
}

shutdown_supervisor() {
  if (( SHUTTING_DOWN == 1 )); then
    return
  fi
  SHUTTING_DOWN=1
  log "supervisor shutting down"
  stop_app
}

require_command curl
require_command flock
require_command node
require_command ps
require_command setsid

mkdir -p "$LOG_DIR"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  printf 'serve.sh: another supervisor already holds %s\n' "$LOCK_FILE" >&2
  exit 1
fi

trap 'shutdown_supervisor; exit 0' INT TERM HUP
trap 'shutdown_supervisor' EXIT

start_app
if ! wait_for_startup; then
  stop_app
  start_app
  if ! wait_for_startup; then
    log "app failed two startup attempts; giving up"
    exit 1
  fi
fi

while (( SHUTTING_DOWN == 0 )); do
  sleep "$CHECK_INTERVAL_SECONDS"

  if ! is_app_running; then
    log "app process exited; reaping and restarting"
    reap_app
    start_app
    if ! wait_for_startup; then
      log "replacement failed startup; retrying on next monitor cycle"
    fi
    continue
  fi

  if health_with_retries; then
    continue
  fi

  log "confirmed unhealthy after ${HEALTH_ATTEMPTS} attempts; restarting"
  stop_app
  start_app
  if ! wait_for_startup; then
    log "replacement failed startup; retrying on next monitor cycle"
  fi
done
