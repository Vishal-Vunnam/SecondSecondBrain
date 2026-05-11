import type { IncomingMessage, ServerResponse } from "node:http";
import { db } from "../core/db.js";
import { readJsonBody, sendJson } from "../core/http.js";

type ShoppingNecessity = "essential" | "important" | "nice";

type ShoppingRow = {
  id: number;
  title: string;
  reasoning: string | null;
  type: string | null;
  necessity: string;
  got_it: number;
  link: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeNecessity(value: unknown): ShoppingNecessity {
  return value === "essential" || value === "nice" ? value : "important";
}

function shoppingRowToItem(row: ShoppingRow) {
  return {
    id: row.id,
    title: row.title,
    reasoning: row.reasoning,
    type: row.type,
    necessity: normalizeNecessity(row.necessity),
    gotIt: row.got_it === 1,
    link: row.link,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function listShoppingItems(res: ServerResponse) {
  const rows = db
    .prepare(
      `SELECT id, title, reasoning, type, necessity, got_it, link, created_at, updated_at
       FROM shopping_items
       ORDER BY got_it ASC,
                CASE necessity WHEN 'essential' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
                datetime(created_at) DESC`
    )
    .all() as ShoppingRow[];
  sendJson(res, 200, { items: rows.map(shoppingRowToItem) });
}

async function createShoppingItem(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody(req);
  if (typeof body !== "object" || body === null) {
    sendJson(res, 400, { error: "Expected JSON body" });
    return;
  }
  const rec = body as Record<string, unknown>;
  const title = typeof rec.title === "string" ? rec.title.trim() : "";
  if (!title) {
    sendJson(res, 400, { error: "title is required" });
    return;
  }
  const reasoning = typeof rec.reasoning === "string" && rec.reasoning.trim() ? rec.reasoning.trim() : null;
  const type = typeof rec.type === "string" && rec.type.trim() ? rec.type.trim() : null;
  const necessity = normalizeNecessity(rec.necessity);
  const link = normalizeLink(rec.link);
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO shopping_items (title, reasoning, type, necessity, got_it, link, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
    )
    .run(title, reasoning, type, necessity, link, now, now);
  const row = db
    .prepare(`SELECT * FROM shopping_items WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as ShoppingRow;
  sendJson(res, 200, { item: shoppingRowToItem(row) });
}

async function updateShoppingItem(req: IncomingMessage, res: ServerResponse, id: number) {
  const body = await readJsonBody(req);
  if (typeof body !== "object" || body === null) {
    sendJson(res, 400, { error: "Expected JSON body" });
    return;
  }
  const existing = db.prepare(`SELECT * FROM shopping_items WHERE id = ?`).get(id) as ShoppingRow | undefined;
  if (!existing) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  const rec = body as Record<string, unknown>;
  const title = typeof rec.title === "string" ? rec.title.trim() || existing.title : existing.title;
  const reasoning = "reasoning" in rec
    ? (typeof rec.reasoning === "string" && rec.reasoning.trim() ? rec.reasoning.trim() : null)
    : existing.reasoning;
  const type = "type" in rec
    ? (typeof rec.type === "string" && rec.type.trim() ? rec.type.trim() : null)
    : existing.type;
  const necessity = "necessity" in rec ? normalizeNecessity(rec.necessity) : normalizeNecessity(existing.necessity);
  const gotIt = "gotIt" in rec ? (rec.gotIt ? 1 : 0) : existing.got_it;
  const link = "link" in rec ? normalizeLink(rec.link) : existing.link;
  const now = new Date().toISOString();
  db
    .prepare(
      `UPDATE shopping_items
       SET title = ?, reasoning = ?, type = ?, necessity = ?, got_it = ?, link = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(title, reasoning, type, necessity, gotIt, link, now, id);
  const row = db.prepare(`SELECT * FROM shopping_items WHERE id = ?`).get(id) as ShoppingRow;
  sendJson(res, 200, { item: shoppingRowToItem(row) });
}

function deleteShoppingItem(res: ServerResponse, id: number) {
  db.prepare(`DELETE FROM shopping_items WHERE id = ?`).run(id);
  sendJson(res, 200, { deleted: true });
}

function listShoppingTypes(res: ServerResponse) {
  const rows = db
    .prepare(`SELECT DISTINCT type FROM shopping_items WHERE type IS NOT NULL AND type != '' ORDER BY type ASC`)
    .all() as { type: string }[];
  sendJson(res, 200, { types: rows.map((r) => r.type) });
}

export async function routeShopping(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === "/api/shopping" && req.method === "GET") {
    listShoppingItems(res);
    return true;
  }
  if (url.pathname === "/api/shopping" && req.method === "POST") {
    await createShoppingItem(req, res);
    return true;
  }
  if (url.pathname === "/api/shopping/types" && req.method === "GET") {
    listShoppingTypes(res);
    return true;
  }
  if (url.pathname.startsWith("/api/shopping/") && (req.method === "PUT" || req.method === "DELETE")) {
    const id = Number(url.pathname.slice("/api/shopping/".length));
    if (!Number.isFinite(id) || id <= 0) {
      sendJson(res, 400, { error: "Invalid id" });
      return true;
    }
    if (req.method === "PUT") await updateShoppingItem(req, res, id);
    else deleteShoppingItem(res, id);
    return true;
  }
  return false;
}
