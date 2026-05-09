# Second Brain Stack

Private Obsidian + CouchDB + Ollama + AnythingLLM stack for a self-hosted Second Brain.

## What This Deploys

- `brain-console`: a private web console on port `8080`.
- `couchdb`: Obsidian Self-hosted LiveSync backend on port `5984`.
- `ollama`: local model runtime inside Docker.
- `anythingllm`: agent/RAG UI on port `3001`.

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
- AnythingLLM: `http://100.70.195.79:3001`
- CouchDB Fauxton: `http://100.70.195.79:5984/_utils`

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

For AnythingLLM setup:

- LLM provider: Ollama
- Ollama base URL from inside Docker: `http://ollama:11434`
- Chat model: value of `OLLAMA_MODEL` in `.env`
- Embedding provider: Ollama
- Embedding model: value of `OLLAMA_EMBED_MODEL` in `.env`
- Vector database: LanceDB

## Important Architecture Note

CouchDB LiveSync stores the synced vault as CouchDB documents. It does not automatically create a normal server-side Markdown folder that AnythingLLM can read and write.

This repo mounts `ops/brain-stack/vault` into AnythingLLM at `/vault`, but that folder will only sync back to Obsidian after a bridge is added. The next implementation step should be one of:

- Add a LiveSync-aware bridge/MCP server that can read/write the encrypted CouchDB vault.
- Add Syncthing/Git for file-level vault sync and keep CouchDB only for Obsidian client sync.
- Use Obsidian's official Headless Sync if you decide a paid Obsidian Sync account is acceptable.

Until that bridge exists, use AnythingLLM RAG uploads for reading documents and treat `/vault/summaries` as staged generated notes.
