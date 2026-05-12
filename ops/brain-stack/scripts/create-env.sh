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
PUBLIC_HOSTNAME=ai.vishalvunnam.com
BRAIN_CONSOLE_PORT=8080
BRAIN_CONSOLE_PASSWORD=$(random_secret)
BRAIN_CONSOLE_SESSION_SECRET=$(random_secret)
VISHAL_AI_INTAKE_TOKEN=$(random_secret)
MCP_BEARER_TOKEN=$(random_secret)
VISHAL_AI_DB_PATH=/data/vishal-ai.db
COOKIE_SECURE=false
GEMINI_API_KEY=
GEMINI_TASK_MODEL=gemini-2.5-flash
GEMINI_HEALTH_MODEL=gemini-2.5-flash-lite
ANYTHINGLLM_PORT=3001
COUCHDB_PORT=5984
SYNCTHING_PORT=8384
TERMINAL_PORT=7681
TERMINAL_BASE_PATH=
TERMINAL_USER=brain
TERMINAL_PASSWORD=$(random_secret)
HOST_UID=$(id -u)
HOST_GID=$(id -g)
TZ=${TZ:-America/New_York}

COUCHDB_USER=brainadmin
COUCHDB_PASSWORD=$(random_secret)
COUCHDB_SECRET=$(random_secret)
OBSIDIAN_DB=second_brain

OLLAMA_MODEL=gemma4:e4b
ENV
  echo "created .env"
else
  echo ".env already exists"
fi

ensure_env_key() {
  local key="$1"
  local value="$2"
  if ! grep -q "^${key}=" .env; then
    printf '%s=%s\n' "$key" "$value" >> .env
    echo "added ${key} to .env"
  fi
}

ensure_env_key "SYNCTHING_PORT" "8384"
ensure_env_key "OLLAMA_PORT" "11434"
ensure_env_key "PUBLIC_HOSTNAME" "ai.vishalvunnam.com"
ensure_env_key "COOKIE_SECURE" "false"
if ! grep -q "^BRAIN_CONSOLE_PASSWORD=" .env; then
  printf 'BRAIN_CONSOLE_PASSWORD=%s\n' "$(random_secret)" >> .env
  echo "added BRAIN_CONSOLE_PASSWORD to .env"
fi
if ! grep -q "^MCP_BEARER_TOKEN=" .env; then
  printf 'MCP_BEARER_TOKEN=%s\n' "$(random_secret)" >> .env
  echo "added MCP_BEARER_TOKEN to .env"
fi
if ! grep -q "^BRAIN_CONSOLE_SESSION_SECRET=" .env; then
  printf 'BRAIN_CONSOLE_SESSION_SECRET=%s\n' "$(random_secret)" >> .env
  echo "added BRAIN_CONSOLE_SESSION_SECRET to .env"
fi
if ! grep -q "^VISHAL_AI_INTAKE_TOKEN=" .env; then
  printf 'VISHAL_AI_INTAKE_TOKEN=%s\n' "$(random_secret)" >> .env
  echo "added VISHAL_AI_INTAKE_TOKEN to .env"
fi
ensure_env_key "GEMINI_API_KEY" ""
ensure_env_key "GEMINI_TASK_MODEL" "gemini-2.5-flash"
ensure_env_key "GEMINI_HEALTH_MODEL" "gemini-2.5-flash-lite"
ensure_env_key "VISHAL_AI_DB_PATH" "/data/vishal-ai.db"
ensure_env_key "TERMINAL_PORT" "7681"
ensure_env_key "TERMINAL_BASE_PATH" ""
ensure_env_key "TERMINAL_USER" "brain"
if ! grep -q "^TERMINAL_PASSWORD=" .env; then
  printf 'TERMINAL_PASSWORD=%s\n' "$(random_secret)" >> .env
  echo "added TERMINAL_PASSWORD to .env"
fi
ensure_env_key "HOST_UID" "$(id -u)"
ensure_env_key "HOST_GID" "$(id -g)"
ensure_env_key "TZ" "${TZ:-America/New_York}"

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
