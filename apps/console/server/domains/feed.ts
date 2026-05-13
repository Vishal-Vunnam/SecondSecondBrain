import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { db } from "../core/db.js";
import { readJsonBody, sendJson } from "../core/http.js";

type FeedSourceType = "rss" | "hn" | "reddit";

type FeedSourceRow = {
  id: number;
  name: string;
  type: string;
  url: string;
  weight: number;
  enabled: number;
  created_at: string;
  last_polled_at: string | null;
  last_error: string | null;
};

type FeedItemRow = {
  id: string;
  source_id: number;
  title: string;
  url: string;
  summary: string | null;
  published_at: string | null;
  fetched_at: string;
  source_name: string;
  source_type: string;
  source_weight: number;
  interaction: string | null;
};

type FeedProfileRow = {
  id: number;
  name: string;
  description: string;
  keyword_include: string;
  keyword_exclude: string;
  source_weights: string;
  enabled: number;
};

const POLL_INTERVAL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const HALF_LIFE_HOURS = 24;
const MAX_ITEMS_PER_SOURCE = 30;

function hashId(url: string) {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

function nowIso() {
  return new Date().toISOString();
}

function decodeXmlEntity(entity: string) {
  const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
  if (entity.startsWith("#x")) {
    const cp = Number.parseInt(entity.slice(2), 16);
    return Number.isFinite(cp) ? String.fromCodePoint(cp) : `&${entity};`;
  }
  if (entity.startsWith("#")) {
    const cp = Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(cp) ? String.fromCodePoint(cp) : `&${entity};`;
  }
  return named[entity] ?? `&${entity};`;
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&([^;]+);/g, (_m, entity: string) => decodeXmlEntity(entity))
    .replace(/<[^>]+>/g, "")
    .trim();
}

function getTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : null;
}

function getAtomLink(block: string) {
  const hrefMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i);
  if (hrefMatch) return hrefMatch[1];
  return getTag(block, "link");
}

function toIsoDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type ParsedItem = { title: string; url: string; summary: string | null; publishedAt: string | null };

function parseFeed(xml: string): ParsedItem[] {
  const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi), ...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)];
  const items: ParsedItem[] = [];
  for (const match of blocks) {
    const block = match[1];
    const title = getTag(block, "title");
    const url = getAtomLink(block);
    if (!title || !url) continue;
    const summary = getTag(block, "description") ?? getTag(block, "summary") ?? getTag(block, "content");
    const publishedAt = toIsoDate(getTag(block, "pubDate") ?? getTag(block, "published") ?? getTag(block, "updated"));
    items.push({ title, url, summary, publishedAt });
  }
  return items;
}

async function fetchSource(source: FeedSourceRow): Promise<ParsedItem[]> {
  const response = await fetch(source.url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "user-agent": "vishalbot-feed/1.0" },
  });
  if (!response.ok) throw new Error(`${source.name} returned ${response.status}`);
  const text = await response.text();
  return parseFeed(text).slice(0, MAX_ITEMS_PER_SOURCE);
}

function upsertItem(sourceId: number, item: ParsedItem, fetchedAt: string) {
  const id = hashId(item.url);
  db.prepare(
    `INSERT INTO feed_items (id, source_id, title, url, summary, published_at, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       summary = excluded.summary,
       published_at = COALESCE(feed_items.published_at, excluded.published_at)`,
  ).run(id, sourceId, item.title, item.url, item.summary, item.publishedAt, fetchedAt);
}

async function pollSource(source: FeedSourceRow) {
  try {
    const items = await fetchSource(source);
    const fetchedAt = nowIso();
    const tx = db.prepare("BEGIN");
    tx.run();
    try {
      for (const item of items) upsertItem(source.id, item, fetchedAt);
      db.prepare("COMMIT").run();
    } catch (error) {
      db.prepare("ROLLBACK").run();
      throw error;
    }
    db.prepare(`UPDATE feed_sources SET last_polled_at = ?, last_error = NULL WHERE id = ?`).run(fetchedAt, source.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.prepare(`UPDATE feed_sources SET last_polled_at = ?, last_error = ? WHERE id = ?`).run(nowIso(), message, source.id);
    console.warn(`feed poll failed (${source.name}):`, message);
  }
}

export async function pollAllSources() {
  const sources = db
    .prepare(`SELECT * FROM feed_sources WHERE enabled = 1`)
    .all() as FeedSourceRow[];
  await Promise.all(sources.map(pollSource));
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function parseSourceWeights(value: string): Record<string, number> {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return {};
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v)) result[k] = v;
    }
    return result;
  } catch {
    return {};
  }
}

function profileFromRow(row: FeedProfileRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    keywordInclude: parseStringArray(row.keyword_include),
    keywordExclude: parseStringArray(row.keyword_exclude),
    sourceWeights: parseSourceWeights(row.source_weights),
    enabled: row.enabled === 1,
  };
}

function getDefaultProfile() {
  const row = db.prepare(`SELECT * FROM feed_profiles WHERE enabled = 1 ORDER BY id ASC LIMIT 1`).get() as
    | FeedProfileRow
    | undefined;
  if (row) return profileFromRow(row);
  const fallback: FeedProfileRow = {
    id: 0,
    name: "Default",
    description: "",
    keyword_include: "[]",
    keyword_exclude: "[]",
    source_weights: "{}",
    enabled: 1,
  };
  return profileFromRow(fallback);
}

function scoreItem(row: FeedItemRow, profile: ReturnType<typeof profileFromRow>, now: number): number | null {
  const haystack = `${row.title} ${row.summary ?? ""}`.toLowerCase();
  for (const kw of profile.keywordExclude) {
    if (kw && haystack.includes(kw.toLowerCase())) return null;
  }
  let bonus = 0;
  for (const kw of profile.keywordInclude) {
    if (kw && haystack.includes(kw.toLowerCase())) bonus += 0.5;
  }
  const published = row.published_at ? new Date(row.published_at).getTime() : new Date(row.fetched_at).getTime();
  const ageHours = Math.max(0, (now - published) / 3_600_000);
  const recency = Math.pow(2, -ageHours / HALF_LIFE_HOURS);
  const sourceBoost = profile.sourceWeights[String(row.source_id)] ?? 1;
  return (row.source_weight * sourceBoost + bonus) * recency;
}

function listFeed(res: ServerResponse, url: URL) {
  const profileParam = url.searchParams.get("profile");
  const profile = profileParam
    ? (() => {
        const row = db
          .prepare(`SELECT * FROM feed_profiles WHERE id = ?`)
          .get(Number(profileParam)) as FeedProfileRow | undefined;
        return row ? profileFromRow(row) : getDefaultProfile();
      })()
    : getDefaultProfile();

  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit") ?? 60)));
  const rows = db
    .prepare(
      `SELECT i.id, i.source_id, i.title, i.url, i.summary, i.published_at, i.fetched_at,
              s.name AS source_name, s.type AS source_type, s.weight AS source_weight,
              (SELECT action FROM feed_interactions WHERE item_id = i.id ORDER BY at DESC LIMIT 1) AS interaction
       FROM feed_items i
       JOIN feed_sources s ON s.id = i.source_id
       WHERE s.enabled = 1
         AND COALESCE(i.published_at, i.fetched_at) >= datetime('now', '-7 days')`,
    )
    .all() as FeedItemRow[];

  const now = Date.now();
  const scored = rows
    .filter((row) => row.interaction !== "dismissed" && row.interaction !== "hidden")
    .map((row) => ({ row, score: scoreItem(row, profile, now) }))
    .filter((entry): entry is { row: FeedItemRow; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const lastPolled = db.prepare(`SELECT MAX(last_polled_at) AS last FROM feed_sources`).get() as { last: string | null };

  sendJson(res, 200, {
    profile,
    generatedAt: nowIso(),
    lastPolledAt: lastPolled?.last ?? null,
    items: scored.map(({ row, score }) => ({
      id: row.id,
      sourceId: row.source_id,
      sourceName: row.source_name,
      sourceType: row.source_type,
      title: row.title,
      url: row.url,
      summary: row.summary,
      publishedAt: row.published_at,
      fetchedAt: row.fetched_at,
      score,
      interaction: row.interaction,
    })),
  });
}

function listSources(res: ServerResponse) {
  const rows = db.prepare(`SELECT * FROM feed_sources ORDER BY id ASC`).all() as FeedSourceRow[];
  sendJson(res, 200, {
    sources: rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      url: row.url,
      weight: row.weight,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      lastPolledAt: row.last_polled_at,
      lastError: row.last_error,
    })),
  });
}

async function createSource(req: IncomingMessage, res: ServerResponse) {
  const body = (await readJsonBody(req)) as Partial<{ name: string; type: FeedSourceType; url: string; weight: number }>;
  if (!body.name || !body.url || !body.type) {
    sendJson(res, 400, { error: "name, url, and type are required" });
    return;
  }
  const weight = typeof body.weight === "number" && Number.isFinite(body.weight) ? body.weight : 1;
  try {
    const info = db
      .prepare(`INSERT INTO feed_sources (name, type, url, weight, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)`)
      .run(body.name, body.type, body.url, weight, nowIso());
    const row = db.prepare(`SELECT * FROM feed_sources WHERE id = ?`).get(info.lastInsertRowid) as FeedSourceRow;
    pollSource(row).catch(() => undefined);
    sendJson(res, 201, { source: row });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create source";
    sendJson(res, 400, { error: message });
  }
}

async function deleteSource(res: ServerResponse, id: number) {
  db.prepare(`DELETE FROM feed_sources WHERE id = ?`).run(id);
  sendJson(res, 200, { ok: true });
}

async function updateSource(req: IncomingMessage, res: ServerResponse, id: number) {
  const existing = db.prepare(`SELECT * FROM feed_sources WHERE id = ?`).get(id) as FeedSourceRow | undefined;
  if (!existing) {
    sendJson(res, 404, { error: "Source not found" });
    return;
  }
  const body = (await readJsonBody(req)) as Partial<{ name: string; weight: number; enabled: boolean }>;
  const next = {
    name: body.name ?? existing.name,
    weight:
      typeof body.weight === "number" && Number.isFinite(body.weight) ? body.weight : existing.weight,
    enabled: typeof body.enabled === "boolean" ? (body.enabled ? 1 : 0) : existing.enabled,
  };
  db.prepare(`UPDATE feed_sources SET name = ?, weight = ?, enabled = ? WHERE id = ?`).run(
    next.name,
    next.weight,
    next.enabled,
    id,
  );
  const row = db.prepare(`SELECT * FROM feed_sources WHERE id = ?`).get(id) as FeedSourceRow;
  sendJson(res, 200, { source: row });
}

function listProfiles(res: ServerResponse) {
  const rows = db.prepare(`SELECT * FROM feed_profiles ORDER BY id ASC`).all() as FeedProfileRow[];
  sendJson(res, 200, { profiles: rows.map(profileFromRow) });
}

async function updateProfile(req: IncomingMessage, res: ServerResponse, id: number) {
  const body = (await readJsonBody(req)) as Partial<{
    name: string;
    description: string;
    keywordInclude: string[];
    keywordExclude: string[];
    sourceWeights: Record<string, number>;
  }>;
  const existing = db.prepare(`SELECT * FROM feed_profiles WHERE id = ?`).get(id) as FeedProfileRow | undefined;
  if (!existing) {
    sendJson(res, 404, { error: "Profile not found" });
    return;
  }
  const next = {
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    keyword_include: JSON.stringify(body.keywordInclude ?? parseStringArray(existing.keyword_include)),
    keyword_exclude: JSON.stringify(body.keywordExclude ?? parseStringArray(existing.keyword_exclude)),
    source_weights: JSON.stringify(body.sourceWeights ?? parseSourceWeights(existing.source_weights)),
  };
  db.prepare(
    `UPDATE feed_profiles SET name = ?, description = ?, keyword_include = ?, keyword_exclude = ?, source_weights = ? WHERE id = ?`,
  ).run(next.name, next.description, next.keyword_include, next.keyword_exclude, next.source_weights, id);
  const row = db.prepare(`SELECT * FROM feed_profiles WHERE id = ?`).get(id) as FeedProfileRow;
  sendJson(res, 200, { profile: profileFromRow(row) });
}

async function recordInteraction(req: IncomingMessage, res: ServerResponse) {
  const body = (await readJsonBody(req)) as Partial<{ itemId: string; action: string; profileId: number }>;
  if (!body.itemId || !body.action) {
    sendJson(res, 400, { error: "itemId and action are required" });
    return;
  }
  const allowed = ["opened", "saved", "dismissed", "hidden"];
  if (!allowed.includes(body.action)) {
    sendJson(res, 400, { error: "invalid action" });
    return;
  }
  db.prepare(`INSERT INTO feed_interactions (item_id, profile_id, action, at) VALUES (?, ?, ?, ?)`).run(
    body.itemId,
    body.profileId ?? null,
    body.action,
    nowIso(),
  );
  sendJson(res, 200, { ok: true });
}

export async function routeFeed(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === "/api/feed" && req.method === "GET") {
    listFeed(res, url);
    return true;
  }
  if (url.pathname === "/api/feed/refresh" && req.method === "POST") {
    pollAllSources()
      .catch((error) => console.warn("feed refresh failed:", error))
      .finally(() => undefined);
    sendJson(res, 202, { ok: true });
    return true;
  }
  if (url.pathname === "/api/feed/sources" && req.method === "GET") {
    listSources(res);
    return true;
  }
  if (url.pathname === "/api/feed/sources" && req.method === "POST") {
    await createSource(req, res);
    return true;
  }
  const sourceMatch = url.pathname.match(/^\/api\/feed\/sources\/(\d+)$/);
  if (sourceMatch && req.method === "DELETE") {
    await deleteSource(res, Number(sourceMatch[1]));
    return true;
  }
  if (sourceMatch && req.method === "PUT") {
    await updateSource(req, res, Number(sourceMatch[1]));
    return true;
  }
  if (url.pathname === "/api/feed/profiles" && req.method === "GET") {
    listProfiles(res);
    return true;
  }
  const profileUpdate = url.pathname.match(/^\/api\/feed\/profiles\/(\d+)$/);
  if (profileUpdate && req.method === "PUT") {
    await updateProfile(req, res, Number(profileUpdate[1]));
    return true;
  }
  if (url.pathname === "/api/feed/interactions" && req.method === "POST") {
    await recordInteraction(req, res);
    return true;
  }
  return false;
}

function seedDefaults() {
  const profileCount = db.prepare(`SELECT COUNT(*) AS count FROM feed_profiles`).get() as { count: number };
  if (profileCount.count === 0) {
    db.prepare(
      `INSERT INTO feed_profiles (name, description, keyword_include, keyword_exclude, source_weights, enabled)
       VALUES (?, ?, '[]', '[]', '{}', 1)`,
    ).run("Default", "Headlines worth surfacing.");
  }

  const sourceCount = db.prepare(`SELECT COUNT(*) AS count FROM feed_sources`).get() as { count: number };
  if (sourceCount.count === 0) {
    const seeds: Array<{ name: string; type: FeedSourceType; url: string; weight: number }> = [
      { name: "Hacker News", type: "hn", url: "https://hnrss.org/frontpage", weight: 3 },
      { name: "BBC News", type: "rss", url: "https://feeds.bbci.co.uk/news/rss.xml", weight: 1 },
      { name: "r/LocalLLaMA", type: "reddit", url: "https://www.reddit.com/r/LocalLLaMA/.rss", weight: 2 },
    ];
    for (const seed of seeds) {
      db.prepare(
        `INSERT OR IGNORE INTO feed_sources (name, type, url, weight, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)`,
      ).run(seed.name, seed.type, seed.url, seed.weight, nowIso());
    }
  }
}

export function startFeedPoller() {
  seedDefaults();
  pollAllSources().catch((error) => console.warn("initial feed poll failed:", error));
  setInterval(() => {
    pollAllSources().catch((error) => console.warn("scheduled feed poll failed:", error));
  }, POLL_INTERVAL_MS).unref?.();
}
