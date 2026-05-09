#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REMOTE_DEVICE_ID="${1:-}"
FOLDER_ID="${FOLDER_ID:-obsidian-vault}"
FOLDER_LABEL="${FOLDER_LABEL:-Obsidian Vault}"
FOLDER_PATH="${FOLDER_PATH:-/vault}"
SYNCTHING_URL="${SYNCTHING_URL:-http://100.70.195.79:8384}"

api_key="$(docker exec brain-syncthing sh -lc "grep -o '<apikey>[^<]*' /config/config.xml | sed 's/<apikey>//'")"
server_device_id="$(docker exec brain-syncthing sh -lc "grep -o '<device id=\"[^\"]*' /config/config.xml | head -1 | sed 's/<device id=\"//'")"

python3 - "$SYNCTHING_URL" "$api_key" "$server_device_id" "$REMOTE_DEVICE_ID" "$FOLDER_ID" "$FOLDER_LABEL" "$FOLDER_PATH" <<'PY'
import json
import sys
import urllib.request

url, api_key, server_device_id, remote_device_id, folder_id, folder_label, folder_path = sys.argv[1:]

def request(path, method="GET", body=None):
    data = None
    headers = {"X-API-Key": api_key}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{url}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=20) as response:
        payload = response.read()
        if not payload:
            return None
        return json.loads(payload.decode("utf-8"))

config = request("/rest/config")

device_ids = {device["deviceID"] for device in config["devices"]}
if remote_device_id and remote_device_id not in device_ids:
    config["devices"].append(
        {
            "deviceID": remote_device_id,
            "name": "Laptop Obsidian",
            "addresses": ["dynamic"],
            "compression": "metadata",
            "certName": "",
            "introducer": False,
            "skipIntroductionRemovals": False,
            "introducedBy": "",
            "paused": False,
            "allowedNetworks": [],
            "autoAcceptFolders": False,
            "maxSendKbps": 0,
            "maxRecvKbps": 0,
            "ignoredFolders": [],
            "maxRequestKiB": 0,
            "untrusted": False,
            "remoteGUIPort": 0,
            "numConnections": 0,
        }
    )

folder_devices = [{"deviceID": server_device_id, "introducedBy": "", "encryptionPassword": ""}]
if remote_device_id:
    folder_devices.append({"deviceID": remote_device_id, "introducedBy": "", "encryptionPassword": ""})

folder = dict(config["defaults"]["folder"])
folder.update(
    {
        "id": folder_id,
        "label": folder_label,
        "path": folder_path,
        "type": "sendreceive",
        "devices": folder_devices,
        "fsWatcherEnabled": True,
        "rescanIntervalS": 60,
        "ignorePerms": True,
    }
)

config["folders"] = [existing for existing in config["folders"] if existing.get("id") != folder_id]
config["folders"].append(folder)

request("/rest/config", method="PUT", body=config)
request("/rest/system/restart", method="POST")
PY

cat <<DONE
Syncthing server folder configured.

Server device ID:
  ${server_device_id}

Folder ID:
  ${FOLDER_ID}

Server folder path inside the container:
  ${FOLDER_PATH}

Host folder path:
  ${ROOT_DIR}/vault
DONE
