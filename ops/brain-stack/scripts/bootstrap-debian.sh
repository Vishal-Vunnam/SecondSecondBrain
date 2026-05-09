#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

free_gib="$(df -BG / | awk 'NR==2 {gsub("G","",$4); print $4}')"
if [[ "${free_gib:-0}" -lt 20 ]]; then
  cat <<WARN
Warning: root disk has ${free_gib:-unknown} GiB free.
The core stack can be staged, but Ollama model pulls need more disk.
Plan on at least 40 GiB free for small models and 80+ GiB for gemma4:26b.
WARN
fi

$SUDO apt-get update
$SUDO apt-get install -y ca-certificates curl gnupg

if ! command -v docker >/dev/null 2>&1; then
  $SUDO install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
  $SUDO apt-get update
  $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

$SUDO systemctl enable --now docker
$SUDO usermod -aG docker "$USER"

mkdir -p data/couchdb data/ollama data/anythingllm vault/summaries
$SUDO chown -R 5984:5984 data/couchdb
$SUDO chown -R "$USER":"$(id -gn)" data/ollama data/anythingllm vault

./scripts/create-env.sh

cat <<DONE
Bootstrap complete.
If Docker was installed during this run, open a new SSH session before running docker commands.
Next:
  docker compose up -d
  ./scripts/init-couchdb.sh
DONE
