#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env. Run ./scripts/create-env.sh first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

free_gib="$(df -BG . | awk 'NR==2 {gsub("G","",$4); print $4}')"
if [[ "${free_gib:-0}" -lt 25 ]]; then
  cat <<WARN
Refusing to pull ${OLLAMA_MODEL}: only ${free_gib:-unknown} GiB free here.
Resize the VM disk first, or override with ALLOW_SMALL_DISK=1 for a tiny test model.
WARN
  if [[ "${ALLOW_SMALL_DISK:-0}" != "1" ]]; then
    exit 1
  fi
fi

docker compose exec ollama ollama pull "${OLLAMA_MODEL}"
docker compose exec ollama ollama run "${OLLAMA_MODEL}" "Reply with exactly: Brain model ready."

if [[ -n "${OLLAMA_EMBED_MODEL:-}" ]]; then
  docker compose exec ollama ollama pull "${OLLAMA_EMBED_MODEL}"
fi
