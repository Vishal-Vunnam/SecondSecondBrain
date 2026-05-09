#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32 | tr -d '\n'
  else
    tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48
  fi
}

detect_tailscale_ip() {
  if command -v tailscale >/dev/null 2>&1; then
    tailscale ip -4 2>/dev/null | sed -n '1p'
    return
  fi
  hostname -I 2>/dev/null | awk '{print $1}'
}

TAILSCALE_IP_VALUE="${TAILSCALE_IP:-$(detect_tailscale_ip)}"
TAILSCALE_IP_VALUE="${TAILSCALE_IP_VALUE:-127.0.0.1}"

umask 077

if [[ ! -f .env ]]; then
  cat > .env <<ENV
TAILSCALE_IP=${TAILSCALE_IP_VALUE}
BRAIN_CONSOLE_PORT=8080
ANYTHINGLLM_PORT=3001
COUCHDB_PORT=5984

COUCHDB_USER=brainadmin
COUCHDB_PASSWORD=$(random_secret)
COUCHDB_SECRET=$(random_secret)
OBSIDIAN_DB=second_brain

OLLAMA_MODEL=gemma4:e4b
OLLAMA_EMBED_MODEL=nomic-embed-text
ENV
  echo "created .env"
else
  echo ".env already exists"
fi

if [[ ! -f .anythingllm.env ]]; then
  cat > .anythingllm.env <<ENV
STORAGE_DIR=/app/server/storage
SERVER_PORT=3001
JWT_SECRET=$(random_secret)
SIG_KEY=$(random_secret)
SIG_SALT=$(random_secret)
ENV
  echo "created .anythingllm.env"
else
  echo ".anythingllm.env already exists"
fi
