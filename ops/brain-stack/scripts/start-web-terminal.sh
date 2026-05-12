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
TERMINAL_BASE_PATH="${TERMINAL_BASE_PATH:-}"
BRAIN_SESSION_NAME="${BRAIN_SESSION_NAME:-brain}"

# Land each ttyd session in the shared tmux 'brain' session running Claude Code.
# Falls back to a plain login shell when tmux or claude aren't available.
if command -v tmux >/dev/null 2>&1 && command -v claude >/dev/null 2>&1; then
  TTYD_LAUNCH_CMD="cd '$VAULT_DIR' && exec tmux new-session -A -s '$BRAIN_SESSION_NAME' claude"
else
  TTYD_LAUNCH_CMD="cd '$VAULT_DIR' && exec bash -l"
fi

mkdir -p "$PID_DIR"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "web terminal already running on ${TAILSCALE_IP}:${TERMINAL_PORT}"
  exit 0
fi

BASE_PATH_ARGS=()
if [[ -n "$TERMINAL_BASE_PATH" ]]; then
  BASE_PATH_ARGS=(-b "$TERMINAL_BASE_PATH")
fi

nohup "$TTYD_BIN" \
  -i "${TAILSCALE_IP:-127.0.0.1}" \
  -p "${TERMINAL_PORT:-7681}" \
  -c "${TERMINAL_USER}:${TERMINAL_PASSWORD}" \
  -W \
  "${BASE_PATH_ARGS[@]}" \
  -t titleFixed="vishalbot" \
  -t fontFamily="JetBrains Mono, SFMono-Regular, Menlo, Consolas, monospace" \
  -t fontSize=13 \
  -t lineHeight=1.32 \
  -t cursorBlink=true \
  -t disableLeaveAlert=true \
  -t macOptionIsMeta=true \
  -t 'theme={"background":"#080d0d","foreground":"#c3c8c7","cursor":"#4f91a0","cursorAccent":"#080d0d","selectionBackground":"rgba(79,145,160,0.32)","black":"#0b1111","red":"#d06a69","green":"#4f91a0","yellow":"#d2691e","blue":"#4f91a0","magenta":"#c6934b","cyan":"#74aab3","white":"#c3c8c7","brightBlack":"#7f806b","brightRed":"#d06a69","brightGreen":"#5fa3b2","brightYellow":"#e09040","brightBlue":"#5fa3b2","brightMagenta":"#d8aa6a","brightCyan":"#8cc2cb","brightWhite":"#fbf8df"}' \
  bash -lc "$TTYD_LAUNCH_CMD" \
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
  http://${TAILSCALE_IP:-127.0.0.1}:${TERMINAL_PORT:-7681}${TERMINAL_BASE_PATH:-/}

username:
  ${TERMINAL_USER}

password:
  stored in .env as TERMINAL_PASSWORD

workspace:
  ${VAULT_DIR}
DONE
