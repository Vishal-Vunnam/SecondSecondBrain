import { constants } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { geminiApiKey, geminiTaskModel, tasksDirectory } from "../core/config.js";
import { hasValidIntakeToken } from "../core/auth.js";
import { db } from "../core/db.js";
import { readJsonBody, sendJson } from "../core/http.js";
import {
  cleanOptionalText,
  escapeYamlString,
  extractMarkdownTitle,
  parseFrontmatter,
  slugify,
} from "../core/markdown.js";
import { isVisibleNoteFile, resolveVaultPath, toVaultRelative } from "../core/vault-fs.js";

export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "low" | "medium" | "high";

export type TaskItem = {
  path: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due: string | null;
  project: string | null;
  links: string[];
  created: string | null;
  modifiedAt: string;
  body: string;
};

export type TaskDraft = {
  title: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due?: string;
  project?: string;
  links: string[];
  context?: string;
  nextAction?: string;
};

type GeminiTaskResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

function normalizeTaskStatus(value: unknown): TaskStatus {
  return value === "doing" || value === "done" ? value : "todo";
}

function normalizeTaskPriority(value: unknown): TaskPriority {
  return value === "low" || value === "high" ? value : "medium";
}

function normalizeLinks(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((link): link is string => typeof link === "string")
    .map((link) => link.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function formatTaskMarkdown(input: {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due?: string;
  project?: string;
  links: string[];
  context?: string;
  nextAction?: string;
}) {
  const frontmatter = [
    "---",
    "type: task",
    `title: ${escapeYamlString(input.title)}`,
    `status: ${input.status}`,
    `priority: ${input.priority}`,
    `due: ${input.due?.trim() ?? ""}`,
    `project: ${input.project?.trim() ?? ""}`,
    input.links.length ? "links:" : "links: []",
    ...input.links.map((link) => `  - ${escapeYamlString(link)}`),
    `created: ${new Date().toISOString()}`,
    "---",
  ];
  const context = input.context?.trim() ?? "";
  const nextAction = input.nextAction?.trim() ?? "";

  return `${frontmatter.join("\n")}\n\n# ${input.title}\n\n## Context\n${context}\n\n## Next Action\n${nextAction}\n`;
}

function parseTaskFile(relativePath: string, content: string, modifiedAt: string): TaskItem {
  const { data, body } = parseFrontmatter(content);
  const titleValue = typeof data.title === "string" ? data.title : "";
  const links = Array.isArray(data.links) ? data.links : [];

  return {
    path: relativePath,
    title: titleValue || extractMarkdownTitle(body, path.basename(relativePath)),
    status: normalizeTaskStatus(data.status),
    priority: normalizeTaskPriority(data.priority),
    due: typeof data.due === "string" && data.due.trim() ? data.due.trim() : null,
    project: typeof data.project === "string" && data.project.trim() ? data.project.trim() : null,
    links,
    created: typeof data.created === "string" && data.created.trim() ? data.created.trim() : null,
    modifiedAt,
    body,
  };
}

type TaskIndexRow = {
  path: string;
  title: string;
  status: string;
  priority: string;
  due: string | null;
  project: string | null;
  links: string;
  created: string | null;
  modified_at: string;
};

function taskRowToItem(row: TaskIndexRow): TaskItem {
  let links: string[] = [];
  try {
    const parsed = JSON.parse(row.links);
    if (Array.isArray(parsed)) links = parsed.filter((v): v is string => typeof v === "string");
  } catch {}
  return {
    path: row.path,
    title: row.title,
    status: normalizeTaskStatus(row.status),
    priority: normalizeTaskPriority(row.priority),
    due: row.due,
    project: row.project,
    links,
    created: row.created,
    modifiedAt: row.modified_at,
    body: "",
  };
}

function upsertTaskIndex(task: TaskItem) {
  db
    .prepare(
      `INSERT INTO tasks_index (path, title, status, priority, due, project, links, created, modified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         title = excluded.title,
         status = excluded.status,
         priority = excluded.priority,
         due = excluded.due,
         project = excluded.project,
         links = excluded.links,
         created = excluded.created,
         modified_at = excluded.modified_at`
    )
    .run(
      task.path,
      task.title,
      task.status,
      task.priority,
      task.due,
      task.project,
      JSON.stringify(task.links),
      task.created,
      task.modifiedAt,
    );
}

function removeTaskIndex(taskPath: string) {
  db.prepare(`DELETE FROM tasks_index WHERE path = ?`).run(taskPath);
}

export async function syncTaskIndex(): Promise<void> {
  const taskRoot = resolveVaultPath(tasksDirectory);
  let children;
  try {
    children = await readdir(taskRoot, { withFileTypes: true });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      db.exec(`DELETE FROM tasks_index`);
      return;
    }
    throw error;
  }

  const indexed = new Map<string, string>();
  const rows = db.prepare(`SELECT path, modified_at FROM tasks_index`).all() as Array<{ path: string; modified_at: string }>;
  for (const row of rows) indexed.set(row.path, row.modified_at);

  const seen = new Set<string>();
  await Promise.all(
    children
      .filter((entry) => entry.isFile() && isVisibleNoteFile(entry.name))
      .map(async (entry) => {
        const filePath = path.join(taskRoot, entry.name);
        const fileStat = await stat(filePath);
        const relPath = toVaultRelative(filePath);
        seen.add(relPath);
        const mtime = fileStat.mtime.toISOString();
        if (indexed.get(relPath) === mtime) return;
        const content = await readFile(filePath, "utf8");
        upsertTaskIndex(parseTaskFile(relPath, content, mtime));
      }),
  );

  for (const indexedPath of indexed.keys()) {
    if (!seen.has(indexedPath)) removeTaskIndex(indexedPath);
  }
}

async function listTasks(res: ServerResponse) {
  try {
    await syncTaskIndex();
  } catch (error) {
    console.warn("tasks index sync failed", error);
  }

  const rows = db
    .prepare(
      `SELECT path, title, status, priority, due, project, links, created, modified_at
       FROM tasks_index
       ORDER BY
         CASE status WHEN 'done' THEN 1 ELSE 0 END,
         CASE WHEN due IS NULL OR due = '' THEN 1 ELSE 0 END,
         due ASC,
         modified_at DESC`
    )
    .all() as TaskIndexRow[];

  sendJson(res, 200, { tasks: rows.map(taskRowToItem) });
}

async function uniqueTaskPath(title: string) {
  const taskRoot = resolveVaultPath(tasksDirectory);
  await mkdir(taskRoot, { recursive: true });

  const base = slugify(title);
  let filePath = path.join(taskRoot, `${base}.md`);
  let index = 2;
  while (true) {
    try {
      await access(filePath, constants.F_OK);
      filePath = path.join(taskRoot, `${base}-${index}.md`);
      index += 1;
    } catch {
      return filePath;
    }
  }
}

async function writeTask(input: TaskDraft) {
  const title = input.title.trim();
  if (!title) {
    throw Object.assign(new Error("Task title cannot be empty"), { statusCode: 400 });
  }

  const filePath = await uniqueTaskPath(title);
  const content = formatTaskMarkdown({
    title,
    status: normalizeTaskStatus(input.status),
    priority: normalizeTaskPriority(input.priority),
    due: cleanOptionalText(input.due),
    project: cleanOptionalText(input.project),
    links: normalizeLinks(input.links),
    context: cleanOptionalText(input.context),
    nextAction: cleanOptionalText(input.nextAction),
  });

  await writeFile(filePath, content, "utf8");
  const fileStat = await stat(filePath);
  const task = parseTaskFile(toVaultRelative(filePath), content, fileStat.mtime.toISOString());
  upsertTaskIndex(task);
  return task;
}

async function createTask(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody(req);
  if (typeof body !== "object" || body === null || typeof (body as { title?: unknown }).title !== "string") {
    sendJson(res, 400, { error: "Expected JSON body with a title string" });
    return;
  }

  const input = body as {
    context?: unknown;
    due?: unknown;
    links?: unknown;
    priority?: unknown;
    project?: unknown;
    title: string;
  };
  const task = await writeTask({
    title: input.title,
    status: "todo",
    priority: normalizeTaskPriority(input.priority),
    due: cleanOptionalText(input.due),
    project: cleanOptionalText(input.project),
    links: normalizeLinks(input.links),
    context: cleanOptionalText(input.context),
  });

  sendJson(res, 201, { task });
}

function replaceFrontmatterField(content: string, key: string, value: string) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") {
    return `---\ntype: task\n${key}: ${value}\n---\n\n${content}`;
  }

  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  if (end === -1) return content;

  const keyPattern = new RegExp(`^${key}:`);
  const existingIndex = lines.findIndex((line, index) => index > 0 && index < end && keyPattern.test(line));
  if (existingIndex === -1) {
    lines.splice(end, 0, `${key}: ${value}`);
  } else {
    lines[existingIndex] = `${key}: ${value}`;
  }

  return lines.join("\n");
}

async function updateTaskStatus(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody(req);
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { path?: unknown }).path !== "string" ||
    typeof (body as { status?: unknown }).status !== "string"
  ) {
    sendJson(res, 400, { error: "Expected JSON body with path and status strings" });
    return;
  }

  const relativePath = (body as { path: string }).path;
  if (!relativePath.startsWith(`${tasksDirectory}/`)) {
    sendJson(res, 400, { error: "Task path must live under tasks/" });
    return;
  }

  const statusValue = (body as { status: string }).status;
  if (!["todo", "doing", "done"].includes(statusValue)) {
    sendJson(res, 400, { error: "Unsupported task status" });
    return;
  }

  const filePath = resolveVaultPath(relativePath);
  const current = await readFile(filePath, "utf8");
  const content = replaceFrontmatterField(current, "status", statusValue);
  await writeFile(filePath, content, "utf8");
  const fileStat = await stat(filePath);
  const task = parseTaskFile(toVaultRelative(filePath), content, fileStat.mtime.toISOString());
  upsertTaskIndex(task);
  sendJson(res, 200, { task });
}

function buildTaskIntakePrompt(input: { text: string; source: string; timezone: string }) {
  return [
    "You are the voice task intake parser for Vishal.ai, a private Obsidian-backed personal operating system.",
    "Extract exactly one actionable task from the user's dictated text.",
    "Return only JSON that matches the provided schema.",
    "",
    "Rules:",
    "- title: concise imperative or noun phrase, no trailing punctuation.",
    "- status: always todo unless the user explicitly says they are doing it now or it is already done.",
    "- priority: high for urgent/time-sensitive/important language, low for someday/maybe, otherwise medium.",
    "- due: YYYY-MM-DD if the user gives a date or relative date; otherwise empty string.",
    "- project: short project/category if obvious, otherwise empty string.",
    "- links: Obsidian wikilinks for obvious topics only, like [[Distributed Systems]] or [[Vishal.ai]].",
    "- context: one or two useful sentences, including any details that should not be lost.",
    "- nextAction: the smallest concrete next action.",
    "",
    `Current server timestamp: ${new Date().toISOString()}`,
    `User timezone: ${input.timezone}`,
    `Capture source: ${input.source}`,
    "",
    "Dictated text:",
    input.text,
  ].join("\n");
}

function parseGeminiTask(text: string): TaskDraft {
  const parsed = JSON.parse(text) as {
    context?: unknown;
    due?: unknown;
    links?: unknown;
    nextAction?: unknown;
    priority?: unknown;
    project?: unknown;
    status?: unknown;
    title?: unknown;
  };

  if (typeof parsed.title !== "string" || !parsed.title.trim()) {
    throw Object.assign(new Error("Gemini did not return a task title"), { statusCode: 502 });
  }

  return {
    title: parsed.title,
    status: normalizeTaskStatus(parsed.status),
    priority: normalizeTaskPriority(parsed.priority),
    due: cleanOptionalText(parsed.due),
    project: cleanOptionalText(parsed.project),
    links: normalizeLinks(parsed.links),
    context: cleanOptionalText(parsed.context),
    nextAction: cleanOptionalText(parsed.nextAction),
  };
}

async function parseTaskWithGemini(input: { text: string; source: string; timezone: string }) {
  if (!geminiApiKey.trim()) {
    throw Object.assign(new Error("GEMINI_API_KEY is not configured"), { statusCode: 503 });
  }

  const apiUrl = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${geminiTaskModel}:generateContent`);
  apiUrl.searchParams.set("key", geminiApiKey);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: buildTaskIntakePrompt(input) }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            status: { type: "STRING", enum: ["todo", "doing", "done"] },
            priority: { type: "STRING", enum: ["low", "medium", "high"] },
            due: { type: "STRING" },
            project: { type: "STRING" },
            links: { type: "ARRAY", items: { type: "STRING" } },
            context: { type: "STRING" },
            nextAction: { type: "STRING" },
          },
          required: ["title", "status", "priority", "due", "project", "links", "context", "nextAction"],
        },
      },
    }),
  });

  const payload = (await response.json()) as GeminiTaskResponse;
  if (!response.ok) {
    throw Object.assign(new Error(payload.error?.message ?? `Gemini returned ${response.status}`), { statusCode: 502 });
  }

  const text = payload.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  if (!text) {
    throw Object.assign(new Error("Gemini returned no task JSON"), { statusCode: 502 });
  }

  return parseGeminiTask(text);
}

async function intakeTask(req: IncomingMessage, res: ServerResponse) {
  if (!hasValidIntakeToken(req)) {
    sendJson(res, 401, { error: "Valid intake bearer token required" });
    return;
  }

  const body = await readJsonBody(req);
  if (typeof body !== "object" || body === null || typeof (body as { text?: unknown }).text !== "string") {
    sendJson(res, 400, { error: "Expected JSON body with a text string" });
    return;
  }

  const text = (body as { text: string }).text.trim();
  if (!text) {
    sendJson(res, 400, { error: "Task intake text cannot be empty" });
    return;
  }

  const source = cleanOptionalText((body as { source?: unknown }).source) || "voice";
  const timezone = cleanOptionalText((body as { timezone?: unknown }).timezone) || "America/New_York";
  const draft = await parseTaskWithGemini({ text, source, timezone });
  const task = await writeTask(draft);

  sendJson(res, 201, { task, draft });
}

export async function routeTasks(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === "/api/tasks" && req.method === "GET") {
    await listTasks(res);
    return true;
  }
  if (url.pathname === "/api/tasks" && req.method === "POST") {
    await createTask(req, res);
    return true;
  }
  if (url.pathname === "/api/tasks/status" && req.method === "PUT") {
    await updateTaskStatus(req, res);
    return true;
  }
  if (url.pathname === "/api/intake/task" && req.method === "POST") {
    await intakeTask(req, res);
    return true;
  }
  return false;
}
