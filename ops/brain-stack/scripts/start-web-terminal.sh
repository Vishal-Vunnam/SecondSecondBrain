#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

./scripts/create-env.sh >/dev/null

set -a
# shellcheck disable=SC1091
source .env
set +a

./scripts/init-vault-agent.sh >/dev/null
./scripts/install-web-terminal.sh >/dev/null

VAULT_DIR="${VAULT_DIR:-${ROOT_DIR}/vault}"
TTYD_BIN="${TTYD_BIN:-$HOME/.local/bin/ttyd}"
PID_DIR="${ROOT_DIR}/data/terminal"
PID_FILE="${PID_DIR}/ttyd.pid"
LOG_FILE="${PID_DIR}/ttyd.log"

mkdir -p "$PID_DIR"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "web terminal already running on ${TAILSCALE_IP}:${TERMINAL_PORT}"
  exit 0
fi

nohup "$TTYD_BIN" \
  -i "${TAILSCALE_IP:-127.0.0.1}" \
  -p "${TERMINAL_PORT:-7681}" \
  -c "${TERMINAL_USER}:${TERMINAL_PASSWORD}" \
  -W \
  -t titleFixed="Second Brain Terminal" \
  -t fontSize=14 \
  bash -lc "cd '$VAULT_DIR' && exec bash -l" \
  >"$LOG_FILE" 2>&1 &

echo "$!" > "$PID_FILE"
sleep 1

if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "web terminal failed to start; log follows:" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi

cat <<DONE
web terminal running:
  http://${TAILSCALE_IP:-127.0.0.1}:${TERMINAL_PORT:-7681}

username:
  ${TERMINAL_USER}

password:
  stored in .env as TERMINAL_PASSWORD

workspace:
  ${VAULT_DIR}
DONE
