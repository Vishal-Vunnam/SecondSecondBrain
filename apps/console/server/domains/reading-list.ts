import type { IncomingMessage, ServerResponse } from "node:http";
import { db } from "../core/db.js";
import { readJsonBody, sendJson } from "../core/http.js";

type ReadingStatus = "queued" | "reading" | "done";
type ReadingPriority = "next" | "soon" | "someday";

type ReadingRow = {
  id: number;
  title: string;
  url: string | null;
  note: string | null;
  category: string | null;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeStatus(value: unknown): ReadingStatus {
  return value === "reading" || value === "done" ? value : "queued";
}

function normalizePriority(value: unknown): ReadingPriority {
  return value === "next" || value === "someday" ? value : "soon";
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeUrl(value: unknown): string | null {
  const trimmed = normalizeText(value);
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function readingRowToItem(row: ReadingRow) {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    note: row.note,
    category: row.category,
    priority: normalizePriority(row.priority),
    status: normalizeStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listReadingItems(res: ServerResponse) {
  const rows = db
    .prepare(
      `SELECT id, title, url, note, category, priority, status, created_at, updated_at
       FROM reading_list_items
       ORDER BY
         CASE status WHEN 'reading' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
         CASE priority WHEN 'next' THEN 0 WHEN 'soon' THEN 1 ELSE 2 END,
         datetime(updated_at) DESC`,
    )
    .all() as ReadingRow[];
  sendJson(res, 200, { items: rows.map(readingRowToItem) });
}

function listReadingCategories(res: ServerResponse) {
  const rows = db
    .prepare(`SELECT DISTINCT category FROM reading_list_items WHERE category IS NOT NULL AND category != '' ORDER BY category ASC`)
    .all() as { category: string }[];
  sendJson(res, 200, { categories: rows.map((row) => row.category) });
}

async function createReadingItem(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody(req);
  if (typeof body !== "object" || body === null) {
    sendJson(res, 400, { error: "Expected JSON body" });
    return;
  }

  const rec = body as Record<string, unknown>;
  const title = normalizeText(rec.title) ?? "";
  if (!title) {
    sendJson(res, 400, { error: "title is required" });
    return;
  }

  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO reading_list_items (title, url, note, category, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      title,
      normalizeUrl(rec.url),
      normalizeText(rec.note),
      normalizeText(rec.category),
      normalizePriority(rec.priority),
      normalizeStatus(rec.status),
      now,
      now,
    );

  const row = db.prepare(`SELECT * FROM reading_list_items WHERE id = ?`).get(Number(result.lastInsertRowid)) as ReadingRow;
  sendJson(res, 200, { item: readingRowToItem(row) });
}

async function updateReadingItem(req: IncomingMessage, res: ServerResponse, id: number) {
  const body = await readJsonBody(req);
  if (typeof body !== "object" || body === null) {
    sendJson(res, 400, { error: "Expected JSON body" });
    return;
  }

  const existing = db.prepare(`SELECT * FROM reading_list_items WHERE id = ?`).get(id) as ReadingRow | undefined;
  if (!existing) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const rec = body as Record<string, unknown>;
  const title = "title" in rec ? normalizeText(rec.title) ?? existing.title : existing.title;
  const url = "url" in rec ? normalizeUrl(rec.url) : existing.url;
  const note = "note" in rec ? normalizeText(rec.note) : existing.note;
  const category = "category" in rec ? normalizeText(rec.category) : existing.category;
  const priority = "priority" in rec ? normalizePriority(rec.priority) : normalizePriority(existing.priority);
  const status = "status" in rec ? normalizeStatus(rec.status) : normalizeStatus(existing.status);
  const now = nowIso();

  db.prepare(
    `UPDATE reading_list_items
     SET title = ?, url = ?, note = ?, category = ?, priority = ?, status = ?, updated_at = ?
     WHERE id = ?`,
  ).run(title, url, note, category, priority, status, now, id);

  const row = db.prepare(`SELECT * FROM reading_list_items WHERE id = ?`).get(id) as ReadingRow;
  sendJson(res, 200, { item: readingRowToItem(row) });
}

function deleteReadingItem(res: ServerResponse, id: number) {
  db.prepare(`DELETE FROM reading_list_items WHERE id = ?`).run(id);
  sendJson(res, 200, { deleted: true });
}

export async function routeReadingList(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === "/api/reading-list" && req.method === "GET") {
    listReadingItems(res);
    return true;
  }
  if (url.pathname === "/api/reading-list" && req.method === "POST") {
    await createReadingItem(req, res);
    return true;
  }
  if (url.pathname === "/api/reading-list/categories" && req.method === "GET") {
    listReadingCategories(res);
    return true;
  }
  if (url.pathname.startsWith("/api/reading-list/") && (req.method === "PUT" || req.method === "DELETE")) {
    const id = Number(url.pathname.slice("/api/reading-list/".length));
    if (!Number.isFinite(id) || id <= 0) {
      sendJson(res, 400, { error: "Invalid id" });
      return true;
    }
    if (req.method === "PUT") await updateReadingItem(req, res, id);
    else deleteReadingItem(res, id);
    return true;
  }
  return false;
}
