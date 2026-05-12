#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT_DIR="${VAULT_DIR:-${ROOT_DIR}/vault}"
AGENT_COMMAND="${AGENT_COMMAND:-}"

cd "$ROOT_DIR"
./scripts/init-vault-agent.sh >/dev/null

cd "$VAULT_DIR"

if [[ -n "$AGENT_COMMAND" ]]; then
  exec $AGENT_COMMAND
fi

if command -v claude >/dev/null 2>&1; then
  exec claude
fi

if command -v codex >/dev/null 2>&1; then
  exec codex
fi

cat <<MSG
No coding-agent CLI was found on this server.

You are now in the vault folder:
  $VAULT_DIR

Install or provide an agent command, then run for example:
  AGENT_COMMAND='codex' ./scripts/open-agent.sh
  AGENT_COMMAND='claude' ./scripts/open-agent.sh
MSG

exec "${SHELL:-/bin/bash}"
