#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p vault/{inbox,sources,summaries,bridge-notes,daily,.agent}

if [[ ! -f vault/AGENTS.md ]]; then
  cp templates/vault/AGENTS.md vault/AGENTS.md
  echo "created vault/AGENTS.md"
else
  echo "vault/AGENTS.md already exists"
fi

cat > vault/.agent/README.md <<'EOF'
# Agent Workspace

This folder is for local agent scratch files that should stay inside the vault directory.
Do not use it for final notes.
EOF

echo "vault ready at: ${ROOT_DIR}/vault"
