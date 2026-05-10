#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(git -C "$STACK_DIR" rev-parse --show-toplevel)"

REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)}"
PULL="${PULL:-1}"
COMPOSE_PROFILE="${COMPOSE_PROFILE:-public}"
UPDATE_SERVICES="${UPDATE_SERVICES:-brain-console caddy}"
RESTART_TERMINAL="${RESTART_TERMINAL:-0}"
RUN_DOCTOR="${RUN_DOCTOR:-1}"
DRY_RUN="${DRY_RUN:-0}"

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi

  "$@"
}

cd "$REPO_DIR"

echo "repo: $REPO_DIR"
echo "stack: $STACK_DIR"

if [[ "$PULL" == "1" ]]; then
  echo "pulling ${REMOTE}/${BRANCH}"
  run git pull --ff-only "$REMOTE" "$BRANCH"
else
  echo "skipping git pull"
fi

cd "$STACK_DIR"

echo "refreshing missing env keys"
run ./scripts/create-env.sh

profile_args=()
if [[ -n "$COMPOSE_PROFILE" ]]; then
  profile_args=(--profile "$COMPOSE_PROFILE")
fi

# Intentionally split on spaces so UPDATE_SERVICES can be overridden like:
# UPDATE_SERVICES="brain-console caddy anythingllm"
# shellcheck disable=SC2206
services=($UPDATE_SERVICES)

echo "rebuilding services: ${services[*]}"
run docker compose "${profile_args[@]}" up -d --build "${services[@]}"

if [[ "$RESTART_TERMINAL" == "1" ]]; then
  echo "restarting web terminal"
  run ./scripts/stop-web-terminal.sh || true
  run ./scripts/start-web-terminal.sh
elif [[ ! -f data/terminal/ttyd.pid ]] || ! kill -0 "$(cat data/terminal/ttyd.pid)" 2>/dev/null; then
  echo "web terminal is not running; starting it"
  run ./scripts/start-web-terminal.sh || true
else
  echo "web terminal already running; set RESTART_TERMINAL=1 to restart it"
fi

if [[ "$RUN_DOCTOR" == "1" ]]; then
  echo "running doctor"
  run ./scripts/doctor.sh || true
fi

echo "update complete"
