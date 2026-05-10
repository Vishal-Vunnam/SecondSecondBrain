import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { constants, mkdirSync } from "node:fs";
import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
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

type GeminiJsonResponse = GeminiTaskResponse;

type HealthEntryType = "meal" | "workout" | "body" | "commitment";
type HealthRouteType = HealthEntryType | "mixed";

type HealthMealDraft = {
  summary?: string;
  description: string;
  mealType?: string;
  proteinGEstimate?: number | null;
  caloriesEstimate?: number | null;
  hunger?: number | null;
  fullness?: number | null;
  energy?: number | null;
  digestion?: number | null;
  gassiness?: number | null;
  notes?: string;
};

type HealthWorkoutDraft = {
  summary?: string;
  workoutType?: string;
  focus?: string;
  muscles?: string;
  description: string;
  durationMinutes?: number | null;
  intensity?: number | null;
  energyBefore?: number | null;
  energyAfter?: number | null;
  performance?: number | null;
  notes?: string;
};

type HealthBodyDraft = {
  summary?: string;
  sleepHours?: number | null;
  sleepQuality?: number | null;
  energy?: number | null;
  moodScore?: number | null;
  soreness?: number | null;
  stress?: number | null;
  hydration?: number | null;
  gassiness?: number | null;
  mood?: string;
  pain?: string;
  symptoms?: string;
  weightLb?: number | null;
  notes?: string;
};

type HealthCommitmentDraft = {
  title: string;
  description?: string;
  cadence?: string;
  targetCount?: number | null;
  completedCount?: number | null;
  reviewDate?: string;
  status?: string;
};

type ParsedHealthIntake = {
  route: HealthRouteType;
  confirmation: string;
  meals: HealthMealDraft[];
  workouts: HealthWorkoutDraft[];
  bodyLogs: HealthBodyDraft[];
  commitments: HealthCommitmentDraft[];
};

type HealthBaseEntry = {
  id: number;
  type: HealthEntryType;
  capturedAt: string;
  loggedDate: string;
  source: string | null;
  rawText: string | null;
  createdAt: string;
  updatedAt: string;
};

type HealthMealEntry = HealthBaseEntry & {
  type: "meal";
  description: string;
  mealType: string | null;
  proteinGEstimate: number | null;
  caloriesEstimate: number | null;
  summary: string | null;
  hunger: number | null;
  fullness: number | null;
  energy: number | null;
  digestion: number | null;
  gassiness: number | null;
  notes: string | null;
};

type HealthWorkoutEntry = HealthBaseEntry & {
  type: "workout";
  workoutType: string | null;
  focus: string | null;
  muscles: string | null;
  description: string;
  summary: string | null;
  durationMinutes: number | null;
  intensity: number | null;
  energyBefore: number | null;
  energyAfter: number | null;
  performance: number | null;
  notes: string | null;
};

type HealthBodyEntry = HealthBaseEntry & {
  type: "body";
  sleepHours: number | null;
  summary: string | null;
  sleepQuality: number | null;
  energy: number | null;
  moodScore: number | null;
  soreness: number | null;
  stress: number | null;
  hydration: number | null;
  gassiness: number | null;
  mood: string | null;
  pain: string | null;
  symptoms: string | null;
  weightLb: number | null;
  notes: string | null;
};

type HealthCommitmentEntry = {
  id: number;
  type: "commitment";
  title: string;
  description: string | null;
  cadence: string;
  targetCount: number | null;
  completedCount: number;
  reviewDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type HealthEntry = HealthMealEntry | HealthWorkoutEntry | HealthBodyEntry | HealthCommitmentEntry;

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
const geminiHealthModel = process.env.GEMINI_HEALTH_MODEL ?? "gemini-2.5-flash-lite";
const healthDbPath = path.resolve(process.env.VISHAL_AI_DB_PATH ?? path.join(process.cwd(), "data/vishal-ai.db"));
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
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-credentials": "true",
  "access-control-allow-origin": process.env.CORS_ORIGIN ?? "http://127.0.0.1:5173",
};

mkdirSync(path.dirname(healthDbPath), { recursive: true });
const healthDb = new DatabaseSync(healthDbPath);
migrateHealthDatabase();

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

function migrateHealthDatabase() {
  healthDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS health_commitments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cadence TEXT NOT NULL DEFAULT 'weekly',
      target_count INTEGER,
      completed_count INTEGER NOT NULL DEFAULT 0,
      review_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captured_at TEXT NOT NULL,
      logged_date TEXT NOT NULL,
      source TEXT,
      summary TEXT,
      description TEXT NOT NULL,
      meal_type TEXT,
      protein_g_estimate REAL,
      calories_estimate REAL,
      hunger INTEGER,
      fullness INTEGER,
      energy INTEGER,
      digestion INTEGER,
      gassiness INTEGER,
      notes TEXT,
      raw_text TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captured_at TEXT NOT NULL,
      logged_date TEXT NOT NULL,
      source TEXT,
      summary TEXT,
      workout_type TEXT,
      focus TEXT,
      muscles TEXT,
      description TEXT NOT NULL,
      duration_minutes INTEGER,
      intensity INTEGER,
      energy_before INTEGER,
      energy_after INTEGER,
      performance INTEGER,
      notes TEXT,
      raw_text TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_body_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captured_at TEXT NOT NULL,
      logged_date TEXT NOT NULL,
      source TEXT,
      summary TEXT,
      sleep_hours REAL,
      sleep_quality INTEGER,
      energy INTEGER,
      mood_score INTEGER,
      soreness INTEGER,
      stress INTEGER,
      hydration INTEGER,
      gassiness INTEGER,
      mood TEXT,
      pain TEXT,
      symptoms TEXT,
      weight_lb REAL,
      notes TEXT,
      raw_text TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL,
      summary TEXT NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_health_meals_logged_date ON health_meals(logged_date);
    CREATE INDEX IF NOT EXISTS idx_health_workouts_logged_date ON health_workouts(logged_date);
    CREATE INDEX IF NOT EXISTS idx_health_body_logs_logged_date ON health_body_logs(logged_date);
    CREATE INDEX IF NOT EXISTS idx_health_commitments_status ON health_commitments(status);
    PRAGMA user_version = 1;
  `);

  ensureHealthColumn("health_meals", "hunger", "INTEGER");
  ensureHealthColumn("health_meals", "summary", "TEXT");
  ensureHealthColumn("health_meals", "gassiness", "INTEGER");
  ensureHealthColumn("health_workouts", "summary", "TEXT");
  ensureHealthColumn("health_workouts", "workout_type", "TEXT");
  ensureHealthColumn("health_workouts", "muscles", "TEXT");
  ensureHealthColumn("health_workouts", "performance", "INTEGER");
  ensureHealthColumn("health_body_logs", "sleep_quality", "INTEGER");
  ensureHealthColumn("health_body_logs", "summary", "TEXT");
  ensureHealthColumn("health_body_logs", "mood_score", "INTEGER");
  ensureHealthColumn("health_body_logs", "stress", "INTEGER");
  ensureHealthColumn("health_body_logs", "hydration", "INTEGER");
  ensureHealthColumn("health_body_logs", "gassiness", "INTEGER");
  ensureHealthColumn("health_body_logs", "pain", "TEXT");
  ensureHealthColumn("health_body_logs", "symptoms", "TEXT");
}

function ensureHealthColumn(table: string, column: string, definition: string) {
  const rows = healthDb.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: unknown }>;
  if (rows.some((row) => row.name === column)) return;
  healthDb.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function nowIso() {
  return new Date().toISOString();
}

function dateKeyInTimezone(value: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: timezone,
      year: "numeric",
    }).formatToParts(value);
    const part = (type: string) => parts.find((item) => item.type === type)?.value;
    const year = part("year");
    const month = part("month");
    const day = part("day");
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall through to UTC when the caller sends an unsupported timezone.
  }

  return value.toISOString().slice(0, 10);
}

function normalizeCapturedAt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return nowIso();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? nowIso() : date.toISOString();
}

function cleanOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cleanOptionalInteger(value: unknown) {
  const number = cleanOptionalNumber(value);
  return number === null ? null : Math.round(number);
}

function cleanScore(value: unknown) {
  const score = cleanOptionalInteger(value);
  if (score === null) return null;
  return Math.min(5, Math.max(1, score));
}

function cleanOptionalDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
}

function cleanHealthStatus(value: unknown) {
  return value === "paused" || value === "done" ? value : "active";
}

function cleanCadence(value: unknown) {
  const cadence = cleanOptionalText(value).toLowerCase();
  return cadence || "weekly";
}

function cleanMealType(value: unknown) {
  const mealType = cleanOptionalText(value).toLowerCase();
  if (["breakfast", "lunch", "dinner", "snack", "drink"].includes(mealType)) return mealType;
  return mealType || "";
}

function rowText(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function rowRequiredText(row: Record<string, unknown>, key: string) {
  return rowText(row, key) ?? "";
}

function rowNumber(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rowRequiredNumber(row: Record<string, unknown>, key: string) {
  return rowNumber(row, key) ?? 0;
}

function mapMeal(row: Record<string, unknown>): HealthMealEntry {
  return {
    id: rowRequiredNumber(row, "id"),
    type: "meal",
    capturedAt: rowRequiredText(row, "captured_at"),
    loggedDate: rowRequiredText(row, "logged_date"),
    source: rowText(row, "source"),
    description: rowRequiredText(row, "description"),
    summary: rowText(row, "summary"),
    mealType: rowText(row, "meal_type"),
    proteinGEstimate: rowNumber(row, "protein_g_estimate"),
    caloriesEstimate: rowNumber(row, "calories_estimate"),
    hunger: rowNumber(row, "hunger"),
    fullness: rowNumber(row, "fullness"),
    energy: rowNumber(row, "energy"),
    digestion: rowNumber(row, "digestion"),
    gassiness: rowNumber(row, "gassiness"),
    notes: rowText(row, "notes"),
    rawText: rowText(row, "raw_text"),
    createdAt: rowRequiredText(row, "created_at"),
    updatedAt: rowRequiredText(row, "updated_at"),
  };
}

function mapWorkout(row: Record<string, unknown>): HealthWorkoutEntry {
  return {
    id: rowRequiredNumber(row, "id"),
    type: "workout",
    capturedAt: rowRequiredText(row, "captured_at"),
    loggedDate: rowRequiredText(row, "logged_date"),
    source: rowText(row, "source"),
    summary: rowText(row, "summary"),
    workoutType: rowText(row, "workout_type"),
    focus: rowText(row, "focus"),
    muscles: rowText(row, "muscles"),
    description: rowRequiredText(row, "description"),
    durationMinutes: rowNumber(row, "duration_minutes"),
    intensity: rowNumber(row, "intensity"),
    energyBefore: rowNumber(row, "energy_before"),
    energyAfter: rowNumber(row, "energy_after"),
    performance: rowNumber(row, "performance"),
    notes: rowText(row, "notes"),
    rawText: rowText(row, "raw_text"),
    createdAt: rowRequiredText(row, "created_at"),
    updatedAt: rowRequiredText(row, "updated_at"),
  };
}

function mapBody(row: Record<string, unknown>): HealthBodyEntry {
  return {
    id: rowRequiredNumber(row, "id"),
    type: "body",
    capturedAt: rowRequiredText(row, "captured_at"),
    loggedDate: rowRequiredText(row, "logged_date"),
    source: rowText(row, "source"),
    summary: rowText(row, "summary"),
    sleepHours: rowNumber(row, "sleep_hours"),
    sleepQuality: rowNumber(row, "sleep_quality"),
    energy: rowNumber(row, "energy"),
    moodScore: rowNumber(row, "mood_score"),
    soreness: rowNumber(row, "soreness"),
    stress: rowNumber(row, "stress"),
    hydration: rowNumber(row, "hydration"),
    gassiness: rowNumber(row, "gassiness"),
    mood: rowText(row, "mood"),
    pain: rowText(row, "pain"),
    symptoms: rowText(row, "symptoms"),
    weightLb: rowNumber(row, "weight_lb"),
    notes: rowText(row, "notes"),
    rawText: rowText(row, "raw_text"),
    createdAt: rowRequiredText(row, "created_at"),
    updatedAt: rowRequiredText(row, "updated_at"),
  };
}

function mapCommitment(row: Record<string, unknown>): HealthCommitmentEntry {
  return {
    id: rowRequiredNumber(row, "id"),
    type: "commitment",
    title: rowRequiredText(row, "title"),
    description: rowText(row, "description"),
    cadence: rowRequiredText(row, "cadence"),
    targetCount: rowNumber(row, "target_count"),
    completedCount: rowRequiredNumber(row, "completed_count"),
    reviewDate: rowText(row, "review_date"),
    status: rowRequiredText(row, "status"),
    createdAt: rowRequiredText(row, "created_at"),
    updatedAt: rowRequiredText(row, "updated_at"),
  };
}

function normalizeHealthEntryType(value: string): HealthEntryType | null {
  if (value === "meal" || value === "workout" || value === "body" || value === "commitment") return value;
  if (value === "meals") return "meal";
  if (value === "workouts") return "workout";
  if (value === "body_logs") return "body";
  if (value === "commitments") return "commitment";
  return null;
}

function getHealthEntry(type: HealthEntryType, id: number): HealthEntry | null {
  if (type === "meal") {
    const row = healthDb.prepare("SELECT * FROM health_meals WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapMeal(row) : null;
  }
  if (type === "workout") {
    const row = healthDb.prepare("SELECT * FROM health_workouts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapWorkout(row) : null;
  }
  if (type === "body") {
    const row = healthDb.prepare("SELECT * FROM health_body_logs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapBody(row) : null;
  }
  const row = healthDb.prepare("SELECT * FROM health_commitments WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? mapCommitment(row) : null;
}

function insertHealthMeal(input: HealthMealDraft, context: { capturedAt: string; loggedDate: string; source: string; rawText: string }) {
  const timestamp = nowIso();
  const result = healthDb
    .prepare(
      `INSERT INTO health_meals (
        captured_at, logged_date, source, summary, description, meal_type, protein_g_estimate, calories_estimate,
        hunger, fullness, energy, digestion, gassiness, notes, raw_text, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      context.capturedAt,
      context.loggedDate,
      context.source,
      cleanOptionalText(input.summary) || null,
      input.description.trim(),
      cleanMealType(input.mealType) || null,
      cleanOptionalNumber(input.proteinGEstimate),
      cleanOptionalNumber(input.caloriesEstimate),
      cleanScore(input.hunger),
      cleanScore(input.fullness),
      cleanScore(input.energy),
      cleanScore(input.digestion),
      cleanScore(input.gassiness),
      cleanOptionalText(input.notes) || null,
      context.rawText,
      timestamp,
      timestamp,
    );

  return getHealthEntry("meal", Number(result.lastInsertRowid));
}

function insertHealthWorkout(input: HealthWorkoutDraft, context: { capturedAt: string; loggedDate: string; source: string; rawText: string }) {
  const timestamp = nowIso();
  const result = healthDb
    .prepare(
      `INSERT INTO health_workouts (
        captured_at, logged_date, source, summary, workout_type, focus, muscles, description, duration_minutes, intensity,
        energy_before, energy_after, performance, notes, raw_text, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      context.capturedAt,
      context.loggedDate,
      context.source,
      cleanOptionalText(input.summary) || null,
      cleanOptionalText(input.workoutType) || null,
      cleanOptionalText(input.focus) || null,
      cleanOptionalText(input.muscles) || null,
      input.description.trim(),
      cleanOptionalInteger(input.durationMinutes),
      cleanScore(input.intensity),
      cleanScore(input.energyBefore),
      cleanScore(input.energyAfter),
      cleanScore(input.performance),
      cleanOptionalText(input.notes) || null,
      context.rawText,
      timestamp,
      timestamp,
    );

  return getHealthEntry("workout", Number(result.lastInsertRowid));
}

function insertHealthBody(input: HealthBodyDraft, context: { capturedAt: string; loggedDate: string; source: string; rawText: string }) {
  const timestamp = nowIso();
  const result = healthDb
    .prepare(
      `INSERT INTO health_body_logs (
        captured_at, logged_date, source, summary, sleep_hours, sleep_quality, energy, mood_score, soreness, stress,
        hydration, gassiness, mood, pain, symptoms, weight_lb, notes, raw_text, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      context.capturedAt,
      context.loggedDate,
      context.source,
      cleanOptionalText(input.summary) || null,
      cleanOptionalNumber(input.sleepHours),
      cleanScore(input.sleepQuality),
      cleanScore(input.energy),
      cleanScore(input.moodScore),
      cleanScore(input.soreness),
      cleanScore(input.stress),
      cleanScore(input.hydration),
      cleanScore(input.gassiness),
      cleanOptionalText(input.mood) || null,
      cleanOptionalText(input.pain) || null,
      cleanOptionalText(input.symptoms) || null,
      cleanOptionalNumber(input.weightLb),
      cleanOptionalText(input.notes) || null,
      context.rawText,
      timestamp,
      timestamp,
    );

  return getHealthEntry("body", Number(result.lastInsertRowid));
}

function insertHealthCommitment(input: HealthCommitmentDraft) {
  const title = cleanOptionalText(input.title);
  if (!title) {
    throw Object.assign(new Error("Commitment title cannot be empty"), { statusCode: 400 });
  }

  const timestamp = nowIso();
  const result = healthDb
    .prepare(
      `INSERT INTO health_commitments (
        title, description, cadence, target_count, completed_count, review_date, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      title,
      cleanOptionalText(input.description),
      cleanCadence(input.cadence),
      cleanOptionalInteger(input.targetCount),
      cleanOptionalInteger(input.completedCount) ?? 0,
      cleanOptionalDate(input.reviewDate) || null,
      cleanHealthStatus(input.status),
      timestamp,
      timestamp,
    );

  return getHealthEntry("commitment", Number(result.lastInsertRowid));
}

function deleteHealthEntry(type: HealthEntryType, id: number) {
  const table = {
    body: "health_body_logs",
    commitment: "health_commitments",
    meal: "health_meals",
    workout: "health_workouts",
  }[type];

  const result = healthDb.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  return result.changes > 0;
}

function updateHealthCommitment(id: number, input: Record<string, unknown>) {
  const existing = getHealthEntry("commitment", id);
  if (!existing || existing.type !== "commitment") return null;

  const timestamp = nowIso();
  healthDb
    .prepare(
      `UPDATE health_commitments
       SET title = ?, description = ?, cadence = ?, target_count = ?, completed_count = ?, review_date = ?, status = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      cleanOptionalText(input.title) || existing.title,
      "description" in input ? cleanOptionalText(input.description) : (existing.description ?? ""),
      "cadence" in input ? cleanCadence(input.cadence) : existing.cadence,
      "targetCount" in input ? cleanOptionalInteger(input.targetCount) : existing.targetCount,
      "completedCount" in input ? (cleanOptionalInteger(input.completedCount) ?? 0) : existing.completedCount,
      "reviewDate" in input ? (cleanOptionalDate(input.reviewDate) || null) : existing.reviewDate,
      "status" in input ? cleanHealthStatus(input.status) : existing.status,
      timestamp,
      id,
    );

  return getHealthEntry("commitment", id);
}

function updateHealthLogEntry(type: Exclude<HealthEntryType, "commitment">, id: number, input: Record<string, unknown>, timezone: string) {
  const existing = getHealthEntry(type, id);
  if (!existing || existing.type === "commitment") return null;

  const nextType = typeof input.type === "string" ? normalizeHealthEntryType(input.type) : type;
  if (nextType && nextType !== type && nextType !== "commitment") {
    const capturedAt = normalizeCapturedAt(input.capturedAt ?? existing.capturedAt);
    const loggedDate = dateKeyInTimezone(new Date(capturedAt), timezone);
    const context = {
      capturedAt,
      loggedDate,
      source: "source" in input ? cleanOptionalText(input.source) : (existing.source ?? "console"),
      rawText: existing.rawText ?? "",
    };
    let moved: HealthEntry | null = null;
    if (nextType === "meal") {
      moved = insertHealthMeal({ description: cleanOptionalText(input.description) || "Health entry" }, context);
    } else if (nextType === "workout") {
      moved = insertHealthWorkout({ description: cleanOptionalText(input.description) || "Health entry" }, context);
    } else if (nextType === "body") {
      moved = insertHealthBody({ notes: cleanOptionalText(input.description) || cleanOptionalText(input.notes) || "Health entry" }, context);
    }
    if (moved) deleteHealthEntry(type, id);
    return moved;
  }

  const capturedAt = normalizeCapturedAt(input.capturedAt ?? existing.capturedAt);
  const loggedDate =
    typeof input.loggedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.loggedDate) ? input.loggedDate : dateKeyInTimezone(new Date(capturedAt), timezone);
  const timestamp = nowIso();

  if (type === "meal") {
    const meal = existing as HealthMealEntry;
    healthDb
      .prepare(
        `UPDATE health_meals
         SET captured_at = ?, logged_date = ?, summary = ?, description = ?, meal_type = ?, protein_g_estimate = ?, calories_estimate = ?,
             hunger = ?, fullness = ?, energy = ?, digestion = ?, gassiness = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        capturedAt,
        loggedDate,
        "summary" in input ? (cleanOptionalText(input.summary) || null) : meal.summary,
        cleanOptionalText(input.description) || meal.description,
        "mealType" in input ? (cleanMealType(input.mealType) || null) : meal.mealType,
        "proteinGEstimate" in input ? cleanOptionalNumber(input.proteinGEstimate) : meal.proteinGEstimate,
        "caloriesEstimate" in input ? cleanOptionalNumber(input.caloriesEstimate) : meal.caloriesEstimate,
        "hunger" in input ? cleanScore(input.hunger) : meal.hunger,
        "fullness" in input ? cleanScore(input.fullness) : meal.fullness,
        "energy" in input ? cleanScore(input.energy) : meal.energy,
        "digestion" in input ? cleanScore(input.digestion) : meal.digestion,
        "gassiness" in input ? cleanScore(input.gassiness) : meal.gassiness,
        "notes" in input ? (cleanOptionalText(input.notes) || null) : meal.notes,
        timestamp,
        id,
      );
  }

  if (type === "workout") {
    const workout = existing as HealthWorkoutEntry;
    healthDb
      .prepare(
        `UPDATE health_workouts
         SET captured_at = ?, logged_date = ?, summary = ?, workout_type = ?, focus = ?, muscles = ?, description = ?, duration_minutes = ?, intensity = ?,
             energy_before = ?, energy_after = ?, performance = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        capturedAt,
        loggedDate,
        "summary" in input ? (cleanOptionalText(input.summary) || null) : workout.summary,
        "workoutType" in input ? (cleanOptionalText(input.workoutType) || null) : workout.workoutType,
        "focus" in input ? (cleanOptionalText(input.focus) || null) : workout.focus,
        "muscles" in input ? (cleanOptionalText(input.muscles) || null) : workout.muscles,
        cleanOptionalText(input.description) || workout.description,
        "durationMinutes" in input ? cleanOptionalInteger(input.durationMinutes) : workout.durationMinutes,
        "intensity" in input ? cleanScore(input.intensity) : workout.intensity,
        "energyBefore" in input ? cleanScore(input.energyBefore) : workout.energyBefore,
        "energyAfter" in input ? cleanScore(input.energyAfter) : workout.energyAfter,
        "performance" in input ? cleanScore(input.performance) : workout.performance,
        "notes" in input ? (cleanOptionalText(input.notes) || null) : workout.notes,
        timestamp,
        id,
      );
  }

  if (type === "body") {
    const body = existing as HealthBodyEntry;
    healthDb
      .prepare(
        `UPDATE health_body_logs
         SET captured_at = ?, logged_date = ?, summary = ?, sleep_hours = ?, sleep_quality = ?, energy = ?, mood_score = ?, soreness = ?,
             stress = ?, hydration = ?, gassiness = ?, mood = ?, pain = ?, symptoms = ?, weight_lb = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        capturedAt,
        loggedDate,
        "summary" in input ? (cleanOptionalText(input.summary) || null) : body.summary,
        "sleepHours" in input ? cleanOptionalNumber(input.sleepHours) : body.sleepHours,
        "sleepQuality" in input ? cleanScore(input.sleepQuality) : body.sleepQuality,
        "energy" in input ? cleanScore(input.energy) : body.energy,
        "moodScore" in input ? cleanScore(input.moodScore) : body.moodScore,
        "soreness" in input ? cleanScore(input.soreness) : body.soreness,
        "stress" in input ? cleanScore(input.stress) : body.stress,
        "hydration" in input ? cleanScore(input.hydration) : body.hydration,
        "gassiness" in input ? cleanScore(input.gassiness) : body.gassiness,
        "mood" in input ? (cleanOptionalText(input.mood) || null) : body.mood,
        "pain" in input ? (cleanOptionalText(input.pain) || null) : body.pain,
        "symptoms" in input ? (cleanOptionalText(input.symptoms) || null) : body.symptoms,
        "weightLb" in input ? cleanOptionalNumber(input.weightLb) : body.weightLb,
        "notes" in input ? (cleanOptionalText(input.notes) || null) : body.notes,
        timestamp,
        id,
      );
  }

  return getHealthEntry(type, id);
}

function listRecentHealthEntries(limit = 20) {
  const mealRows = healthDb.prepare("SELECT * FROM health_meals ORDER BY captured_at DESC, id DESC LIMIT ?").all(limit) as Record<string, unknown>[];
  const workoutRows = healthDb.prepare("SELECT * FROM health_workouts ORDER BY captured_at DESC, id DESC LIMIT ?").all(limit) as Record<string, unknown>[];
  const bodyRows = healthDb.prepare("SELECT * FROM health_body_logs ORDER BY captured_at DESC, id DESC LIMIT ?").all(limit) as Record<string, unknown>[];
  const commitmentRows = healthDb.prepare("SELECT * FROM health_commitments ORDER BY created_at DESC, id DESC LIMIT ?").all(limit) as Record<string, unknown>[];

  return [...mealRows.map(mapMeal), ...workoutRows.map(mapWorkout), ...bodyRows.map(mapBody), ...commitmentRows.map(mapCommitment)]
    .sort((a, b) => {
      const left = "capturedAt" in a ? a.capturedAt : a.createdAt;
      const right = "capturedAt" in b ? b.capturedAt : b.createdAt;
      return right.localeCompare(left);
    })
    .slice(0, limit);
}

function listHealthCommitments() {
  const rows = healthDb.prepare("SELECT * FROM health_commitments ORDER BY status ASC, review_date IS NULL, review_date ASC, created_at DESC").all() as Record<
    string,
    unknown
  >[];
  return rows.map(mapCommitment);
}

function getWeekStartDateKey(now: Date, timezone: string) {
  const todayKey = dateKeyInTimezone(now, timezone);
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  const day = today.getUTCDay();
  today.setUTCDate(today.getUTCDate() - day);
  return today.toISOString().slice(0, 10);
}

function average(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function buildHealthObservations(timezone: string) {
  const todayKey = dateKeyInTimezone(new Date(), timezone);
  const start = new Date(`${todayKey}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  const startKey = start.toISOString().slice(0, 10);
  const mealCount = rowRequiredNumber(
    healthDb.prepare("SELECT COUNT(*) AS count FROM health_meals WHERE logged_date >= ?").get(startKey) as Record<string, unknown>,
    "count",
  );
  const workoutCount = rowRequiredNumber(
    healthDb.prepare("SELECT COUNT(*) AS count FROM health_workouts WHERE logged_date >= ?").get(startKey) as Record<string, unknown>,
    "count",
  );
  const bodyRows = healthDb.prepare("SELECT sleep_hours, sleep_quality, energy, mood_score, soreness, stress, hydration, gassiness, logged_date FROM health_body_logs WHERE logged_date >= ?").all(startKey) as Record<
    string,
    unknown
  >[];
  const avgSleep = average(bodyRows.map((row) => rowNumber(row, "sleep_hours")));
  const avgEnergy = average(bodyRows.map((row) => rowNumber(row, "energy")));
  const avgMood = average(bodyRows.map((row) => rowNumber(row, "mood_score")));
  const avgSoreness = average(bodyRows.map((row) => rowNumber(row, "soreness")));
  const avgStress = average(bodyRows.map((row) => rowNumber(row, "stress")));
  const avgGassiness = average(bodyRows.map((row) => rowNumber(row, "gassiness")));
  const observations = [`Last 7 days: ${mealCount} meal logs, ${workoutCount} workout logs, ${bodyRows.length} body check-ins.`];

  if (avgSleep !== null) observations.push(`Average logged sleep is ${avgSleep.toFixed(1)} hours.`);
  if (avgEnergy !== null) observations.push(`Average logged energy is ${avgEnergy.toFixed(1)}/5.`);
  if (avgMood !== null || avgStress !== null || avgSoreness !== null || avgGassiness !== null) {
    observations.push(
      [
        avgMood === null ? null : `mood ${avgMood.toFixed(1)}/5`,
        avgStress === null ? null : `stress ${avgStress.toFixed(1)}/5`,
        avgSoreness === null ? null : `soreness ${avgSoreness.toFixed(1)}/5`,
        avgGassiness === null ? null : `gassiness ${avgGassiness.toFixed(1)}/5`,
      ]
        .filter(Boolean)
        .join(", "),
    );
  }

  const workoutDates = new Set(
    (healthDb.prepare("SELECT DISTINCT logged_date FROM health_workouts WHERE logged_date >= ?").all(startKey) as Record<string, unknown>[])
      .map((row) => rowText(row, "logged_date"))
      .filter(Boolean),
  );
  const bodyOnWorkoutDays = bodyRows.filter((row) => workoutDates.has(rowRequiredText(row, "logged_date")));
  const restedWorkoutEnergy = average(bodyOnWorkoutDays.filter((row) => (rowNumber(row, "sleep_hours") ?? 0) >= 7).map((row) => rowNumber(row, "energy")));
  const otherWorkoutEnergy = average(bodyOnWorkoutDays.filter((row) => (rowNumber(row, "sleep_hours") ?? 0) < 7).map((row) => rowNumber(row, "energy")));
  if (restedWorkoutEnergy !== null && otherWorkoutEnergy !== null) {
    observations.push(`Workout days with 7h+ sleep averaged ${restedWorkoutEnergy.toFixed(1)}/5 energy versus ${otherWorkoutEnergy.toFixed(1)}/5 otherwise.`);
  }

  return observations;
}

function getHealthOverview(timezone: string) {
  const today = dateKeyInTimezone(new Date(), timezone);
  const meals = healthDb.prepare("SELECT * FROM health_meals WHERE logged_date = ? ORDER BY captured_at DESC, id DESC").all(today) as Record<string, unknown>[];
  const workouts = healthDb.prepare("SELECT * FROM health_workouts WHERE logged_date = ? ORDER BY captured_at DESC, id DESC").all(today) as Record<
    string,
    unknown
  >[];
  const bodyLogs = healthDb.prepare("SELECT * FROM health_body_logs WHERE logged_date = ? ORDER BY captured_at DESC, id DESC").all(today) as Record<
    string,
    unknown
  >[];
  const commitments = listHealthCommitments();
  const activeCommitments = commitments.filter((commitment) => commitment.status === "active");
  const dueCommitments = activeCommitments.filter((commitment) => commitment.reviewDate !== null && commitment.reviewDate <= today);
  const mealEntries = meals.map(mapMeal);
  const workoutEntries = workouts.map(mapWorkout);
  const bodyEntries = bodyLogs.map(mapBody);
  const latestBody = bodyEntries[0] ?? null;

  return {
    generatedAt: nowIso(),
    today: {
      date: today,
      meals: {
        count: mealEntries.length,
        proteinGEstimate: average(mealEntries.map((entry) => entry.proteinGEstimate === null ? null : entry.proteinGEstimate)) === null
          ? null
          : mealEntries.reduce((sum, entry) => sum + (entry.proteinGEstimate ?? 0), 0),
        caloriesEstimate: average(mealEntries.map((entry) => entry.caloriesEstimate === null ? null : entry.caloriesEstimate)) === null
          ? null
          : mealEntries.reduce((sum, entry) => sum + (entry.caloriesEstimate ?? 0), 0),
        lastDescription: mealEntries[0]?.description ?? null,
      },
      workouts: {
        count: workoutEntries.length,
        durationMinutes: workoutEntries.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0) || null,
        averageIntensity: average(workoutEntries.map((entry) => entry.intensity)),
        lastDescription: workoutEntries[0]?.description ?? null,
      },
      body: {
        count: bodyEntries.length,
        sleepHours: latestBody?.sleepHours ?? null,
        sleepQuality: latestBody?.sleepQuality ?? null,
        energy: latestBody?.energy ?? null,
        moodScore: latestBody?.moodScore ?? null,
        soreness: latestBody?.soreness ?? null,
        stress: latestBody?.stress ?? null,
        hydration: latestBody?.hydration ?? null,
        gassiness: latestBody?.gassiness ?? null,
        mood: latestBody?.mood ?? null,
        pain: latestBody?.pain ?? null,
        symptoms: latestBody?.symptoms ?? null,
      },
      commitments: {
        activeCount: activeCommitments.length,
        dueCount: dueCommitments.length,
        next: activeCommitments[0] ?? null,
      },
    },
    insights: buildHealthObservations(timezone),
    commitments: activeCommitments.slice(0, 6),
    recent: listRecentHealthEntries(8),
  };
}

function buildHealthIntakePrompt(input: { text: string; source: string; timezone: string }) {
  return [
    "You are the health intake parser for Vishal.ai, a private personal operating system.",
    "Turn messy voice or text updates into loose health logs. Return only JSON that matches the schema.",
    "",
    "Routes:",
    "- meal: food, drinks, snacks, appetite, digestion around eating.",
    "- workout: lifting, cardio, sports, mobility, training, effort, muscles trained.",
    "- body: sleep, sleep quality, energy, mood, stress, soreness, hydration, gassiness, pain, symptoms without diagnosis.",
    "- commitment: weekly consistency choices or promises.",
    "- mixed: more than one category appears.",
    "",
    "Rules:",
    "- Keep descriptions faithful and concise.",
    "- summary: one short neutral summary for each entry when useful.",
    "- notes: side context, caveats, possible relationships stated by the user, and details that should not be lost.",
    "- Preserve user-stated relationships without diagnosing them; e.g. knee tightness because hips felt tight.",
    "- Estimates are optional and should be null or omitted when uncertain.",
    "- Scores are 1-5 where 1 is low and 5 is high.",
    "- Do not moralize food, diagnose, prescribe treatment, or use rigid diet language.",
    "- If a category is absent, return an empty array for it.",
    "- confirmation should be one short human-readable sentence.",
    "",
    `Current server timestamp: ${new Date().toISOString()}`,
    `User timezone: ${input.timezone}`,
    `Capture source: ${input.source}`,
    "",
    "Captured text:",
    input.text,
  ].join("\n");
}

function stripJsonFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeHealthDrafts(parsed: Record<string, unknown>): ParsedHealthIntake {
  const route = typeof parsed.route === "string" && ["meal", "workout", "body", "commitment", "mixed"].includes(parsed.route)
    ? (parsed.route as HealthRouteType)
    : "mixed";

  const meals = Array.isArray(parsed.meals)
    ? parsed.meals
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && typeof item.description === "string" && item.description.trim().length > 0)
        .map((item) => ({
          caloriesEstimate: cleanOptionalNumber(item.caloriesEstimate),
          description: cleanOptionalText(item.description),
          digestion: cleanScore(item.digestion),
          energy: cleanScore(item.energy),
          fullness: cleanScore(item.fullness),
          gassiness: cleanScore(item.gassiness),
          hunger: cleanScore(item.hunger),
          mealType: cleanMealType(item.mealType),
          notes: cleanOptionalText(item.notes),
          proteinGEstimate: cleanOptionalNumber(item.proteinGEstimate),
          summary: cleanOptionalText(item.summary),
        }))
    : [];

  const workouts = Array.isArray(parsed.workouts)
    ? parsed.workouts
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && typeof item.description === "string" && item.description.trim().length > 0)
        .map((item) => ({
          description: cleanOptionalText(item.description),
          durationMinutes: cleanOptionalInteger(item.durationMinutes),
          energyAfter: cleanScore(item.energyAfter),
          energyBefore: cleanScore(item.energyBefore),
          focus: cleanOptionalText(item.focus),
          intensity: cleanScore(item.intensity),
          muscles: cleanOptionalText(item.muscles),
          notes: cleanOptionalText(item.notes),
          performance: cleanScore(item.performance),
          summary: cleanOptionalText(item.summary),
          workoutType: cleanOptionalText(item.workoutType),
        }))
    : [];

  const bodyLogs = Array.isArray(parsed.bodyLogs)
    ? parsed.bodyLogs
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .map((item) => ({
          energy: cleanScore(item.energy),
          gassiness: cleanScore(item.gassiness),
          hydration: cleanScore(item.hydration),
          mood: cleanOptionalText(item.mood),
          moodScore: cleanScore(item.moodScore),
          notes: cleanOptionalText(item.notes),
          pain: cleanOptionalText(item.pain),
          sleepHours: cleanOptionalNumber(item.sleepHours),
          sleepQuality: cleanScore(item.sleepQuality),
          soreness: cleanScore(item.soreness),
          stress: cleanScore(item.stress),
          symptoms: cleanOptionalText(item.symptoms),
          summary: cleanOptionalText(item.summary),
          weightLb: cleanOptionalNumber(item.weightLb),
        }))
        .filter(
          (item) =>
            item.sleepHours !== null ||
            item.sleepQuality !== null ||
            item.energy !== null ||
            item.moodScore !== null ||
            item.soreness !== null ||
            item.stress !== null ||
            item.hydration !== null ||
            item.gassiness !== null ||
            item.mood ||
            item.pain ||
            item.symptoms ||
            item.weightLb !== null ||
            item.notes,
        )
    : [];

  const commitments = Array.isArray(parsed.commitments)
    ? parsed.commitments
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && typeof item.title === "string" && item.title.trim().length > 0)
        .map((item) => ({
          cadence: cleanCadence(item.cadence),
          completedCount: cleanOptionalInteger(item.completedCount),
          description: cleanOptionalText(item.description),
          reviewDate: cleanOptionalDate(item.reviewDate),
          status: cleanHealthStatus(item.status),
          targetCount: cleanOptionalInteger(item.targetCount),
          title: cleanOptionalText(item.title),
        }))
    : [];

  if (!meals.length && !workouts.length && !bodyLogs.length && !commitments.length) {
    throw Object.assign(new Error("Gemini returned no health entries"), { statusCode: 502 });
  }

  const confirmation = cleanOptionalText(parsed.confirmation) || "Health update captured.";
  return { route, confirmation, meals, workouts, bodyLogs, commitments };
}

function parseGeminiHealth(text: string): ParsedHealthIntake {
  const parsed = JSON.parse(stripJsonFence(text)) as Record<string, unknown>;
  return normalizeHealthDrafts(parsed);
}

async function parseHealthWithGemini(input: { text: string; source: string; timezone: string }) {
  if (!geminiApiKey.trim()) {
    throw Object.assign(new Error("GEMINI_API_KEY is not configured"), { statusCode: 503 });
  }

  const apiUrl = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${geminiHealthModel}:generateContent`);
  apiUrl.searchParams.set("key", geminiApiKey);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: buildHealthIntakePrompt(input) }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            route: { type: "STRING", enum: ["meal", "workout", "body", "commitment", "mixed"] },
            confirmation: { type: "STRING" },
            meals: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  summary: { type: "STRING" },
                  description: { type: "STRING" },
                  mealType: { type: "STRING" },
                  proteinGEstimate: { type: "NUMBER" },
                  caloriesEstimate: { type: "NUMBER" },
                  hunger: { type: "INTEGER" },
                  fullness: { type: "INTEGER" },
                  energy: { type: "INTEGER" },
                  digestion: { type: "INTEGER" },
                  gassiness: { type: "INTEGER" },
                  notes: { type: "STRING" },
                },
                required: ["description"],
              },
            },
            workouts: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  summary: { type: "STRING" },
                  workoutType: { type: "STRING" },
                  focus: { type: "STRING" },
                  muscles: { type: "STRING" },
                  description: { type: "STRING" },
                  durationMinutes: { type: "INTEGER" },
                  intensity: { type: "INTEGER" },
                  energyBefore: { type: "INTEGER" },
                  energyAfter: { type: "INTEGER" },
                  performance: { type: "INTEGER" },
                  notes: { type: "STRING" },
                },
                required: ["description"],
              },
            },
            bodyLogs: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  summary: { type: "STRING" },
                  sleepHours: { type: "NUMBER" },
                  sleepQuality: { type: "INTEGER" },
                  energy: { type: "INTEGER" },
                  moodScore: { type: "INTEGER" },
                  soreness: { type: "INTEGER" },
                  stress: { type: "INTEGER" },
                  hydration: { type: "INTEGER" },
                  gassiness: { type: "INTEGER" },
                  mood: { type: "STRING" },
                  pain: { type: "STRING" },
                  symptoms: { type: "STRING" },
                  weightLb: { type: "NUMBER" },
                  notes: { type: "STRING" },
                },
              },
            },
            commitments: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  title: { type: "STRING" },
                  description: { type: "STRING" },
                  cadence: { type: "STRING" },
                  targetCount: { type: "INTEGER" },
                  completedCount: { type: "INTEGER" },
                  reviewDate: { type: "STRING" },
                  status: { type: "STRING", enum: ["active", "paused", "done"] },
                },
                required: ["title"],
              },
            },
          },
          required: ["route", "confirmation", "meals", "workouts", "bodyLogs", "commitments"],
        },
      },
    }),
  });

  const payload = (await response.json()) as GeminiJsonResponse;
  if (!response.ok) {
    throw Object.assign(new Error(payload.error?.message ?? `Gemini health parser returned ${response.status}`), { statusCode: 502 });
  }

  const text = payload.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  if (!text) {
    throw Object.assign(new Error("Gemini returned no health JSON"), { statusCode: 502 });
  }

  return parseGeminiHealth(text);
}

function writeParsedHealthIntake(parsed: ParsedHealthIntake, context: { capturedAt: string; loggedDate: string; source: string; rawText: string }) {
  const created: HealthEntry[] = [];
  for (const meal of parsed.meals) {
    const entry = insertHealthMeal(meal, context);
    if (entry) created.push(entry);
  }
  for (const workout of parsed.workouts) {
    const entry = insertHealthWorkout(workout, context);
    if (entry) created.push(entry);
  }
  for (const bodyLog of parsed.bodyLogs) {
    const entry = insertHealthBody(bodyLog, context);
    if (entry) created.push(entry);
  }
  for (const commitment of parsed.commitments) {
    const entry = insertHealthCommitment(commitment);
    if (entry) created.push(entry);
  }
  return created;
}

async function intakeHealth(req: IncomingMessage, res: ServerResponse, options: { requireBearerToken: boolean }) {
  if (options.requireBearerToken && !hasValidIntakeToken(req)) {
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
    sendJson(res, 400, { error: "Health intake text cannot be empty" });
    return;
  }

  const source = cleanOptionalText((body as { source?: unknown }).source) || (options.requireBearerToken ? "voice" : "console");
  const timezone = cleanOptionalText((body as { timezone?: unknown }).timezone) || "America/New_York";
  const capturedAt = normalizeCapturedAt((body as { capturedAt?: unknown }).capturedAt);
  const loggedDate = dateKeyInTimezone(new Date(capturedAt), timezone);
  const parsed = await parseHealthWithGemini({ text, source, timezone });
  const entries = writeParsedHealthIntake(parsed, { capturedAt, loggedDate, source, rawText: text });

  sendJson(res, 201, {
    confirmation: parsed.confirmation,
    entries,
    route: parsed.route,
  });
}

async function routeHealthApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const timezone = url.searchParams.get("timezone") ?? "America/New_York";

  if (url.pathname === "/api/health/overview" && req.method === "GET") {
    sendJson(res, 200, getHealthOverview(timezone));
    return true;
  }

  if (url.pathname === "/api/health/recent" && req.method === "GET") {
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
    sendJson(res, 200, { entries: listRecentHealthEntries(limit) });
    return true;
  }

  if (url.pathname === "/api/health/commitments" && req.method === "GET") {
    sendJson(res, 200, { commitments: listHealthCommitments() });
    return true;
  }

  if (url.pathname === "/api/health/commitments" && req.method === "POST") {
    const body = await readJsonBody(req);
    if (typeof body !== "object" || body === null) {
      sendJson(res, 400, { error: "Expected JSON body" });
      return true;
    }
    const commitment = insertHealthCommitment(body as HealthCommitmentDraft);
    sendJson(res, 201, { commitment });
    return true;
  }

  const commitmentMatch = url.pathname.match(/^\/api\/health\/commitments\/(\d+)$/);
  if (commitmentMatch && req.method === "PUT") {
    const body = await readJsonBody(req);
    if (typeof body !== "object" || body === null) {
      sendJson(res, 400, { error: "Expected JSON body" });
      return true;
    }
    const commitment = updateHealthCommitment(Number(commitmentMatch[1]), body as Record<string, unknown>);
    if (!commitment) {
      sendJson(res, 404, { error: "Commitment not found" });
      return true;
    }
    sendJson(res, 200, { commitment });
    return true;
  }

  const entryMatch = url.pathname.match(/^\/api\/health\/entries\/([^/]+)\/(\d+)$/);
  if (entryMatch && req.method === "PUT") {
    const type = normalizeHealthEntryType(entryMatch[1]);
    if (!type) {
      sendJson(res, 400, { error: "Unsupported health entry type" });
      return true;
    }
    const body = await readJsonBody(req);
    if (typeof body !== "object" || body === null) {
      sendJson(res, 400, { error: "Expected JSON body" });
      return true;
    }
    const id = Number(entryMatch[2]);
    const entry = type === "commitment" ? updateHealthCommitment(id, body as Record<string, unknown>) : updateHealthLogEntry(type, id, body as Record<string, unknown>, timezone);
    if (!entry) {
      sendJson(res, 404, { error: "Health entry not found" });
      return true;
    }
    sendJson(res, 200, { entry });
    return true;
  }

  if (entryMatch && req.method === "DELETE") {
    const type = normalizeHealthEntryType(entryMatch[1]);
    if (!type) {
      sendJson(res, 400, { error: "Unsupported health entry type" });
      return true;
    }
    const deleted = deleteHealthEntry(type, Number(entryMatch[2]));
    if (!deleted) {
      sendJson(res, 404, { error: "Health entry not found" });
      return true;
    }
    sendJson(res, 200, { deleted: true });
    return true;
  }

  return false;
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

  if (url.pathname === "/api/intake/health" && req.method === "POST") {
    await intakeHealth(req, res, { requireBearerToken: true });
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

  if (url.pathname === "/api/health/capture" && req.method === "POST") {
    await intakeHealth(req, res, { requireBearerToken: false });
    return;
  }

  if (url.pathname.startsWith("/api/health/") && (await routeHealthApi(req, res, url))) {
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
  console.log(`health db: ${healthDbPath}`);
});
