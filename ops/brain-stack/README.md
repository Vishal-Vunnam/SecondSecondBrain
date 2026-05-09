# Second Brain Stack

Private Obsidian + direct filesystem agent stack for a self-hosted Second Brain.

## What This Deploys

- `brain-console`: a private web console on port `8080` with direct vault file browsing/editing.
- `syncthing`: file-level vault sync on port `8384`.
- `couchdb`: Obsidian Self-hosted LiveSync backend on port `5984`.
- `ollama`: local model runtime inside Docker.
- `anythingllm`: optional agent UI on port `3001`.

All published ports bind to `TAILSCALE_IP` from `.env`, so the services are intended to be reached over your Tailnet rather than the public internet.

## Current VM Constraint

The inspected VM has a 10 GB boot disk with about 6.4 GB free and no detected GPU. That is not enough for `gemma4:26b`, whose Ollama artifact is much larger than the available disk. Resize the VM disk before pulling real models.

Practical targets:

- Core Docker stack only: 20+ GB free.
- Small smoke-test model: 40+ GB free.
- `gemma4:26b`: 80+ GB free and a GPU-backed VM is strongly preferred.

## Server Bring-Up

```bash
git pull
cd ops/brain-stack
chmod +x scripts/*.sh
./scripts/bootstrap-debian.sh
```

If Docker was installed by the bootstrap script, open a new SSH session so the Docker group membership is active.

If you increased the GCP boot disk in the console, grow the Linux partition before starting the stack:

```bash
cd ops/brain-stack
./scripts/grow-root-disk.sh
df -h /
```

```bash
cd ops/brain-stack
docker compose up -d
./scripts/init-couchdb.sh
./scripts/init-vault-agent.sh
./scripts/doctor.sh
```

This default starts the lightweight sync layer and console only. After the disk is resized, start the AI services:

```bash
cd ops/brain-stack
docker compose --profile ai up -d
./scripts/pull-model.sh
```

Open:

- Brain Console: `http://100.70.195.79:8080`
- Syncthing: `http://100.70.195.79:8384`
- AnythingLLM: `http://100.70.195.79:3001`
- CouchDB Fauxton: `http://100.70.195.79:5984/_utils`

## Direct Vault Agent

The core workflow is direct filesystem access, not RAG.

Sync your Obsidian vault to:

```bash
~/SecondSecondBrain/ops/brain-stack/vault
```

Use Syncthing to pair your laptop vault folder with the server folder `/vault` in the Syncthing container. Once the files exist on the server, open the web terminal or launch an agent inside the vault:

```bash
cd ~/SecondSecondBrain/ops/brain-stack
./scripts/configure-syncthing.sh
./scripts/start-web-terminal.sh
```

To pair from the terminal, get the laptop Syncthing device ID and rerun:

```bash
./scripts/configure-syncthing.sh LAPTOP_DEVICE_ID
```

The web terminal starts directly in `vault/`. Run whichever agent CLI you want there:

```bash
codex
claude
aider
nvim .
```

The agent will read `vault/AGENTS.md` for note-writing rules.

The Brain Console also mounts the same folder at `/vault` and exposes a local API for the UI:

- `GET /api/vault/tree?path=...` lists a vault folder.
- `GET /api/vault/file?path=...` reads a text/Markdown file.
- `PUT /api/vault/file` writes a text/Markdown file.

For the hosted OpenAI Codex terminal agent, run:

```bash
./scripts/start-codex.sh
```

This starts in the vault folder and uses your signed-in OpenAI account. To force the local Ollama model instead, run with `CODEX_USE_OLLAMA=1`.

## Obsidian LiveSync

Use the values printed by `./scripts/init-couchdb.sh`:

- URI: `http://100.70.195.79:5984`
- Database: `second_brain`
- Username: `brainadmin`
- Password: stored in `.env` on the server

Enable end-to-end encryption in the Obsidian Self-hosted LiveSync plugin.

## Model Pull

After resizing disk:

```bash
cd ops/brain-stack
docker compose up -d ollama
OLLAMA_MODEL=gemma4:26b ./scripts/pull-model.sh
```

For a small smoke test, keep the default in `.env`.

## Important Architecture Note

CouchDB LiveSync stores the synced vault as CouchDB documents. It does not automatically create a normal server-side Markdown folder that a coding agent can read and write.

This repo mounts `ops/brain-stack/vault` as the real agent workspace. To keep Obsidian and the server agent looking at the same files, use file-level sync such as Syncthing.

CouchDB can stay available for Obsidian LiveSync, but it is not the agent's read/write path.
