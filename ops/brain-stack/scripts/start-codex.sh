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
MODEL="${OLLAMA_MODEL:-gemma4:e4b}"

exec "$CODEX_BIN" \
  --oss \
  --local-provider ollama \
  --model "$MODEL" \
  --cd "$VAULT_DIR" \
  --sandbox workspace-write \
  --ask-for-approval on-request \
  --skip-git-repo-check \
  "You are operating inside Vishal's Obsidian vault. Read AGENTS.md first, then help organize, write, and edit notes directly as Markdown files."
