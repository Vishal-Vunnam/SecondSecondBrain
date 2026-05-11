# vishalbot — agent plan

A comprehensive agent for the second brain. Goal: talk to your system from inside the console *and* from your phone / external clients, using the same tool layer.

## Architecture

```
┌─────────────────────────┐      ┌──────────────────────────┐
│  in-console chat panel  │      │  Claude Desktop / iOS    │
│  (vishalbot tab)        │      │  (or any MCP client)     │
└──────────┬──────────────┘      └────────────┬─────────────┘
           │                                  │
           │ uses same tool defs              │ MCP over HTTPS
           ▼                                  ▼
        ┌──────────────────────────────────────────┐
        │  MCP server  (/api/mcp, streamable HTTP) │
        │  - Bearer token auth                     │
        │  - 9 tools exposed                       │
        └──────────┬───────────────────────────────┘
                   │
                   ▼
        ┌────────────────────────────────┐
        │  existing console internals    │
        │  - tasks (vault + tasks_index) │
        │  - shopping (sqlite)           │
        │  - health (sqlite + Gemini)    │
        │  - vault notes (fs)            │
        └────────────────────────────────┘
```

**One tool layer, multiple clients.** The MCP server is the contract. The in-console chat is *one* client that happens to also know how to do UI-aware things. Claude Desktop is another. A future phone chat at `/m` is another. None of them are special.

## Why MCP over a custom protocol

- Claude Desktop, Claude Code, Cursor, and any future agent app speak MCP natively. No client work for free reach.
- Anthropic's MCP SDK handles the protocol, schemas, and session lifecycle. ~300 lines of glue total.
- The MCP server can be co-located with the existing Node HTTP server — same port, same auth model.
- If you ever want to host this externally (Cloudflare Worker, anywhere), MCP is portable.

## Why not build a custom agent framework

Don't. The agent loop is ~200 lines of Anthropic SDK calls. Tool routers, planners, memory stores, sub-agent meshes — all premature until you have 5 tools doing real work. Build tools first, then the loop, then *maybe* something fancier.

---

## Phase 1 — MCP server with 9 tools

### Tools to expose

| Tool                 | Wraps                                                  | Side effects                                  |
|----------------------|--------------------------------------------------------|-----------------------------------------------|
| `list_tasks`         | `listTasks` (reads `tasks_index`)                      | none                                          |
| `create_task`        | `writeTask` + frontmatter formatter                    | writes `vault/tasks/*.md` + upserts index     |
| `update_task_status` | `updateTaskStatus`                                     | writes file + upserts index                   |
| `add_shopping`       | `createShoppingItem`                                   | inserts into `shopping_items`                 |
| `list_shopping`      | `listShoppingItems`                                    | none                                          |
| `mark_shopping_got`  | `updateShoppingItem({ gotIt: true })`                  | updates `shopping_items` row                  |
| `log_health`         | `/api/health/capture` (gemini-backed)                  | writes meal/workout/body rows                 |
| `read_note`          | reads `vault/<path>.md`                                | none                                          |
| `write_note`         | writes `vault/<path>.md`                               | creates/overwrites file                       |

Each tool takes a small JSON schema, returns a small JSON payload. Keep response shapes lean — the model gets to see them.

### Auth

- Add `MCP_BEARER_TOKEN` env var. Generate once, store in `apps/console/.env` (gitignored).
- MCP transport rejects requests without `Authorization: Bearer <token>`.
- The console's existing cookie auth stays untouched — different surface, different auth.

### Transport

- Streamable HTTP (the post-stdio MCP transport).
- Single endpoint: `POST /api/mcp`.
- One MCP server instance per process; sessions managed by the SDK's `StreamableHTTPServerTransport`.

### Connecting Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "vishalbot": {
      "url": "http://127.0.0.1:8099/api/mcp",
      "headers": { "Authorization": "Bearer <MCP_BEARER_TOKEN>" }
    }
  }
}
```

For prod (Tailscale / public domain): swap the URL, keep the bearer.

### Files involved

- `apps/console/server/mcp.ts` (new) — MCP server, tool registry, schemas.
- `apps/console/server/server.ts` (modified) — mount `/api/mcp` route, pass through Bearer check, share helper fns.

---

## Phase 2 — in-console chat panel (vishalbot tab)

### What it adds over external clients

- **UI-aware tool results.** When the agent calls `add_shopping`, the Shopping list re-fetches in place — no reload. When it calls `list_tasks` you see the rendered list, not JSON.
- **Inline navigation.** Agent says "let me show you yesterday's meals" → it triggers `setActiveModuleId("health-log")` + selects yesterday on the strip.
- **Session continuity.** Reads/writes against the same auth cookie, no separate token.

### Pieces

- `apps/console/src/components/VishalbotPanel.tsx` — chat surface. Streams tokens from a new `/api/agent/chat` SSE endpoint.
- `apps/console/server/agent.ts` — server-side agent loop. Calls Anthropic SDK with the same tool schemas as the MCP server (shared module). Translates tool calls to local function calls (same handlers as MCP).
- New module `vishalbot` registered in `modules.ts`, top-level (not under a group).
- Bonus: a slash key (`⌘K`) anywhere in the app pops a quick-prompt overlay.

### Model choice

- Default: `claude-sonnet-4-6` for ambient chat.
- Switchable to `claude-opus-4-7` for hard reasoning ("plan my week from these notes").
- Cache the system prompt + tool defs with prompt caching — saves real money once the conversation history grows.

### Cost guardrails

- Cap tokens per response (~2000) for ambient use.
- Per-day token budget warning surfaced in the UI.

### Files involved

- `apps/console/server/agent.ts` (new) — agent loop, streaming, tool dispatch.
- `apps/console/server/tools.ts` (new) — shared tool defs + handlers (consumed by both `agent.ts` and `mcp.ts`).
- `apps/console/src/components/VishalbotPanel.tsx` (new).
- `apps/console/src/config/modules.ts` — register `vishalbot` module.
- `apps/console/src/lib/agent.ts` (new) — client streaming via `EventSource`.

---

## Phase 3 — mobile

Two non-exclusive paths:

### 3a. Point Claude iOS at the MCP server

- Same `claude_desktop_config.json` style config (or whatever the iOS app's MCP UI exposes).
- Requires the MCP URL to be reachable from your phone: Tailscale, Cloudflare Tunnel, or public domain with HTTPS.
- Zero new code on our side. Just expose the server and hand Claude the bearer token.

### 3b. `/m` — tiny mobile-web chat

- A second `index.html` served at `/m` with a stripped-down React (or even hand-rolled) chat view.
- Hits the same `/api/agent/chat` SSE endpoint as the in-console panel.
- Voice input: Web Speech API (`SpeechRecognition`) — already works on Safari iOS.
- Faster than launching Claude proper, scoped to *your* system only.

---

## What we are *not* building

These are tempting and wrong-time:

- ❌ Custom planner / sub-agent router.
- ❌ Long-term memory store (the vault *is* the memory; the agent can `read_note` / `write_note`).
- ❌ Eval harness, prompt versioning system.
- ❌ Multi-tenant anything.
- ❌ A streaming WebSocket layer (SSE is fine for one user).

Revisit any of these when you actually feel the pain.

---

## Open questions to revisit later

- **Notes search** — postponed. When you want it, add a SQLite FTS5 table mirroring `vault/**/*.md` and expose `search_notes`. Probably the most-used tool once it exists.
- **Voice intake unification** — the existing `/api/intake/task` and `/api/intake/health` could collapse into `agent.chat("…")` once Phase 2 ships. Decide whether to deprecate them.
- **Output schema enforcement** — for tools that return lists, decide if you want pagination or just trust the model to handle "30 tasks." For now, trust.
- **Permissions** — every tool currently does writes if the model decides to. If you ever want a "dry-run" mode or human-in-the-loop confirmation for destructive ops (`delete_task`), bake it into the tool layer, not the prompt.

---

## Suggested order of operations

1. Phase 1, all of it (MCP server + 9 tools + bearer auth). One sitting.
2. Test from Claude Desktop until the tool ergonomics feel right. Tweak schemas, descriptions, return shapes.
3. Phase 2 (in-console chat). One sitting once tools are dialed.
4. Phase 3a (point Claude iOS at it). Trivial after 1.
5. Phase 3b (`/m`) only if 3a annoys you.

Total: ~3–4 focused sessions to "I can talk to my system from anywhere."
