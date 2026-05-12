import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { db } from "./core/db.js";
import { isVisibleDirectory, isVisibleNoteFile, resolveVaultPath, toVaultRelative } from "./core/vault-fs.js";
import { syncTaskIndex } from "./domains/tasks.js";
import { captureHealthIntake, listRecentHealthEntries } from "./domains/health.js";

export type ToolJsonSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: ToolJsonSchema;
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown;
};

async function walkVault(directory: string, max: number, accumulator: string[]) {
  if (accumulator.length >= max) return;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (accumulator.length >= max) return;
    const fullPath = path.join(directory, entry.name);
    if (entry.isFile() && isVisibleNoteFile(entry.name)) {
      accumulator.push(toVaultRelative(fullPath));
    } else if (entry.isDirectory() && isVisibleDirectory(entry.name)) {
      await walkVault(fullPath, max, accumulator);
    }
  }
}

export const tools: ToolDef[] = [
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
      const workouts = rows.map((row) => ({ ...row, sets: setsStmt.all(row.id as number) }));
      return { workouts };
    },
  },
  {
    name: "list_notes",
    description:
      "List markdown note paths in the vault. Pass a directory (e.g. 'tasks' or 'recipes') to scope, or empty for the whole vault. Returns relative paths. Capped at 500 results.",
    inputSchema: {
      type: "object",
      properties: {
        directory: { type: "string", description: "Vault-relative directory; empty for the whole vault" },
        limit: { type: "number", description: "Max number of paths to return (default 200, max 500)" },
      },
    },
    handler: async (args) => {
      const directory = typeof args.directory === "string" ? args.directory : "";
      const requested = Number(args.limit ?? 200);
      const limit = Math.min(500, Math.max(1, Number.isFinite(requested) ? requested : 200));
      const root = resolveVaultPath(directory);
      const out: string[] = [];
      try {
        await walkVault(root, limit, out);
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT") {
          return { directory, notes: [] };
        }
        throw error;
      }
      return { directory, notes: out };
    },
  },
  {
    name: "read_note",
    description:
      "Read a markdown note from the vault by relative path. Returns the file contents as a string and last-modified ISO timestamp.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path, e.g. 'tasks/foo.md'" },
      },
      required: ["path"],
    },
    handler: async (args) => {
      const relativePath = String(args.path ?? "").trim();
      if (!relativePath) throw new Error("path is required");
      const absolute = resolveVaultPath(relativePath);
      const [content, info] = await Promise.all([readFile(absolute, "utf8"), stat(absolute)]);
      return { path: toVaultRelative(absolute), content, modifiedAt: info.mtime.toISOString() };
    },
  },
  {
    name: "write_note",
    description:
      "Create or overwrite a markdown note in the vault. Parent directories are created if missing. Use sparingly; prefer read_note + a clear plan before writing.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path, must end with .md" },
        content: { type: "string", description: "Full file contents to write" },
      },
      required: ["path", "content"],
    },
    handler: async (args) => {
      const relativePath = String(args.path ?? "").trim();
      const content = typeof args.content === "string" ? args.content : "";
      if (!relativePath) throw new Error("path is required");
      if (!/\.md$/i.test(relativePath)) throw new Error("path must end with .md");
      const absolute = resolveVaultPath(relativePath);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, content, "utf8");
      const info = await stat(absolute);
      return { path: toVaultRelative(absolute), bytes: info.size, modifiedAt: info.mtime.toISOString() };
    },
  },
  {
    name: "search_notes",
    description:
      "Search markdown notes in the vault for a substring (case-insensitive). Returns up to 40 matches with file path, line number, and matching line snippet. Useful for 'remind me what I wrote about X' or finding linked references.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Substring to search for" },
        directory: { type: "string", description: "Optional vault subdirectory to scope the search" },
        limit: { type: "number", description: "Max matches (default 40, max 100)" },
      },
      required: ["query"],
    },
    handler: async (args) => {
      const query = String(args.query ?? "").trim();
      if (!query) throw new Error("query is required");
      const needle = query.toLowerCase();
      const directory = typeof args.directory === "string" ? args.directory : "";
      const requested = Number(args.limit ?? 40);
      const limit = Math.min(100, Math.max(1, Number.isFinite(requested) ? requested : 40));

      const paths: string[] = [];
      try {
        await walkVault(resolveVaultPath(directory), 2000, paths);
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT") {
          return { query, matches: [] };
        }
        throw error;
      }

      const matches: Array<{ path: string; line: number; snippet: string }> = [];
      for (const relativePath of paths) {
        if (matches.length >= limit) break;
        const absolute = resolveVaultPath(relativePath);
        let content: string;
        try {
          content = await readFile(absolute, "utf8");
        } catch {
          continue;
        }
        const lines = content.split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
          if (matches.length >= limit) break;
          const line = lines[index];
          if (line.toLowerCase().includes(needle)) {
            matches.push({ path: relativePath, line: index + 1, snippet: line.slice(0, 240) });
          }
        }
      }

      return { query, matches };
    },
  },
];

export function getTool(name: string) {
  return tools.find((tool) => tool.name === name);
}

export async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const tool = getTool(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return await tool.handler(args ?? {});
}
