import type { IncomingMessage, ServerResponse } from "node:http";
import { db } from "../core/db.js";
import { readJsonBody, sendJson } from "../core/http.js";

type WorkoutStatus = "planned" | "done" | "skipped";

type WorkoutRow = {
  id: number;
  date: string;
  name: string;
  description: string | null;
  status: string;
  planned: number;
  recurrence_id: number | null;
  created_at: string;
  updated_at: string;
};

type SetRow = {
  id: number;
  workout_id: number;
  exercise: string;
  weight: number | null;
  reps: number | null;
  position: number;
};

type RecurrenceRow = {
  id: number;
  name: string;
  description: string | null;
  days_of_week: string;
  template_sets: string;
  start_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
};

type SetInput = { exercise: string; weight: number | null; reps: number | null };

const HORIZON_DAYS = 56; // ~8 weeks ahead

function normalizeStatus(value: unknown): WorkoutStatus {
  return value === "done" || value === "skipped" ? value : "planned";
}

function parseSetsField(value: unknown): SetInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((s) => ({
      exercise: typeof s.exercise === "string" ? s.exercise.trim() : "",
      weight: typeof s.weight === "number" && Number.isFinite(s.weight) ? s.weight : null,
      reps: typeof s.reps === "number" && Number.isFinite(s.reps) ? Math.round(s.reps) : null,
    }))
    .filter((s) => s.exercise.length > 0);
}

function parseDaysOfWeek(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((d): d is number => typeof d === "number" && Number.isFinite(d))
        .map((d) => Math.round(d))
        .filter((d) => d >= 0 && d <= 6),
    ),
  ).sort((a, b) => a - b);
}

function loadSetsFor(workoutId: number): SetRow[] {
  return db
    .prepare(`SELECT id, workout_id, exercise, weight, reps, position FROM workout_sets WHERE workout_id = ? ORDER BY position ASC, id ASC`)
    .all(workoutId) as SetRow[];
}

function replaceSets(workoutId: number, sets: SetInput[]) {
  db.prepare(`DELETE FROM workout_sets WHERE workout_id = ?`).run(workoutId);
  const insert = db.prepare(
    `INSERT INTO workout_sets (workout_id, exercise, weight, reps, position) VALUES (?, ?, ?, ?, ?)`,
  );
  sets.forEach((s, i) => insert.run(workoutId, s.exercise, s.weight, s.reps, i));
}

function workoutFromRow(row: WorkoutRow, sets: SetRow[]) {
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    description: row.description,
    status: normalizeStatus(row.status),
    planned: row.planned === 1,
    recurrenceId: row.recurrence_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sets: sets.map((s) => ({
      id: s.id,
      exercise: s.exercise,
      weight: s.weight,
      reps: s.reps,
      position: s.position,
    })),
  };
}

function recurrenceFromRow(row: RecurrenceRow) {
  let daysOfWeek: number[] = [];
  let templateSets: SetInput[] = [];
  try {
    const parsed = JSON.parse(row.days_of_week);
    if (Array.isArray(parsed)) daysOfWeek = parsed.filter((d): d is number => typeof d === "number");
  } catch {}
  try {
    templateSets = parseSetsField(JSON.parse(row.template_sets));
  } catch {}
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    daysOfWeek,
    templateSets,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function todayUtc(): string {
  const now = new Date();
  const yy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function materializeRecurrence(recurrenceId: number) {
  const row = db.prepare(`SELECT * FROM workout_recurrences WHERE id = ?`).get(recurrenceId) as RecurrenceRow | undefined;
  if (!row) return;
  const rec = recurrenceFromRow(row);
  if (rec.daysOfWeek.length === 0) return;

  const today = todayUtc();
  const horizonStart = rec.startDate > today ? rec.startDate : today;
  const horizonEnd = rec.endDate && rec.endDate < addDays(horizonStart, HORIZON_DAYS) ? rec.endDate : addDays(horizonStart, HORIZON_DAYS);

  const existing = db
    .prepare(`SELECT date FROM workouts WHERE recurrence_id = ? AND date >= ?`)
    .all(recurrenceId, horizonStart) as Array<{ date: string }>;
  const existingDates = new Set(existing.map((e) => e.date));

  const now = new Date().toISOString();
  const insertWorkout = db.prepare(
    `INSERT INTO workouts (date, name, description, status, planned, recurrence_id, created_at, updated_at)
     VALUES (?, ?, ?, 'planned', 1, ?, ?, ?)`,
  );

  let cursor = horizonStart;
  while (cursor <= horizonEnd) {
    if (rec.daysOfWeek.includes(dayOfWeek(cursor)) && !existingDates.has(cursor)) {
      const result = insertWorkout.run(cursor, rec.name, rec.description, recurrenceId, now, now);
      replaceSets(Number(result.lastInsertRowid), rec.templateSets);
    }
    cursor = addDays(cursor, 1);
  }
}

function clearFutureFromRecurrence(recurrenceId: number) {
  const today = todayUtc();
  db.prepare(
    `DELETE FROM workouts WHERE recurrence_id = ? AND date >= ? AND status = 'planned'`,
  ).run(recurrenceId, today);
}

// ---- Routes ----

function listWorkouts(res: ServerResponse, url: URL) {
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  let rows: WorkoutRow[];
  if (start && end) {
    rows = db
      .prepare(`SELECT * FROM workouts WHERE date >= ? AND date <= ? ORDER BY date ASC, id ASC`)
      .all(start, end) as WorkoutRow[];
  } else {
    rows = db.prepare(`SELECT * FROM workouts ORDER BY date DESC, id DESC LIMIT 200`).all() as WorkoutRow[];
  }
  const workouts = rows.map((row) => workoutFromRow(row, loadSetsFor(row.id)));
  sendJson(res, 200, { workouts });
}

function getWorkout(res: ServerResponse, id: number) {
  const row = db.prepare(`SELECT * FROM workouts WHERE id = ?`).get(id) as WorkoutRow | undefined;
  if (!row) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  sendJson(res, 200, { workout: workoutFromRow(row, loadSetsFor(row.id)) });
}

async function createWorkout(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody(req);
  if (typeof body !== "object" || body === null) {
    sendJson(res, 400, { error: "Expected JSON body" });
    return;
  }
  const rec = body as Record<string, unknown>;
  const date = typeof rec.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rec.date) ? rec.date : "";
  if (!date) {
    sendJson(res, 400, { error: "date (YYYY-MM-DD) is required" });
    return;
  }
  const name = typeof rec.name === "string" ? rec.name.trim() : "";
  if (!name) {
    sendJson(res, 400, { error: "name is required" });
    return;
  }
  const description = typeof rec.description === "string" && rec.description.trim() ? rec.description.trim() : null;
  const status = normalizeStatus(rec.status);
  const planned = rec.planned === false ? 0 : 1;
  const sets = parseSetsField(rec.sets);
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO workouts (date, name, description, status, planned, recurrence_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .run(date, name, description, status, planned, now, now);
  const id = Number(result.lastInsertRowid);
  replaceSets(id, sets);
  getWorkout(res, id);
}

async function updateWorkout(req: IncomingMessage, res: ServerResponse, id: number) {
  const existing = db.prepare(`SELECT * FROM workouts WHERE id = ?`).get(id) as WorkoutRow | undefined;
  if (!existing) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  const body = await readJsonBody(req);
  if (typeof body !== "object" || body === null) {
    sendJson(res, 400, { error: "Expected JSON body" });
    return;
  }
  const rec = body as Record<string, unknown>;
  const date = typeof rec.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rec.date) ? rec.date : existing.date;
  const name = typeof rec.name === "string" && rec.name.trim() ? rec.name.trim() : existing.name;
  const description = "description" in rec
    ? (typeof rec.description === "string" && rec.description.trim() ? rec.description.trim() : null)
    : existing.description;
  const status = "status" in rec ? normalizeStatus(rec.status) : normalizeStatus(existing.status);
  const planned = "planned" in rec ? (rec.planned ? 1 : 0) : existing.planned;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE workouts SET date = ?, name = ?, description = ?, status = ?, planned = ?, updated_at = ? WHERE id = ?`,
  ).run(date, name, description, status, planned, now, id);
  if ("sets" in rec) replaceSets(id, parseSetsField(rec.sets));
  getWorkout(res, id);
}

async function patchWorkoutStatus(req: IncomingMessage, res: ServerResponse, id: number) {
  const existing = db.prepare(`SELECT * FROM workouts WHERE id = ?`).get(id) as WorkoutRow | undefined;
  if (!existing) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  const body = await readJsonBody(req);
  const status = normalizeStatus((body as { status?: unknown })?.status);
  const now = new Date().toISOString();
  db.prepare(`UPDATE workouts SET status = ?, updated_at = ? WHERE id = ?`).run(status, now, id);
  getWorkout(res, id);
}

function deleteWorkout(res: ServerResponse, id: number) {
  db.prepare(`DELETE FROM workouts WHERE id = ?`).run(id);
  sendJson(res, 200, { deleted: true });
}

function startOfWeekUtc(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function getStats(res: ServerResponse) {
  const today = todayUtc();
  const currentWeekStart = startOfWeekUtc(today);
  const prevWeekStart = addDays(currentWeekStart, -7);
  const horizonStart = addDays(currentWeekStart, -7 * 11); // 12 weeks total

  type VolumeRow = { date: string; weight: number | null; reps: number | null };
  const rows = db
    .prepare(
      `SELECT w.date, s.weight, s.reps
       FROM workouts w
       JOIN workout_sets s ON s.workout_id = w.id
       WHERE w.status = 'done' AND w.date >= ?`,
    )
    .all(horizonStart) as VolumeRow[];

  const volumeByWeek = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    volumeByWeek.set(addDays(horizonStart, i * 7), 0);
  }
  for (const row of rows) {
    if (row.weight === null || row.reps === null) continue;
    const wk = startOfWeekUtc(row.date);
    volumeByWeek.set(wk, (volumeByWeek.get(wk) ?? 0) + row.weight * row.reps);
  }

  const planned = db
    .prepare(`SELECT COUNT(*) as c FROM workouts WHERE date >= ? AND date <= ?`)
    .get(currentWeekStart, addDays(currentWeekStart, 6)) as { c: number };
  const done = db
    .prepare(`SELECT COUNT(*) as c FROM workouts WHERE status = 'done' AND date >= ? AND date <= ?`)
    .get(currentWeekStart, addDays(currentWeekStart, 6)) as { c: number };

  sendJson(res, 200, {
    thisWeek: {
      weekStart: currentWeekStart,
      workoutsDone: done.c,
      workoutsPlanned: planned.c,
      volume: Math.round(volumeByWeek.get(currentWeekStart) ?? 0),
      volumePrevWeek: Math.round(volumeByWeek.get(prevWeekStart) ?? 0),
    },
    volumeByWeek: Array.from(volumeByWeek.entries())
      .map(([weekStart, volume]) => ({ weekStart, volume: Math.round(volume) }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
  });
}

function listExercises(res: ServerResponse) {
  const rows = db
    .prepare(`SELECT exercise, COUNT(*) as uses FROM workout_sets GROUP BY exercise ORDER BY uses DESC, exercise ASC LIMIT 200`)
    .all() as Array<{ exercise: string; uses: number }>;
  sendJson(res, 200, { exercises: rows.map((r) => ({ name: r.exercise, uses: r.uses })) });
}

function lastSetForExercise(res: ServerResponse, url: URL) {
  const name = url.searchParams.get("exercise");
  if (!name) {
    sendJson(res, 400, { error: "exercise query param required" });
    return;
  }
  const row = db
    .prepare(
      `SELECT s.exercise, s.weight, s.reps, w.date
       FROM workout_sets s
       JOIN workouts w ON w.id = s.workout_id
       WHERE s.exercise = ? AND w.status != 'planned' AND (s.weight IS NOT NULL OR s.reps IS NOT NULL)
       ORDER BY w.date DESC, s.id DESC
       LIMIT 1`,
    )
    .get(name) as { exercise: string; weight: number | null; reps: number | null; date: string } | undefined;
  if (!row) {
    sendJson(res, 200, { last: null });
    return;
  }
  sendJson(res, 200, { last: { weight: row.weight, reps: row.reps, date: row.date } });
}

function listRecurrences(res: ServerResponse) {
  const rows = db
    .prepare(`SELECT * FROM workout_recurrences ORDER BY id DESC`)
    .all() as RecurrenceRow[];
  sendJson(res, 200, { recurrences: rows.map(recurrenceFromRow) });
}

async function createRecurrence(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody(req);
  if (typeof body !== "object" || body === null) {
    sendJson(res, 400, { error: "Expected JSON body" });
    return;
  }
  const rec = body as Record<string, unknown>;
  const name = typeof rec.name === "string" ? rec.name.trim() : "";
  if (!name) {
    sendJson(res, 400, { error: "name is required" });
    return;
  }
  const days = parseDaysOfWeek(rec.daysOfWeek);
  if (days.length === 0) {
    sendJson(res, 400, { error: "daysOfWeek must contain at least one day 0-6" });
    return;
  }
  const startDate = typeof rec.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rec.startDate) ? rec.startDate : todayUtc();
  const endDate = typeof rec.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rec.endDate) ? rec.endDate : null;
  const description = typeof rec.description === "string" && rec.description.trim() ? rec.description.trim() : null;
  const templateSets = parseSetsField(rec.templateSets);
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO workout_recurrences (name, description, days_of_week, template_sets, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(name, description, JSON.stringify(days), JSON.stringify(templateSets), startDate, endDate, now, now);
  const id = Number(result.lastInsertRowid);
  materializeRecurrence(id);
  const row = db.prepare(`SELECT * FROM workout_recurrences WHERE id = ?`).get(id) as RecurrenceRow;
  sendJson(res, 200, { recurrence: recurrenceFromRow(row) });
}

async function updateRecurrence(req: IncomingMessage, res: ServerResponse, id: number) {
  const existing = db.prepare(`SELECT * FROM workout_recurrences WHERE id = ?`).get(id) as RecurrenceRow | undefined;
  if (!existing) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  const body = await readJsonBody(req);
  if (typeof body !== "object" || body === null) {
    sendJson(res, 400, { error: "Expected JSON body" });
    return;
  }
  const rec = body as Record<string, unknown>;
  const name = typeof rec.name === "string" && rec.name.trim() ? rec.name.trim() : existing.name;
  const description = "description" in rec
    ? (typeof rec.description === "string" && rec.description.trim() ? rec.description.trim() : null)
    : existing.description;
  const days = "daysOfWeek" in rec ? parseDaysOfWeek(rec.daysOfWeek) : (JSON.parse(existing.days_of_week) as number[]);
  if (days.length === 0) {
    sendJson(res, 400, { error: "daysOfWeek must contain at least one day 0-6" });
    return;
  }
  const startDate = typeof rec.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rec.startDate) ? rec.startDate : existing.start_date;
  const endDate = "endDate" in rec
    ? (typeof rec.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rec.endDate) ? rec.endDate : null)
    : existing.end_date;
  const templateSets = "templateSets" in rec ? parseSetsField(rec.templateSets) : (JSON.parse(existing.template_sets) as SetInput[]);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE workout_recurrences SET name = ?, description = ?, days_of_week = ?, template_sets = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?`,
  ).run(name, description, JSON.stringify(days), JSON.stringify(templateSets), startDate, endDate, now, id);
  clearFutureFromRecurrence(id);
  materializeRecurrence(id);
  const row = db.prepare(`SELECT * FROM workout_recurrences WHERE id = ?`).get(id) as RecurrenceRow;
  sendJson(res, 200, { recurrence: recurrenceFromRow(row) });
}

function deleteRecurrence(res: ServerResponse, id: number) {
  clearFutureFromRecurrence(id);
  db.prepare(`DELETE FROM workout_recurrences WHERE id = ?`).run(id);
  sendJson(res, 200, { deleted: true });
}

export function topUpRecurrences() {
  const rows = db.prepare(`SELECT id FROM workout_recurrences`).all() as Array<{ id: number }>;
  for (const row of rows) materializeRecurrence(row.id);
}

export async function routeFitness(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === "/api/fitness/workouts" && req.method === "GET") {
    listWorkouts(res, url);
    return true;
  }
  if (url.pathname === "/api/fitness/workouts" && req.method === "POST") {
    await createWorkout(req, res);
    return true;
  }
  if (url.pathname === "/api/fitness/stats" && req.method === "GET") {
    getStats(res);
    return true;
  }
  if (url.pathname === "/api/fitness/exercises" && req.method === "GET") {
    listExercises(res);
    return true;
  }
  if (url.pathname === "/api/fitness/exercises/last" && req.method === "GET") {
    lastSetForExercise(res, url);
    return true;
  }
  if (url.pathname === "/api/fitness/recurrences" && req.method === "GET") {
    listRecurrences(res);
    return true;
  }
  if (url.pathname === "/api/fitness/recurrences" && req.method === "POST") {
    await createRecurrence(req, res);
    return true;
  }
  const recurrenceIdMatch = url.pathname.match(/^\/api\/fitness\/recurrences\/(\d+)$/);
  if (recurrenceIdMatch) {
    const id = Number(recurrenceIdMatch[1]);
    if (req.method === "PUT") {
      await updateRecurrence(req, res, id);
      return true;
    }
    if (req.method === "DELETE") {
      deleteRecurrence(res, id);
      return true;
    }
  }
  const statusMatch = url.pathname.match(/^\/api\/fitness\/workouts\/(\d+)\/status$/);
  if (statusMatch && req.method === "PATCH") {
    await patchWorkoutStatus(req, res, Number(statusMatch[1]));
    return true;
  }
  const idMatch = url.pathname.match(/^\/api\/fitness\/workouts\/(\d+)$/);
  if (idMatch) {
    const id = Number(idMatch[1]);
    if (req.method === "GET") {
      getWorkout(res, id);
      return true;
    }
    if (req.method === "PUT") {
      await updateWorkout(req, res, id);
      return true;
    }
    if (req.method === "DELETE") {
      deleteWorkout(res, id);
      return true;
    }
  }
  return false;
}
