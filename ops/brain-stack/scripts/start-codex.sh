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

VAULT_DIR="${VAULT_DIR:-${ROOT_DIR}/vault}"
CODEX_BIN="${CODEX_BIN:-codex}"
CODEX_MODEL="${CODEX_MODEL:-}"

args=(
  --cd "$VAULT_DIR" \
  --sandbox workspace-write \
  --ask-for-approval on-request \
)

if [[ -n "$CODEX_MODEL" ]]; then
  args+=(--model "$CODEX_MODEL")
fi

if [[ "${CODEX_USE_OLLAMA:-0}" == "1" ]]; then
  args+=(--oss --local-provider ollama --model "${OLLAMA_MODEL:-gemma4:e4b}")
fi

exec "$CODEX_BIN" "${args[@]}" \
  "You are operating inside Vishal's Obsidian vault. Read AGENTS.md first, then help organize, write, and edit notes directly as Markdown files."
