#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${ROOT_DIR}/data/terminal/ttyd.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "web terminal is not running"
  exit 0
fi

pid="$(cat "$PID_FILE")"
if kill -0 "$pid" 2>/dev/null; then
  kill "$pid"
  echo "stopped web terminal"
else
  echo "web terminal was not running"
fi

rm -f "$PID_FILE"
