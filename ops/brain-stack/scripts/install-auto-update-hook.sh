#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(git -C "$STACK_DIR" rev-parse --show-toplevel)"
HOOK_DIR="$REPO_DIR/.git/hooks"

mkdir -p "$HOOK_DIR"

cat > "$HOOK_DIR/post-merge" <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(git rev-parse --show-toplevel)"
cd "$REPO_DIR"

PULL=0 RUN_DOCTOR=0 ./ops/brain-stack/scripts/update-server.sh
HOOK

cat > "$HOOK_DIR/post-rewrite" <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "rebase" ]]; then
  exit 0
fi

REPO_DIR="$(git rev-parse --show-toplevel)"
cd "$REPO_DIR"

PULL=0 RUN_DOCTOR=0 ./ops/brain-stack/scripts/update-server.sh
HOOK

chmod +x "$HOOK_DIR/post-merge" "$HOOK_DIR/post-rewrite"

cat <<DONE
Installed auto-update Git hooks:
  $HOOK_DIR/post-merge
  $HOOK_DIR/post-rewrite

Now a normal git pull will rebuild the Vishal.ai console after new code lands.
To restart the web terminal during an update, run:
  RESTART_TERMINAL=1 ./ops/brain-stack/scripts/update-server.sh
DONE
