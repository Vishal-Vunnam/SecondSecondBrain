#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

./scripts/init-vault-agent.sh >/dev/null

export OLLAMA_API_BASE="${OLLAMA_API_BASE:-http://127.0.0.1:${OLLAMA_PORT:-11434}}"

cd vault
exec aider \
  --model "ollama_chat/${OLLAMA_MODEL:-gemma4:e4b}" \
  --no-git \
  --no-auto-commits \
  --read AGENTS.md
