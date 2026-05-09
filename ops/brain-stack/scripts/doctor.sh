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

TAILSCALE_IP="${TAILSCALE_IP:-127.0.0.1}"
BRAIN_CONSOLE_PORT="${BRAIN_CONSOLE_PORT:-8080}"
ANYTHINGLLM_PORT="${ANYTHINGLLM_PORT:-3001}"
COUCHDB_PORT="${COUCHDB_PORT:-5984}"

echo "docker:"
docker --version
docker compose version

echo
echo "containers:"
docker compose ps

echo
echo "health:"
check() {
  local name="$1"
  local url="$2"
  if curl -fsS --max-time 5 "$url" >/dev/null; then
    printf '%-14s ok  %s\n' "$name" "$url"
  else
    printf '%-14s fail %s\n' "$name" "$url"
  fi
}

check "console" "http://${TAILSCALE_IP}:${BRAIN_CONSOLE_PORT}/health/console"
check "syncthing" "http://${TAILSCALE_IP}:${SYNCTHING_PORT:-8384}/"
if [[ -n "${COUCHDB_USER:-}" && -n "${COUCHDB_PASSWORD:-}" ]]; then
  if curl -fsS --max-time 5 -u "${COUCHDB_USER}:${COUCHDB_PASSWORD}" "http://${TAILSCALE_IP}:${COUCHDB_PORT}/_up" >/dev/null; then
    printf '%-14s ok  %s\n' "couchdb" "http://${TAILSCALE_IP}:${COUCHDB_PORT}/_up"
  else
    printf '%-14s fail %s\n' "couchdb" "http://${TAILSCALE_IP}:${COUCHDB_PORT}/_up"
  fi
else
  check "couchdb" "http://${TAILSCALE_IP}:${COUCHDB_PORT}/_up"
fi

if docker compose ps --services --status running | grep -qx 'anythingllm'; then
  check "anythingllm" "http://${TAILSCALE_IP}:${ANYTHINGLLM_PORT}/"
else
  printf '%-14s skip %s\n' "anythingllm" "AI profile not running"
fi

if docker compose ps --services --status running | grep -qx 'ollama'; then
  docker compose exec ollama ollama list || true
else
  printf '%-14s skip %s\n' "ollama" "AI profile not running"
fi
