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
  -t fontFamily="JetBrains Mono, SFMono-Regular, Menlo, Consolas, monospace" \
  -t fontSize=13 \
  -t lineHeight=1.18 \
  -t cursorBlink=true \
  -t 'theme={"background":"#0f1516","foreground":"#c3c8c7","cursor":"#d2691e","selectionBackground":"#31738155","black":"#0f1516","red":"#b84443","green":"#317381","yellow":"#d2691e","blue":"#317381","magenta":"#b84443","cyan":"#317381","white":"#c3c8c7","brightBlack":"#70735c","brightRed":"#b84443","brightGreen":"#4f8c96","brightYellow":"#d2691e","brightBlue":"#5f9aa5","brightMagenta":"#c96463","brightCyan":"#74aab3","brightWhite":"#edf0ee"}' \
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
