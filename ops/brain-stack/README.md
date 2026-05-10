# Vishal.ai Stack

Private Obsidian + direct filesystem workspace for Vishal.ai.

## What This Deploys

- `brain-console`: a private web console on port `8080` with direct vault file browsing/editing.
- `syncthing`: file-level vault sync on port `8384`.
- `couchdb`: Obsidian Self-hosted LiveSync backend on port `5984`.
- `ollama`: local model runtime inside Docker.
- `anythingllm`: optional agent UI on port `3001`.

All published ports bind to `TAILSCALE_IP` from `.env`, so the services are intended to be reached over your Tailnet rather than the public internet.

## Public Hostname

To serve the console at `https://ai.vishalvunnam.com`, keep the sync services private and put only the console plus web terminal behind Caddy:

```bash
cd ops/brain-stack
./scripts/create-env.sh
sed -i.bak 's/^PUBLIC_HOSTNAME=.*/PUBLIC_HOSTNAME=ai.vishalvunnam.com/' .env
sed -i.bak 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' .env
sed -i.bak 's#^TERMINAL_BASE_PATH=.*#TERMINAL_BASE_PATH=/terminal#' .env
./scripts/stop-web-terminal.sh
./scripts/start-web-terminal.sh
docker compose --profile public up -d --build brain-console caddy
```

In Vercel DNS, add:

```text
Type: A
Name: ai
Value: <GCP VM external IPv4>
```

The GCP firewall must allow public TCP `80` and `443` to the VM so Caddy can issue and renew the TLS certificate. Do not open CouchDB, Syncthing, Ollama, or AnythingLLM publicly.

Your login password is `BRAIN_CONSOLE_PASSWORD` in `.env`. The terminal has its own basic-auth password in `TERMINAL_PASSWORD`.

## Voice Task Intake

The console exposes a phone-friendly task capture API:

```text
POST https://ai.vishalvunnam.com/api/intake/task
Authorization: Bearer <VISHAL_AI_INTAKE_TOKEN>
Content-Type: application/json
```

Body:

```json
{
  "text": "Remind me tomorrow afternoon to email Professor Smith about the distributed systems paper, high priority.",
  "source": "ios-shortcut",
  "timezone": "America/New_York"
}
```

The server keeps your Gemini key private, asks Gemini to extract structured task data, and writes a Markdown task into `vault/tasks/`.

Required `.env` values:

```bash
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_TASK_MODEL=gemini-2.5-flash
VISHAL_AI_INTAKE_TOKEN=random_shared_secret_for_shortcuts
```

To inspect the token for Apple Shortcuts:

```bash
grep '^VISHAL_AI_INTAKE_TOKEN=' .env
```

Apple Shortcut shape:

```text
Dictate Text
Get Contents of URL
  URL: https://ai.vishalvunnam.com/api/intake/task
  Method: POST
  Headers:
    Authorization: Bearer <VISHAL_AI_INTAKE_TOKEN>
    Content-Type: application/json
  JSON:
    text: Dictated Text
    source: ios-shortcut
    timezone: America/New_York
Show Notification: Task added
```

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
