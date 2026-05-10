import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type VaultEntry = {
  name: string;
  path: string;
  type: "directory" | "file";
  size: number;
  modifiedAt: string;
};

type WeatherSummary = {
  location: string;
  condition: string;
  temperatureF: number | null;
  feelsLikeF: number | null;
  windMph: number | null;
  observedAt: string | null;
};

type NewsItem = {
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
};

type TaskStatus = "todo" | "doing" | "done";
type TaskPriority = "low" | "medium" | "high";

type TaskItem = {
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

type TaskDraft = {
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT ?? 80);
const host = process.env.HOST ?? "0.0.0.0";
const publicRoot = path.resolve(process.env.PUBLIC_ROOT ?? path.join(__dirname, "../public"));
const vaultRoot = path.resolve(process.env.VAULT_ROOT ?? "/vault");
const tailScaleIp = process.env.TAILSCALE_IP ?? "127.0.0.1";
const terminalPort = process.env.TERMINAL_PORT ?? "7681";
const maxFileBytes = Number(process.env.MAX_VAULT_FILE_BYTES ?? 5 * 1024 * 1024);
const hiddenFileNames = new Set(["AGENTS.md"]);
const tasksDirectory = "tasks";
const homeLocation = process.env.HOME_LOCATION ?? "Boulder";
const homeLatitude = process.env.HOME_LAT ?? "40.0150";
const homeLongitude = process.env.HOME_LON ?? "-105.2705";
const newsSource = process.env.NEWS_SOURCE ?? "BBC News";
const newsFeedUrl = process.env.NEWS_RSS_URL ?? "https://feeds.bbci.co.uk/news/rss.xml";
const authPassword = process.env.BRAIN_CONSOLE_PASSWORD ?? process.env.VISHAL_AI_PASSWORD ?? "";
const authSecret = process.env.BRAIN_CONSOLE_SESSION_SECRET ?? process.env.VISHAL_AI_SESSION_SECRET ?? authPassword;
const intakeToken = process.env.VISHAL_AI_INTAKE_TOKEN ?? "";
const geminiApiKey = process.env.GEMINI_API_KEY ?? "";
const geminiTaskModel = process.env.GEMINI_TASK_MODEL ?? "gemini-2.5-flash";
const authCookieName = "vishal_ai_session";
const authMaxAgeSeconds = 60 * 60 * 24 * 14;

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const corsHeaders = {
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
  "access-control-allow-credentials": "true",
  "access-control-allow-origin": process.env.CORS_ORIGIN ?? "http://127.0.0.1:5173",
};

function send(res: ServerResponse, status: number, body: string | Buffer = "", headers: Record<string, string> = {}) {
  res.writeHead(status, { ...corsHeaders, ...headers });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}) {
  send(res, status, JSON.stringify(payload), {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
}

function getRequestUrl(req: IncomingMessage) {
  return new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
}

function isAuthEnabled() {
  return authPassword.trim().length > 0;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signSession(expiresAt: number) {
  return createHmac("sha256", authSecret).update(String(expiresAt)).digest("base64url");
}

function createSessionToken() {
  const expiresAt = Date.now() + authMaxAgeSeconds * 1000;
  return `${expiresAt}.${signSession(expiresAt)}`;
}

function parseCookies(req: IncomingMessage) {
  const header = req.headers.cookie ?? "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...value] = part.split("=");
        return [decodeURIComponent(key), decodeURIComponent(value.join("="))];
      }),
  );
}

function isAuthenticated(req: IncomingMessage) {
  if (!isAuthEnabled()) return true;

  const token = parseCookies(req)[authCookieName];
  if (!token) return false;

  const [expiresAtRaw, signature] = token.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || !signature) return false;

  return safeEqual(signature, signSession(expiresAt));
}

function sessionCookie(value: string, maxAge: number) {
  const secure = process.env.COOKIE_SECURE === "true" ? "; Secure" : "";
  return `${authCookieName}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function clearSessionCookie() {
  return sessionCookie("", 0);
}

async function routeAuth(req: IncomingMessage, res: ServerResponse, pathname: string) {
  if (pathname === "/api/auth/status" && req.method === "GET") {
    sendJson(res, 200, {
      authenticated: isAuthenticated(req),
      authRequired: isAuthEnabled(),
    });
    return true;
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    const body = await readJsonBody(req);
    if (typeof body !== "object" || body === null || typeof (body as { password?: unknown }).password !== "string") {
      sendJson(res, 400, { error: "Expected JSON body with a password string" });
      return true;
    }

    if (!isAuthEnabled() || safeEqual((body as { password: string }).password, authPassword)) {
      sendJson(res, 200, { authenticated: true, authRequired: isAuthEnabled() }, { "set-cookie": sessionCookie(createSessionToken(), authMaxAgeSeconds) });
      return true;
    }

    sendJson(res, 401, { error: "Incorrect password" });
    return true;
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    sendJson(res, 200, { authenticated: false, authRequired: isAuthEnabled() }, { "set-cookie": clearSessionCookie() });
    return true;
  }

  return false;
}

function resolveVaultPath(relativePath = "") {
  if (relativePath.includes("\0")) {
    throw Object.assign(new Error("Invalid path"), { statusCode: 400 });
  }

  const cleaned = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const resolved = path.resolve(vaultRoot, cleaned);
  if (resolved !== vaultRoot && !resolved.startsWith(`${vaultRoot}${path.sep}`)) {
    throw Object.assign(new Error("Path escapes vault"), { statusCode: 400 });
  }

  return resolved;
}

function toVaultRelative(absolutePath: string) {
  const relative = path.relative(vaultRoot, absolutePath);
  return relative === "" ? "" : relative.split(path.sep).join("/");
}

function isVisibleNoteFile(name: string) {
  return path.extname(name).toLowerCase() === ".md" && !name.startsWith(".") && !hiddenFileNames.has(name);
}

function isVisibleDirectory(name: string) {
  return !name.startsWith(".") && !["node_modules", "__pycache__"].includes(name);
}

async function containsVisibleNotes(directoryPath: string): Promise<boolean> {
  const children = await readdir(directoryPath, { withFileTypes: true });

  for (const child of children) {
    if (child.isFile() && isVisibleNoteFile(child.name)) return true;

    if (child.isDirectory() && isVisibleDirectory(child.name)) {
      if (await containsVisibleNotes(path.join(directoryPath, child.name))) return true;
    }
  }

  return false;
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxFileBytes + 4096) {
      throw Object.assign(new Error("Request body too large"), { statusCode: 413 });
    }
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

async function listVaultEntries(res: ServerResponse, url: URL) {
  const relativePath = url.searchParams.get("path") ?? "";
  const directoryPath = resolveVaultPath(relativePath);
  const directoryStat = await stat(directoryPath);

  if (!directoryStat.isDirectory()) {
    sendJson(res, 400, { error: "Path is not a directory" });
    return;
  }

  const entries = await Promise.all(
    (await readdir(directoryPath, { withFileTypes: true }))
      .filter((entry) => {
        if (entry.isDirectory()) return isVisibleDirectory(entry.name);
        if (entry.isFile()) return isVisibleNoteFile(entry.name);
        return false;
      })
      .map(async (entry): Promise<VaultEntry | null> => {
        const entryPath = path.join(directoryPath, entry.name);
        const entryStat = await stat(entryPath);

        if (entry.isDirectory() && !(await containsVisibleNotes(entryPath))) {
          return null;
        }

        return {
          name: entry.name,
          path: toVaultRelative(entryPath),
          type: entry.isDirectory() ? "directory" : "file",
          size: entryStat.size,
          modifiedAt: entryStat.mtime.toISOString(),
        };
      }),
  );
  const visibleEntries = entries.filter((entry): entry is VaultEntry => entry !== null);

  visibleEntries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  sendJson(res, 200, {
    path: toVaultRelative(directoryPath),
    parentPath: directoryPath === vaultRoot ? null : toVaultRelative(path.dirname(directoryPath)),
    entries: visibleEntries,
  });
}

async function readVaultFile(res: ServerResponse, url: URL) {
  const relativePath = url.searchParams.get("path") ?? "";
  const filePath = resolveVaultPath(relativePath);
  const fileStat = await stat(filePath);

  if (!fileStat.isFile()) {
    sendJson(res, 400, { error: "Path is not a file" });
    return;
  }

  if (fileStat.size > maxFileBytes) {
    sendJson(res, 413, { error: "File is too large to open in the console" });
    return;
  }

  sendJson(res, 200, {
    path: toVaultRelative(filePath),
    name: path.basename(filePath),
    content: await readFile(filePath, "utf8"),
    modifiedAt: fileStat.mtime.toISOString(),
    size: fileStat.size,
  });
}

async function writeVaultFile(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody(req);

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { path?: unknown }).path !== "string" ||
    typeof (body as { content?: unknown }).content !== "string"
  ) {
    sendJson(res, 400, { error: "Expected JSON body with path and content strings" });
    return;
  }

  const filePath = resolveVaultPath((body as { path: string }).path);
  const content = (body as { content: string }).content;
  if (Buffer.byteLength(content, "utf8") > maxFileBytes) {
    sendJson(res, 413, { error: "File content is too large to save from the console" });
    return;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  const fileStat = await stat(filePath);

  sendJson(res, 200, {
    path: toVaultRelative(filePath),
    name: path.basename(filePath),
    content,
    modifiedAt: fileStat.mtime.toISOString(),
    size: fileStat.size,
  });
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || "task";
}

function normalizeTaskStatus(value: unknown): TaskStatus {
  return value === "doing" || value === "done" ? value : "todo";
}

function normalizeTaskPriority(value: unknown): TaskPriority {
  return value === "low" || value === "high" ? value : "medium";
}

function cleanOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLinks(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((link): link is string => typeof link === "string")
    .map((link) => link.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function cleanScalar(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function escapeYamlString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function parseFrontmatter(content: string) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") return { data: {} as Record<string, string | string[]>, body: content };

  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  if (end === -1) return { data: {} as Record<string, string | string[]>, body: content };

  const data: Record<string, string | string[]> = {};
  let currentArrayKey: string | null = null;

  for (const line of lines.slice(1, end)) {
    const arrayMatch = line.match(/^\s*-\s+(.*)$/);
    if (arrayMatch && currentArrayKey) {
      const existing = data[currentArrayKey];
      data[currentArrayKey] = [...(Array.isArray(existing) ? existing : []), cleanScalar(arrayMatch[1])];
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) continue;

    const [, key, rawValue] = keyMatch;
    currentArrayKey = null;
    if (rawValue === "") {
      data[key] = "";
      if (key === "links" || key === "tags" || key === "ingredients") currentArrayKey = key;
      continue;
    }

    const inlineArray = rawValue.match(/^\[(.*)\]$/);
    if (inlineArray) {
      data[key] = inlineArray[1]
        .split(",")
        .map((item) => cleanScalar(item))
        .filter(Boolean);
      continue;
    }

    data[key] = cleanScalar(rawValue);
  }

  return {
    data,
    body: lines.slice(end + 1).join("\n").trim(),
  };
}

function extractMarkdownTitle(body: string, fallback: string) {
  const titleLine = body.split(/\r?\n/).find((line) => line.startsWith("# "));
  return titleLine?.replace(/^#\s+/, "").trim() || fallback.replace(/\.md$/i, "");
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

async function listTasks(res: ServerResponse) {
  const taskRoot = resolveVaultPath(tasksDirectory);
  let children;

  try {
    children = await readdir(taskRoot, { withFileTypes: true });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      sendJson(res, 200, { tasks: [] });
      return;
    }
    throw error;
  }

  const tasks = await Promise.all(
    children
      .filter((entry) => entry.isFile() && isVisibleNoteFile(entry.name))
      .map(async (entry) => {
        const filePath = path.join(taskRoot, entry.name);
        const fileStat = await stat(filePath);
        const content = await readFile(filePath, "utf8");
        return parseTaskFile(toVaultRelative(filePath), content, fileStat.mtime.toISOString());
      }),
  );

  tasks.sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (a.status !== "done" && b.status === "done") return -1;
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return b.modifiedAt.localeCompare(a.modifiedAt);
  });

  sendJson(res, 200, { tasks });
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
  return parseTaskFile(toVaultRelative(filePath), content, fileStat.mtime.toISOString());
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

  sendJson(res, 200, { task: parseTaskFile(toVaultRelative(filePath), content, fileStat.mtime.toISOString()) });
}

function hasValidIntakeToken(req: IncomingMessage) {
  if (!intakeToken.trim()) return false;

  const header = req.headers.authorization ?? "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  return token.length > 0 && safeEqual(token, intakeToken);
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

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function conditionFromWeatherCode(code: unknown) {
  if (typeof code !== "number") return "Unavailable";

  if (code === 0) return "Clear";
  if ([1, 2].includes(code)) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorms";

  return "Variable";
}

function decodeXmlEntity(entity: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };

  if (entity.startsWith("#x")) {
    const codePoint = Number.parseInt(entity.slice(2), 16);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  }
  if (entity.startsWith("#")) {
    const codePoint = Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  }
  return named[entity] ?? `&${entity};`;
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&([^;]+);/g, (_match, entity: string) => decodeXmlEntity(entity))
    .trim();
}

function getXmlTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : null;
}

async function routeWeather(res: ServerResponse) {
  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", homeLatitude);
  weatherUrl.searchParams.set("longitude", homeLongitude);
  weatherUrl.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,wind_speed_10m");
  weatherUrl.searchParams.set("temperature_unit", "fahrenheit");
  weatherUrl.searchParams.set("wind_speed_unit", "mph");
  weatherUrl.searchParams.set("timezone", "auto");

  const response = await fetch(weatherUrl, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    sendJson(res, 502, { error: `Weather provider returned ${response.status}` });
    return;
  }

  const payload = (await response.json()) as {
    current?: {
      apparent_temperature?: unknown;
      temperature_2m?: unknown;
      time?: unknown;
      weather_code?: unknown;
      wind_speed_10m?: unknown;
    };
  };
  const current = payload.current ?? {};
  const summary: WeatherSummary = {
    location: homeLocation,
    condition: conditionFromWeatherCode(current.weather_code),
    temperatureF: asNumber(current.temperature_2m),
    feelsLikeF: asNumber(current.apparent_temperature),
    windMph: asNumber(current.wind_speed_10m),
    observedAt: typeof current.time === "string" ? current.time : null,
  };

  sendJson(res, 200, summary);
}

async function routeNews(res: ServerResponse) {
  const response = await fetch(newsFeedUrl, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    sendJson(res, 502, { error: `News provider returned ${response.status}` });
    return;
  }

  const xml = await response.text();
  const items: NewsItem[] = Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi))
    .slice(0, 7)
    .map((match) => {
      const block = match[1];
      return {
        title: getXmlTag(block, "title") ?? "Untitled",
        source: newsSource,
        url: getXmlTag(block, "link") ?? "",
        publishedAt: getXmlTag(block, "pubDate"),
      };
    })
    .filter((item) => item.title !== "Untitled" && item.url);

  sendJson(res, 200, {
    source: newsSource,
    generatedAt: new Date().toISOString(),
    items,
  });
}

async function probe(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return response.ok || [401, 403].includes(response.status);
  } catch {
    return false;
  }
}

async function routeHealth(res: ServerResponse, pathname: string) {
  const checks: Record<string, string> = {
    "/health/couchdb": "http://couchdb:5984/_up",
    "/health/syncthing": "http://syncthing:8384/rest/noauth/health",
    "/health/terminal": `http://${tailScaleIp}:${terminalPort}/`,
    "/health/ollama": "http://ollama:11434/api/tags",
    "/health/anythingllm": "http://anythingllm:3001/",
  };

  if (pathname === "/health/console") {
    send(res, 204);
    return;
  }

  const url = checks[pathname];
  if (!url) {
    sendJson(res, 404, { error: "Unknown health check" });
    return;
  }

  send(res, (await probe(url)) ? 204 : 503);
}

async function serveStatic(res: ServerResponse, url: URL) {
  const requested = decodeURIComponent(url.pathname);
  const relativePath = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
  const filePath = path.resolve(publicRoot, relativePath);
  const safePath = filePath.startsWith(`${publicRoot}${path.sep}`) ? filePath : path.join(publicRoot, "index.html");
  const fallbackPath = path.join(publicRoot, "index.html");

  try {
    await access(safePath, constants.R_OK);
    const data = await readFile(safePath);
    send(res, 200, data, {
      "content-type": contentTypes[path.extname(safePath)] ?? "application/octet-stream",
      "cache-control": safePath === fallbackPath ? "no-store" : "public, max-age=31536000, immutable",
    });
  } catch {
    const data = await readFile(fallbackPath);
    send(res, 200, data, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
  }
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = getRequestUrl(req);

  if (req.method === "OPTIONS") {
    send(res, 204);
    return;
  }

  if (await routeAuth(req, res, url.pathname)) {
    return;
  }

  if (url.pathname === "/api/intake/task" && req.method === "POST") {
    await intakeTask(req, res);
    return;
  }

  if (
    isAuthEnabled() &&
    !isAuthenticated(req) &&
    (url.pathname.startsWith("/api/") || (url.pathname.startsWith("/health/") && url.pathname !== "/health/console"))
  ) {
    sendJson(res, 401, { error: "Authentication required" });
    return;
  }

  if (url.pathname.startsWith("/health/")) {
    await routeHealth(res, url.pathname);
    return;
  }

  if (url.pathname === "/api/home/weather" && req.method === "GET") {
    await routeWeather(res);
    return;
  }

  if (url.pathname === "/api/home/news" && req.method === "GET") {
    await routeNews(res);
    return;
  }

  if (url.pathname === "/api/tasks" && req.method === "GET") {
    await listTasks(res);
    return;
  }

  if (url.pathname === "/api/tasks" && req.method === "POST") {
    await createTask(req, res);
    return;
  }

  if (url.pathname === "/api/tasks/status" && req.method === "PUT") {
    await updateTaskStatus(req, res);
    return;
  }

  if (url.pathname === "/api/vault/tree" && req.method === "GET") {
    await listVaultEntries(res, url);
    return;
  }

  if (url.pathname === "/api/vault/file" && req.method === "GET") {
    await readVaultFile(res, url);
    return;
  }

  if (url.pathname === "/api/vault/file" && req.method === "PUT") {
    await writeVaultFile(req, res);
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "Unknown API route" });
    return;
  }

  await serveStatic(res, url);
}

const server = createServer((req, res) => {
  route(req, res).catch((error: unknown) => {
    const status = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 500;
    const message = error instanceof Error ? error.message : "Unexpected server error";
    sendJson(res, Number.isFinite(status) ? status : 500, { error: message });
  });
});

server.listen(port, host, () => {
  console.log(`brain console listening on ${host}:${port}`);
  console.log(`vault root: ${vaultRoot}`);
});
