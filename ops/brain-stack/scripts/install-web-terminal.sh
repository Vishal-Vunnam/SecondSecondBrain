#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$HOME/.local/bin"

if command -v ttyd >/dev/null 2>&1; then
  ttyd --version
  exit 0
fi

target="$HOME/.local/bin/ttyd"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

python3 - "$tmp/ttyd" <<'PY'
import json
import pathlib
import stat
import sys
import urllib.request

out = pathlib.Path(sys.argv[1])
with urllib.request.urlopen("https://api.github.com/repos/tsl0922/ttyd/releases/latest", timeout=30) as response:
    release = json.loads(response.read().decode("utf-8"))

asset_url = None
for asset in release.get("assets", []):
    if asset.get("name") == "ttyd.x86_64":
        asset_url = asset["browser_download_url"]
        break

if not asset_url:
    raise SystemExit("Could not find ttyd.x86_64 in the latest ttyd release")

with urllib.request.urlopen(asset_url, timeout=60) as response:
    out.write_bytes(response.read())

out.chmod(out.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
PY

install -m 0755 "$tmp/ttyd" "$target"
"$target" --version
