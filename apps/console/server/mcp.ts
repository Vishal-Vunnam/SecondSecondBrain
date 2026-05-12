import type { IncomingMessage, ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { mcpBearerToken } from "./core/config.js";
import { safeEqual } from "./core/auth.js";
import { db } from "./core/db.js";
import { readJsonBody, sendJson } from "./core/http.js";
import { syncTaskIndex } from "./domains/tasks.js";
import { captureHealthIntake, listRecentHealthEntries } from "./domains/health.js";

type ToolDef = {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown;
};

const tools: ToolDef[] = [
  {
    name: "list_tasks",
    description:
      "List all tasks from the vault index, sorted by status (open first), due date, then modified time. Returns title, status, priority, due, project, links, and vault path.",
    inputSchema: { type: "object", properties: {} },
    handler: () => {
      const rows = db
        .prepare(
          `SELECT path, title, status, priority, due, project, links, created, modified_at
           FROM tasks_index
           ORDER BY
             CASE status WHEN 'done' THEN 1 ELSE 0 END,
             CASE WHEN due IS NULL OR due = '' THEN 1 ELSE 0 END,
             due ASC,
             modified_at DESC`,
        )
        .all() as Array<Record<string, unknown>>;
      return { tasks: rows };
    },
  },
  {
    name: "reindex_tasks",
    description:
      "Rebuild the SQL tasks index from the markdown files in vault/tasks/. Call this after directly editing or creating task files on disk so list_tasks reflects the latest state.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      await syncTaskIndex();
      const count = (db.prepare(`SELECT COUNT(*) as c FROM tasks_index`).get() as { c: number }).c;
      return { reindexed: true, taskCount: count };
    },
  },
  {
    name: "list_shopping",
    description: "List shopping items. Open items appear first, sorted by necessity (essential/important/nice) then recency.",
    inputSchema: { type: "object", properties: {} },
    handler: () => {
      const rows = db
        .prepare(
          `SELECT id, title, reasoning, type, necessity, got_it, link, created_at, updated_at
           FROM shopping_items
           ORDER BY got_it ASC,
                    CASE necessity WHEN 'essential' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
                    datetime(created_at) DESC`,
        )
        .all();
      return { items: rows };
    },
  },
  {
    name: "add_shopping",
    description: "Add a new shopping item.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Item name" },
        reasoning: { type: "string", description: "Why this is on the list (optional)" },
        type: { type: "string", description: "Category, e.g. grocery, household, electronics (optional)" },
        necessity: { type: "string", enum: ["essential", "important", "nice"], description: "Defaults to important" },
        link: { type: "string", description: "Optional product URL" },
      },
      required: ["title"],
    },
    handler: (args) => {
      const title = String(args.title ?? "").trim();
      if (!title) throw new Error("title is required");
      const reasoning = typeof args.reasoning === "string" && args.reasoning.trim() ? args.reasoning.trim() : null;
      const type = typeof args.type === "string" && args.type.trim() ? args.type.trim() : null;
      const necessity = args.necessity === "essential" || args.necessity === "nice" ? args.necessity : "important";
      let link: string | null = null;
      if (typeof args.link === "string" && args.link.trim()) {
        const t = args.link.trim();
        link = /^https?:\/\//i.test(t) ? t : `https://${t}`;
      }
      const now = new Date().toISOString();
      const result = db
        .prepare(
          `INSERT INTO shopping_items (title, reasoning, type, necessity, got_it, link, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
        )
        .run(title, reasoning, type, necessity, link, now, now);
      const row = db.prepare(`SELECT * FROM shopping_items WHERE id = ?`).get(Number(result.lastInsertRowid));
      return { item: row };
    },
  },
  {
    name: "mark_shopping_got",
    description: "Mark a shopping item as obtained (got_it = true) by its id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number", description: "Shopping item id" } },
      required: ["id"],
    },
    handler: (args) => {
      const id = Number(args.id);
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid id");
      const existing = db.prepare(`SELECT id FROM shopping_items WHERE id = ?`).get(id);
      if (!existing) throw new Error("Shopping item not found");
      const now = new Date().toISOString();
      db.prepare(`UPDATE shopping_items SET got_it = 1, updated_at = ? WHERE id = ?`).run(now, id);
      const row = db.prepare(`SELECT * FROM shopping_items WHERE id = ?`).get(id);
      return { item: row };
    },
  },
  {
    name: "log_health",
    description:
      "Log a health entry (meal, workout, body, or commitment) by passing freeform text. The server uses Gemini to parse it into structured rows. Best for meals: 'oatmeal with berries and protein for breakfast, felt full'.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Freeform description of what to log" },
        timezone: { type: "string", description: "IANA timezone (defaults to America/New_York)" },
      },
      required: ["text"],
    },
    handler: async (args) => {
      const text = String(args.text ?? "").trim();
      if (!text) throw new Error("text is required");
      const timezone = typeof args.timezone === "string" ? args.timezone : undefined;
      return await captureHealthIntake({ text, source: "agent", timezone });
    },
  },
  {
    name: "get_health_recent",
    description:
      "Return the most recent health entries (meals, workouts, body logs, commitments) merged and sorted by capture time. Use this to answer questions about recent eating, training, sleep, energy, etc.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max entries to return (default 20, max 50)" },
      },
    },
    handler: (args) => {
      const requested = Number(args.limit ?? 20);
      const limit = Math.min(50, Math.max(1, Number.isFinite(requested) ? requested : 20));
      return { entries: listRecentHealthEntries(limit) };
    },
  },
  {
    name: "list_workouts",
    description:
      "List planned and completed workouts with their sets. Optionally filter by date range (YYYY-MM-DD). Defaults to the last 200 workouts by date.",
    inputSchema: {
      type: "object",
      properties: {
        start: { type: "string", description: "Start date YYYY-MM-DD (inclusive)" },
        end: { type: "string", description: "End date YYYY-MM-DD (inclusive)" },
      },
    },
    handler: (args) => {
      const start = typeof args.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.start) ? args.start : null;
      const end = typeof args.end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.end) ? args.end : null;
      const rows = (start && end
        ? db.prepare(`SELECT * FROM workouts WHERE date >= ? AND date <= ? ORDER BY date ASC, id ASC`).all(start, end)
        : db.prepare(`SELECT * FROM workouts ORDER BY date DESC, id DESC LIMIT 200`).all()) as Array<Record<string, unknown>>;

      const setsStmt = db.prepare(
        `SELECT id, exercise, weight, reps, position FROM workout_sets WHERE workout_id = ? ORDER BY position ASC, id ASC`,
      );
      const workouts = rows.map((row) => ({
        ...row,
        sets: setsStmt.all(row.id as number),
      }));
      return { workouts };
    },
  },
];

function buildServer() {
  const server = new Server(
    { name: "vishalbot", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
      };
    }
    try {
      const result = await tool.handler((args ?? {}) as Record<string, unknown>);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { isError: true, content: [{ type: "text", text: message }] };
    }
  });

  return server;
}

function hasValidMcpBearer(req: IncomingMessage) {
  if (!mcpBearerToken.trim()) return false;
  const header = req.headers.authorization ?? "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  return token.length > 0 && safeEqual(token, mcpBearerToken);
}

export async function handleMcpRequest(req: IncomingMessage, res: ServerResponse) {
  if (!hasValidMcpBearer(req)) {
    sendJson(res, 401, { error: "Valid MCP bearer token required" });
    return;
  }

  let body: unknown = undefined;
  if (req.method === "POST") {
    try {
      body = await readJsonBody(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request body";
      sendJson(res, 400, { error: message });
      return;
    }
  }

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
