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

BASE_URL="http://${TAILSCALE_IP}:${COUCHDB_PORT}"
AUTH="${COUCHDB_USER}:${COUCHDB_PASSWORD}"

echo "waiting for CouchDB at ${BASE_URL}"
for _ in $(seq 1 60); do
  if curl -fsS -u "$AUTH" "${BASE_URL}/_up" >/dev/null; then
    break
  fi
  sleep 2
done

curl -fsS -u "$AUTH" "${BASE_URL}/_up"
echo

create_db() {
  local db="$1"
  local code
  code="$(curl -sS -o /tmp/couchdb-create-db.json -w '%{http_code}' -u "$AUTH" -X PUT "${BASE_URL}/${db}")"
  if [[ "$code" == "201" || "$code" == "202" || "$code" == "412" ]]; then
    printf 'database %-20s ok (%s)\n' "$db" "$code"
  else
    echo "failed creating ${db}: HTTP ${code}" >&2
    cat /tmp/couchdb-create-db.json >&2
    exit 1
  fi
}

create_db "_users"
create_db "_replicator"
create_db "_global_changes"
create_db "${OBSIDIAN_DB}"

echo "cluster setup state:"
curl -fsS -u "$AUTH" "${BASE_URL}/_cluster_setup"
echo

cat <<DONE
CouchDB is ready for Obsidian Self-hosted LiveSync.
Server URI: ${BASE_URL}
Database:   ${OBSIDIAN_DB}
Username:   ${COUCHDB_USER}
Password:   stored in .env on the server
DONE
