import type { IncomingMessage, ServerResponse } from "node:http";
import { geminiApiKey, geminiHealthModel } from "../core/config.js";
import { hasValidIntakeToken } from "../core/auth.js";
import { db } from "../core/db.js";
import { readJsonBody, sendJson } from "../core/http.js";
import { cleanOptionalText } from "../core/markdown.js";

type HealthEntryType = "meal" | "body" | "commitment";
type HealthRouteType = HealthEntryType | "mixed";

type HealthMealDraft = {
  summary?: string;
  description: string;
  mealType?: string;
  proteinGEstimate?: number | null;
  caloriesEstimate?: number | null;
  carbsGEstimate?: number | null;
  fatGEstimate?: number | null;
  fiberGEstimate?: number | null;
  hunger?: number | null;
  fullness?: number | null;
  energy?: number | null;
  digestion?: number | null;
  gassiness?: number | null;
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
  focus?: number | null;
  anxiety?: number | null;
  clarity?: number | null;
  motivation?: number | null;
  social?: string | null;
  activityLevel?: string | null;
  sunExposure?: string | null;
  sick?: boolean | null;
  alcohol?: boolean | null;
  marijuana?: boolean | null;
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
  carbsGEstimate: number | null;
  fatGEstimate: number | null;
  fiberGEstimate: number | null;
  summary: string | null;
  hunger: number | null;
  fullness: number | null;
  energy: number | null;
  digestion: number | null;
  gassiness: number | null;
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
  focus: number | null;
  anxiety: number | null;
  clarity: number | null;
  motivation: number | null;
  social: string | null;
  activityLevel: string | null;
  sunExposure: string | null;
  sick: boolean | null;
  alcohol: boolean | null;
  marijuana: boolean | null;
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

type HealthEntry = HealthMealEntry | HealthBodyEntry | HealthCommitmentEntry;
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

function cleanEnum(value: unknown, allowed: readonly string[]) {
  const text = cleanOptionalText(value).toLowerCase();
  return allowed.includes(text) ? text : null;
}

function cleanBool(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "true" || value === "1") return true;
  if (value === false || value === 0 || value === "false" || value === "0") return false;
  return null;
}

function rowBool(row: Record<string, unknown>, key: string): boolean | null {
  const value = row[key];
  if (value === 1 || value === true) return true;
  if (value === 0 || value === false) return false;
  return null;
}

const SOCIAL_LEVELS = ["alone", "light", "heavy"] as const;
const ACTIVITY_LEVELS = ["sedentary", "mixed", "active"] as const;
const SUN_LEVELS = ["none", "some", "lots"] as const;

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
    carbsGEstimate: rowNumber(row, "carbs_g_estimate"),
    fatGEstimate: rowNumber(row, "fat_g_estimate"),
    fiberGEstimate: rowNumber(row, "fiber_g_estimate"),
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
    focus: rowNumber(row, "focus"),
    anxiety: rowNumber(row, "anxiety"),
    clarity: rowNumber(row, "clarity"),
    motivation: rowNumber(row, "motivation"),
    social: rowText(row, "social"),
    activityLevel: rowText(row, "activity_level"),
    sunExposure: rowText(row, "sun_exposure"),
    sick: rowBool(row, "sick"),
    alcohol: rowBool(row, "alcohol"),
    marijuana: rowBool(row, "marijuana"),
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
  if (value === "meal" || value === "body" || value === "commitment") return value;
  if (value === "meals") return "meal";
  if (value === "body_logs") return "body";
  if (value === "commitments") return "commitment";
  return null;
}

function getHealthEntry(type: HealthEntryType, id: number): HealthEntry | null {
  if (type === "meal") {
    const row = db.prepare("SELECT * FROM health_meals WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapMeal(row) : null;
  }
  if (type === "body") {
    const row = db.prepare("SELECT * FROM health_body_logs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapBody(row) : null;
  }
  const row = db.prepare("SELECT * FROM health_commitments WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? mapCommitment(row) : null;
}

function insertHealthMeal(input: HealthMealDraft, context: { capturedAt: string; loggedDate: string; source: string; rawText: string }) {
  const timestamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO health_meals (
        captured_at, logged_date, source, summary, description, meal_type, protein_g_estimate, calories_estimate,
        carbs_g_estimate, fat_g_estimate, fiber_g_estimate,
        hunger, fullness, energy, digestion, gassiness, notes, raw_text, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      cleanOptionalNumber(input.carbsGEstimate),
      cleanOptionalNumber(input.fatGEstimate),
      cleanOptionalNumber(input.fiberGEstimate),
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

function insertHealthBody(input: HealthBodyDraft, context: { capturedAt: string; loggedDate: string; source: string; rawText: string }) {
  const timestamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO health_body_logs (
        captured_at, logged_date, source, summary, sleep_hours, sleep_quality, energy, mood_score, soreness, stress,
        hydration, gassiness, focus, anxiety, clarity, motivation, social, activity_level, sun_exposure, sick, alcohol, marijuana,
        mood, pain, symptoms, weight_lb, notes, raw_text, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      cleanOptionalInteger(input.hydration),
      cleanScore(input.gassiness),
      cleanScore(input.focus),
      cleanScore(input.anxiety),
      cleanScore(input.clarity),
      cleanScore(input.motivation),
      cleanEnum(input.social, SOCIAL_LEVELS),
      cleanEnum(input.activityLevel, ACTIVITY_LEVELS),
      cleanEnum(input.sunExposure, SUN_LEVELS),
      cleanBool(input.sick) === null ? null : (cleanBool(input.sick) ? 1 : 0),
      cleanBool(input.alcohol) === null ? null : (cleanBool(input.alcohol) ? 1 : 0),
      cleanBool(input.marijuana) === null ? null : (cleanBool(input.marijuana) ? 1 : 0),
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
  const result = db
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
  }[type];

  const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  return result.changes > 0;
}

function updateHealthCommitment(id: number, input: Record<string, unknown>) {
  const existing = getHealthEntry("commitment", id);
  if (!existing || existing.type !== "commitment") return null;

  const timestamp = nowIso();
  db
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
    db
      .prepare(
        `UPDATE health_meals
         SET captured_at = ?, logged_date = ?, summary = ?, description = ?, meal_type = ?, protein_g_estimate = ?, calories_estimate = ?,
             carbs_g_estimate = ?, fat_g_estimate = ?, fiber_g_estimate = ?,
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
        "carbsGEstimate" in input ? cleanOptionalNumber(input.carbsGEstimate) : meal.carbsGEstimate,
        "fatGEstimate" in input ? cleanOptionalNumber(input.fatGEstimate) : meal.fatGEstimate,
        "fiberGEstimate" in input ? cleanOptionalNumber(input.fiberGEstimate) : meal.fiberGEstimate,
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

  if (type === "body") {
    const body = existing as HealthBodyEntry;
    db
      .prepare(
        `UPDATE health_body_logs
         SET captured_at = ?, logged_date = ?, summary = ?, sleep_hours = ?, sleep_quality = ?, energy = ?, mood_score = ?, soreness = ?,
             stress = ?, hydration = ?, gassiness = ?, focus = ?, anxiety = ?, clarity = ?, motivation = ?, social = ?, activity_level = ?, sun_exposure = ?, sick = ?, alcohol = ?, marijuana = ?,
             mood = ?, pain = ?, symptoms = ?, weight_lb = ?, notes = ?, updated_at = ?
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
        "hydration" in input ? cleanOptionalInteger(input.hydration) : body.hydration,
        "gassiness" in input ? cleanScore(input.gassiness) : body.gassiness,
        "focus" in input ? cleanScore(input.focus) : body.focus,
        "anxiety" in input ? cleanScore(input.anxiety) : body.anxiety,
        "clarity" in input ? cleanScore(input.clarity) : body.clarity,
        "motivation" in input ? cleanScore(input.motivation) : body.motivation,
        "social" in input ? cleanEnum(input.social, SOCIAL_LEVELS) : body.social,
        "activityLevel" in input ? cleanEnum(input.activityLevel, ACTIVITY_LEVELS) : body.activityLevel,
        "sunExposure" in input ? cleanEnum(input.sunExposure, SUN_LEVELS) : body.sunExposure,
        "sick" in input ? (cleanBool(input.sick) === null ? null : (cleanBool(input.sick) ? 1 : 0)) : (body.sick === null ? null : (body.sick ? 1 : 0)),
        "alcohol" in input ? (cleanBool(input.alcohol) === null ? null : (cleanBool(input.alcohol) ? 1 : 0)) : (body.alcohol === null ? null : (body.alcohol ? 1 : 0)),
        "marijuana" in input ? (cleanBool(input.marijuana) === null ? null : (cleanBool(input.marijuana) ? 1 : 0)) : (body.marijuana === null ? null : (body.marijuana ? 1 : 0)),
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

export function listRecentHealthEntries(limit = 20) {
  const mealRows = db.prepare("SELECT * FROM health_meals ORDER BY captured_at DESC, id DESC LIMIT ?").all(limit) as Record<string, unknown>[];
  const bodyRows = db.prepare("SELECT * FROM health_body_logs ORDER BY captured_at DESC, id DESC LIMIT ?").all(limit) as Record<string, unknown>[];
  const commitmentRows = db.prepare("SELECT * FROM health_commitments ORDER BY created_at DESC, id DESC LIMIT ?").all(limit) as Record<string, unknown>[];

  return [...mealRows.map(mapMeal), ...bodyRows.map(mapBody), ...commitmentRows.map(mapCommitment)]
    .sort((a, b) => {
      const left = "capturedAt" in a ? a.capturedAt : a.createdAt;
      const right = "capturedAt" in b ? b.capturedAt : b.createdAt;
      return right.localeCompare(left);
    })
    .slice(0, limit);
}

function listHealthCommitments() {
  const rows = db.prepare("SELECT * FROM health_commitments ORDER BY status ASC, review_date IS NULL, review_date ASC, created_at DESC").all() as Record<
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
    db.prepare("SELECT COUNT(*) AS count FROM health_meals WHERE logged_date >= ?").get(startKey) as Record<string, unknown>,
    "count",
  );
  const workoutCount = rowRequiredNumber(
    db.prepare("SELECT COUNT(*) AS count FROM workouts WHERE status = 'done' AND date >= ?").get(startKey) as Record<string, unknown>,
    "count",
  );
  const bodyRows = db.prepare("SELECT sleep_hours, sleep_quality, energy, mood_score, soreness, stress, hydration, gassiness, logged_date FROM health_body_logs WHERE logged_date >= ?").all(startKey) as Record<
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
    (db.prepare("SELECT DISTINCT date FROM workouts WHERE status = 'done' AND date >= ?").all(startKey) as Record<string, unknown>[])
      .map((row) => rowText(row, "date"))
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
  const meals = db.prepare("SELECT * FROM health_meals WHERE logged_date = ? ORDER BY captured_at DESC, id DESC").all(today) as Record<string, unknown>[];
  const workouts = db.prepare("SELECT * FROM workouts WHERE date = ? AND status = 'done' ORDER BY id DESC").all(today) as Record<
    string,
    unknown
  >[];
  const bodyLogs = db.prepare("SELECT * FROM health_body_logs WHERE logged_date = ? ORDER BY captured_at DESC, id DESC").all(today) as Record<
    string,
    unknown
  >[];
  const commitments = listHealthCommitments();
  const activeCommitments = commitments.filter((commitment) => commitment.status === "active");
  const dueCommitments = activeCommitments.filter((commitment) => commitment.reviewDate !== null && commitment.reviewDate <= today);
  const mealEntries = meals.map(mapMeal);
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
        count: workouts.length,
        durationMinutes: workouts.reduce((sum, row) => sum + (rowNumber(row, "duration_minutes") ?? 0), 0) || null,
        averageIntensity: average(workouts.map((row) => rowNumber(row, "intensity"))),
        lastDescription: rowText(workouts[0] ?? {}, "description") || rowText(workouts[0] ?? {}, "name") || null,
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

type WeeklyRhythmStats = {
  days: number;
  loggedDays: number;
  byDow: Array<{
    dow: string;
    samples: number;
    sleepHours: number | null;
    sleepQuality: number | null;
    energy: number | null;
    mood: number | null;
    stress: number | null;
    soreness: number | null;
    protein: number | null;
    workoutMinutes: number | null;
    workoutRate: number | null;
  }>;
};

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const healthRhythmCache = new Map<string, { bullets: string[]; generatedAt: string; days: number }>();

function avg(values: number[]) {
  if (!values.length) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function computeWeeklyRhythmStats(days: number, today: string): WeeklyRhythmStats {
  const start = new Date(`${today}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const startKey = start.toISOString().slice(0, 10);

  const meals = db.prepare(
    `SELECT logged_date AS d, SUM(COALESCE(protein_g_estimate,0)) AS protein
       FROM health_meals WHERE logged_date >= ? GROUP BY logged_date`,
  ).all(startKey) as Array<{ d: string; protein: number }>;
  const workouts = db.prepare(
    `SELECT date AS d, SUM(COALESCE(duration_minutes,0)) AS minutes
       FROM workouts WHERE status = 'done' AND date >= ? GROUP BY date`,
  ).all(startKey) as Array<{ d: string; minutes: number }>;
  const body = db.prepare(
    `SELECT logged_date AS d,
            AVG(sleep_hours) AS sleep_hours,
            AVG(sleep_quality) AS sleep_quality,
            AVG(energy) AS energy,
            AVG(mood_score) AS mood,
            AVG(stress) AS stress,
            AVG(soreness) AS soreness
       FROM health_body_logs WHERE logged_date >= ? GROUP BY logged_date`,
  ).all(startKey) as Array<{
    d: string;
    sleep_hours: number | null;
    sleep_quality: number | null;
    energy: number | null;
    mood: number | null;
    stress: number | null;
    soreness: number | null;
  }>;

  const mealMap = new Map(meals.map((r) => [r.d, r]));
  const workoutMap = new Map(workouts.map((r) => [r.d, r]));
  const bodyMap = new Map(body.map((r) => [r.d, r]));

  type Bucket = {
    sleepHours: number[];
    sleepQuality: number[];
    energy: number[];
    mood: number[];
    stress: number[];
    soreness: number[];
    protein: number[];
    workoutMinutes: number[];
    daysTotal: number;
    workoutDays: number;
  };
  const buckets: Bucket[] = Array.from({ length: 7 }, () => ({
    sleepHours: [],
    sleepQuality: [],
    energy: [],
    mood: [],
    stress: [],
    soreness: [],
    protein: [],
    workoutMinutes: [],
    daysTotal: 0,
    workoutDays: 0,
  }));

  let loggedDays = 0;
  for (let i = 0; i < days; i += 1) {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - (days - 1 - i));
    const key = date.toISOString().slice(0, 10);
    const dow = date.getUTCDay();
    const bucket = buckets[dow];
    bucket.daysTotal += 1;

    const b = bodyMap.get(key);
    if (b) {
      if (typeof b.sleep_hours === "number") bucket.sleepHours.push(b.sleep_hours);
      if (typeof b.sleep_quality === "number") bucket.sleepQuality.push(b.sleep_quality);
      if (typeof b.energy === "number") bucket.energy.push(b.energy);
      if (typeof b.mood === "number") bucket.mood.push(b.mood);
      if (typeof b.stress === "number") bucket.stress.push(b.stress);
      if (typeof b.soreness === "number") bucket.soreness.push(b.soreness);
    }
    const m = mealMap.get(key);
    if (m) bucket.protein.push(m.protein);
    const w = workoutMap.get(key);
    if (w && w.minutes > 0) {
      bucket.workoutMinutes.push(w.minutes);
      bucket.workoutDays += 1;
    }
    if (b || m || w) loggedDays += 1;
  }

  return {
    days,
    loggedDays,
    byDow: buckets.map((bucket, dow) => ({
      dow: DOW_NAMES[dow],
      samples: bucket.daysTotal,
      sleepHours: avg(bucket.sleepHours),
      sleepQuality: avg(bucket.sleepQuality),
      energy: avg(bucket.energy),
      mood: avg(bucket.mood),
      stress: avg(bucket.stress),
      soreness: avg(bucket.soreness),
      protein: avg(bucket.protein),
      workoutMinutes: avg(bucket.workoutMinutes),
      workoutRate: bucket.daysTotal > 0 ? bucket.workoutDays / bucket.daysTotal : null,
    })),
  };
}

let lastRhythmDebug: { status?: number; raw?: string; parseError?: string } = {};

async function generateRhythmBullets(stats: WeeklyRhythmStats): Promise<string[]> {
  lastRhythmDebug = {};
  if (!geminiApiKey.trim()) { lastRhythmDebug.parseError = "no api key"; return []; }
  if (stats.loggedDays < 10) { lastRhythmDebug.parseError = `loggedDays=${stats.loggedDays} < 10`; return []; }

  const round = (value: number | null, digits: number) =>
    value === null ? null : Number(value.toFixed(digits));
  type DowRow = WeeklyRhythmStats["byDow"][number];
  type NumericKey = "sleepHours" | "sleepQuality" | "energy" | "mood" | "stress" | "soreness" | "protein" | "workoutMinutes" | "workoutRate";
  const allValues = (key: NumericKey) =>
    stats.byDow.map((row: DowRow) => row[key]).filter((value): value is number => typeof value === "number");
  const overallAvg = (key: NumericKey) => {
    const values = allValues(key);
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  const overallRange = (key: NumericKey) => {
    const values = allValues(key);
    if (!values.length) return null;
    return { min: Math.min(...values), max: Math.max(...values) };
  };

  const digest = {
    daysWindow: stats.days,
    daysLogged: stats.loggedDays,
    overall: {
      sleepHours: round(overallAvg("sleepHours"), 2),
      sleepRange: overallRange("sleepHours"),
      sleepQuality: round(overallAvg("sleepQuality"), 2),
      energy: round(overallAvg("energy"), 2),
      mood: round(overallAvg("mood"), 2),
      stress: round(overallAvg("stress"), 2),
      soreness: round(overallAvg("soreness"), 2),
      proteinG: round(overallAvg("protein"), 0),
      workoutMinutes: round(overallAvg("workoutMinutes"), 0),
      workoutRate: round(overallAvg("workoutRate"), 2),
    },
    byDayOfWeek: stats.byDow.map((row) => ({
      day: row.dow,
      samples: row.samples,
      sleepHours: round(row.sleepHours, 2),
      sleepQuality: round(row.sleepQuality, 2),
      energy: round(row.energy, 2),
      mood: round(row.mood, 2),
      stress: round(row.stress, 2),
      soreness: round(row.soreness, 2),
      proteinG: round(row.protein, 0),
      workoutMinutes: round(row.workoutMinutes, 0),
      workoutRate: round(row.workoutRate, 2),
    })),
  };

  const prompt = [
    "You are a health analyst writing the daily insights summary for a personal dashboard.",
    "Given per-day-of-week stats AND overall averages, surface 3 to 5 concrete, high-leverage observations.",
    "Mix angles: weekly rhythm, training consistency, sleep/recovery, nutrition, mood/stress — whichever the data actually supports.",
    "Lead with the most surprising or actionable one.",
    "Each bullet: ONE sentence, under 22 words, casual second-person voice, with concrete numbers.",
    "Good examples:",
    "  'Sleep dips ~45 min on Tuesdays — likely why energy bottoms out midweek.'",
    "  'You train almost every Monday but skip ~70% of Wednesdays.'",
    "  'Stress peaks Sundays (3.4 vs 2.6 avg) yet sleep that night still recovers.'",
    "Skip generic wellness advice, diagnosis, moralizing about food, or filler.",
    "Only mention a pattern if it has at least 4 samples and a meaningful delta.",
    "Return JSON: { \"bullets\": [\"...\", \"...\"] }. No other keys.",
    "",
    "Data:",
    JSON.stringify(digest),
  ].join("\n");

  const apiUrl = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${geminiHealthModel}:generateContent`);
  apiUrl.searchParams.set("key", geminiApiKey);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            bullets: { type: "ARRAY", items: { type: "STRING" } },
          },
          required: ["bullets"],
        },
      },
    }),
  });

  lastRhythmDebug.status = response.status;
  const rawText = await response.text();
  lastRhythmDebug.raw = rawText.slice(0, 800);
  if (!response.ok) {
    throw new Error(`Gemini rhythm request failed: ${response.status} ${rawText.slice(0, 200)}`);
  }
  const payload = JSON.parse(rawText) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) { lastRhythmDebug.parseError = "no text in candidate"; return []; }
  try {
    const parsed = JSON.parse(stripJsonFence(text)) as { bullets?: unknown };
    if (!Array.isArray(parsed.bullets)) { lastRhythmDebug.parseError = "no bullets array"; return []; }
    return parsed.bullets.filter((value): value is string => typeof value === "string" && value.trim().length > 0).slice(0, 4);
  } catch (error) {
    lastRhythmDebug.parseError = `parse failed: ${error instanceof Error ? error.message : String(error)}`;
    return [];
  }
}

function buildHealthIntakePrompt(input: { text: string; source: string; timezone: string }) {
  return [
    "You are the health intake parser for Vishal.ai, a private personal operating system.",
    "Turn messy voice or text updates into loose health logs. Return only JSON that matches the schema.",
    "",
    "Routes:",
    "- meal: food, drinks, snacks, appetite, digestion around eating.",
    "- body: sleep, sleep quality, energy, mood, stress, soreness, hydration, gassiness, pain, symptoms without diagnosis.",
    "- commitment: weekly consistency choices or promises.",
    "- mixed: more than one category appears.",
    "",
    "Rules:",
    "- Keep descriptions faithful and concise.",
    "- summary: one short neutral summary for each entry when useful.",
    "- notes: side context, caveats, possible relationships stated by the user, and details that should not be lost.",
    "- Preserve user-stated relationships without diagnosing them; e.g. knee tightness because hips felt tight.",
    "- For meals, ALWAYS provide best-effort numeric estimates for caloriesEstimate, proteinGEstimate, carbsGEstimate, fatGEstimate, and fiberGEstimate based on typical portion sizes for the foods described. Use your knowledge of common dishes. It is fine to be approximate — round to the nearest 5g or 10 kcal. Only leave a macro null if the food is truly unknown (e.g. 'something I ate'). When in doubt, estimate.",
    "- DO NOT return null for macros on common, named, identifiable foods (e.g. dosa, Chick-fil-A sandwich, Chipotle bowl, pizza slice, oatmeal, eggs, sushi roll, burrito). For chain-restaurant items use publicly known nutrition values. For home dishes use a typical single serving.",
    "- Example: input 'Chick-fil-A grilled chicken sandwich for lunch' → meals[0]: { description: 'Chick-fil-A grilled chicken sandwich', mealType: 'lunch', caloriesEstimate: 380, proteinGEstimate: 28, carbsGEstimate: 44, fatGEstimate: 11, fiberGEstimate: 4 }.",
    "- Example: input 'Qdoba chicken burrito for dinner' → meals[0]: { description: 'Qdoba chicken burrito', mealType: 'dinner', caloriesEstimate: 1100, proteinGEstimate: 55, carbsGEstimate: 120, fatGEstimate: 40, fiberGEstimate: 12 }.",
    "- Example: input 'dosa for breakfast' → meals[0]: { description: 'dosa', mealType: 'breakfast', caloriesEstimate: 250, proteinGEstimate: 5, carbsGEstimate: 40, fatGEstimate: 7, fiberGEstimate: 2 }.",
    "- If the user describes multiple meals/snacks in one message, return one meals[] entry per distinct meal so macros are itemized.",
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
  const route = typeof parsed.route === "string" && ["meal", "body", "commitment", "mixed"].includes(parsed.route)
    ? (parsed.route as HealthRouteType)
    : "mixed";

  const meals = Array.isArray(parsed.meals)
    ? parsed.meals
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && typeof item.description === "string" && item.description.trim().length > 0)
        .map((item) => ({
          caloriesEstimate: cleanOptionalNumber(item.caloriesEstimate),
          carbsGEstimate: cleanOptionalNumber(item.carbsGEstimate),
          fatGEstimate: cleanOptionalNumber(item.fatGEstimate),
          fiberGEstimate: cleanOptionalNumber(item.fiberGEstimate),
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

  if (!meals.length && !bodyLogs.length && !commitments.length) {
    throw Object.assign(new Error("Gemini returned no health entries"), { statusCode: 502 });
  }

  const confirmation = cleanOptionalText(parsed.confirmation) || "Health update captured.";
  return { route, confirmation, meals, bodyLogs, commitments };
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
            route: { type: "STRING", enum: ["meal", "body", "commitment", "mixed"] },
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
                  carbsGEstimate: { type: "NUMBER" },
                  fatGEstimate: { type: "NUMBER" },
                  fiberGEstimate: { type: "NUMBER" },
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
          required: ["route", "confirmation", "meals", "bodyLogs", "commitments"],
        },
      },
    }),
  });

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
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

export async function captureHealthIntake(input: { text: string; source?: string; timezone?: string; capturedAt?: string }) {
  const text = input.text.trim();
  if (!text) throw Object.assign(new Error("Health intake text cannot be empty"), { statusCode: 400 });
  const source = cleanOptionalText(input.source) || "agent";
  const timezone = cleanOptionalText(input.timezone) || "America/New_York";
  const capturedAt = normalizeCapturedAt(input.capturedAt);
  const loggedDate = dateKeyInTimezone(new Date(capturedAt), timezone);
  const parsed = await parseHealthWithGemini({ text, source, timezone });
  const entries = writeParsedHealthIntake(parsed, { capturedAt, loggedDate, source, rawText: text });
  return { confirmation: parsed.confirmation, route: parsed.route, entries };
}

export async function intakeHealth(req: IncomingMessage, res: ServerResponse, options: { requireBearerToken: boolean }) {
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

export async function routeHealthApi(req: IncomingMessage, res: ServerResponse, url: URL) {
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

  if (url.pathname === "/api/health/log-calendar" && req.method === "GET") {
    const days = Math.min(90, Math.max(7, Number(url.searchParams.get("days") ?? 60)));
    const today = dateKeyInTimezone(new Date(), timezone);
    const start = new Date(`${today}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const startKey = start.toISOString().slice(0, 10);

    const mealDates = new Set(
      (db.prepare("SELECT DISTINCT logged_date FROM health_meals WHERE logged_date >= ?").all(startKey) as Record<string, unknown>[])
        .map((r) => rowText(r, "logged_date")).filter(Boolean),
    );
    const workoutDates = new Set(
      (db.prepare("SELECT DISTINCT date FROM workouts WHERE status = 'done' AND date >= ?").all(startKey) as Record<string, unknown>[])
        .map((r) => rowText(r, "date")).filter(Boolean),
    );
    const bodyDates = new Set(
      (db.prepare("SELECT DISTINCT logged_date FROM health_body_logs WHERE logged_date >= ?").all(startKey) as Record<string, unknown>[])
        .map((r) => rowText(r, "logged_date")).filter(Boolean),
    );

    const calendar: { date: string; score: number; hasMeal: boolean; hasWorkout: boolean; hasBody: boolean }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(`${today}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() - (days - 1 - i));
      const key = d.toISOString().slice(0, 10);
      const hasMeal = mealDates.has(key);
      const hasWorkout = workoutDates.has(key);
      const hasBody = bodyDates.has(key);
      const score = Math.round(((hasMeal ? 1 : 0) + (hasWorkout ? 1 : 0) + (hasBody ? 1 : 0)) / 3 * 100);
      calendar.push({ date: key, score, hasMeal, hasWorkout, hasBody });
    }

    sendJson(res, 200, { calendar, today });
    return true;
  }

  if (url.pathname === "/api/health/series" && req.method === "GET") {
    const days = Math.min(180, Math.max(7, Number(url.searchParams.get("days") ?? 30)));
    const today = dateKeyInTimezone(new Date(), timezone);
    const start = new Date(`${today}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const startKey = start.toISOString().slice(0, 10);

    const mealRows = db.prepare(
      `SELECT logged_date AS d,
              SUM(COALESCE(protein_g_estimate, 0)) AS protein,
              SUM(COALESCE(calories_estimate, 0)) AS calories,
              COUNT(*) AS meals
         FROM health_meals
        WHERE logged_date >= ?
        GROUP BY logged_date`,
    ).all(startKey) as Record<string, unknown>[];

    const workoutRows = db.prepare(
      `SELECT date AS d,
              SUM(COALESCE(duration_minutes, 0)) AS minutes,
              AVG(intensity) AS intensity,
              COUNT(*) AS workouts
         FROM workouts
        WHERE status = 'done' AND date >= ?
        GROUP BY date`,
    ).all(startKey) as Record<string, unknown>[];

    const bodyRows = db.prepare(
      `SELECT logged_date AS d,
              AVG(sleep_hours) AS sleep_hours,
              AVG(sleep_quality) AS sleep_quality,
              AVG(energy) AS energy,
              AVG(mood_score) AS mood,
              AVG(stress) AS stress,
              AVG(soreness) AS soreness,
              AVG(weight_lb) AS weight
         FROM health_body_logs
        WHERE logged_date >= ?
        GROUP BY logged_date`,
    ).all(startKey) as Record<string, unknown>[];

    const num = (row: Record<string, unknown>, key: string) => {
      const value = row[key];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    };
    const mealMap = new Map(mealRows.map((r) => [String(r.d), r]));
    const workoutMap = new Map(workoutRows.map((r) => [String(r.d), r]));
    const bodyMap = new Map(bodyRows.map((r) => [String(r.d), r]));

    const series: Array<{
      date: string;
      sleepHours: number | null;
      sleepQuality: number | null;
      energy: number | null;
      mood: number | null;
      stress: number | null;
      soreness: number | null;
      weight: number | null;
      protein: number | null;
      calories: number | null;
      workoutMinutes: number | null;
      workoutIntensity: number | null;
    }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(`${today}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() - (days - 1 - i));
      const key = d.toISOString().slice(0, 10);
      const meal = mealMap.get(key);
      const workout = workoutMap.get(key);
      const body = bodyMap.get(key);
      series.push({
        date: key,
        sleepHours: body ? num(body, "sleep_hours") : null,
        sleepQuality: body ? num(body, "sleep_quality") : null,
        energy: body ? num(body, "energy") : null,
        mood: body ? num(body, "mood") : null,
        stress: body ? num(body, "stress") : null,
        soreness: body ? num(body, "soreness") : null,
        weight: body ? num(body, "weight") : null,
        protein: meal ? num(meal, "protein") : null,
        calories: meal ? num(meal, "calories") : null,
        workoutMinutes: workout ? num(workout, "minutes") : null,
        workoutIntensity: workout ? num(workout, "intensity") : null,
      });
    }

    sendJson(res, 200, { series, today, days });
    return true;
  }

  if (url.pathname === "/api/health/rhythm" && req.method === "GET") {
    const days = Math.min(120, Math.max(28, Number(url.searchParams.get("days") ?? 60)));
    const debug = url.searchParams.get("debug") === "1";
    const fresh = url.searchParams.get("fresh") === "1";
    const today = dateKeyInTimezone(new Date(), timezone);
    const cacheKey = `${today}:${days}`;
    const cached = healthRhythmCache.get(cacheKey);
    if (cached && cached.bullets.length && !fresh && !debug) {
      sendJson(res, 200, cached);
      return true;
    }

    const stats = computeWeeklyRhythmStats(days, today);
    let bullets: string[] = [];
    let debugError: string | null = null;
    try {
      bullets = await generateRhythmBullets(stats);
    } catch (error) {
      debugError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error("rhythm gemini failed", error);
      bullets = [];
    }
    const payload = { bullets, generatedAt: new Date().toISOString(), days };
    if (bullets.length) healthRhythmCache.set(cacheKey, payload);
    if (debug) {
      sendJson(res, 200, {
        ...payload,
        debug: {
          loggedDays: stats.loggedDays,
          hasApiKey: Boolean(geminiApiKey.trim()),
          model: geminiHealthModel,
          error: debugError,
          gemini: lastRhythmDebug,
        },
      });
      return true;
    }
    sendJson(res, 200, payload);
    return true;
  }

  if (url.pathname === "/api/health/checkin" && req.method === "GET") {
    const dateParam = url.searchParams.get("date");
    const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : dateKeyInTimezone(new Date(), timezone);
    const row = db.prepare("SELECT * FROM health_body_logs WHERE logged_date = ? ORDER BY id DESC LIMIT 1").get(date) as Record<string, unknown> | undefined;
    sendJson(res, 200, { date, entry: row ? mapBody(row) : null });
    return true;
  }

  if (url.pathname === "/api/health/checkin" && req.method === "POST") {
    const body = await readJsonBody(req);
    if (typeof body !== "object" || body === null) {
      sendJson(res, 400, { error: "Expected JSON body" });
      return true;
    }
    const input = body as Record<string, unknown> & { date?: string };
    const today = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : dateKeyInTimezone(new Date(), timezone);
    const existing = db.prepare("SELECT id FROM health_body_logs WHERE logged_date = ? ORDER BY id DESC LIMIT 1").get(today) as { id: number } | undefined;
    if (existing) {
      const updated = updateHealthLogEntry("body", existing.id, input, timezone);
      sendJson(res, 200, { entry: updated });
      return true;
    }
    const capturedAt = nowIso();
    const entry = insertHealthBody(input as HealthBodyDraft, {
      capturedAt,
      loggedDate: today,
      source: "checkin",
      rawText: "",
    });
    sendJson(res, 201, { entry });
    return true;
  }

  if (url.pathname === "/api/health/meals" && req.method === "GET") {
    const dateParam = url.searchParams.get("date");
    const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : dateKeyInTimezone(new Date(), timezone);
    const rows = db.prepare("SELECT * FROM health_meals WHERE logged_date = ? ORDER BY captured_at ASC, id ASC").all(date) as Record<string, unknown>[];
    sendJson(res, 200, { date, entries: rows.map(mapMeal) });
    return true;
  }

  if (url.pathname === "/api/health/meals" && req.method === "POST") {
    const body = await readJsonBody(req);
    if (typeof body !== "object" || body === null || typeof (body as Record<string, unknown>).text !== "string") {
      sendJson(res, 400, { error: "Expected { text, date? }" });
      return true;
    }
    const input = body as { text: string; date?: string };
    const text = input.text.trim();
    if (!text) { sendJson(res, 400, { error: "text cannot be empty" }); return true; }
    const loggedDate = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : dateKeyInTimezone(new Date(), timezone);
    const capturedAt = normalizeCapturedAt(`${loggedDate}T12:00:00.000Z`);
    const parsed = await parseHealthWithGemini({ text, source: "console", timezone });
    const entries: HealthEntry[] = [];
    for (const meal of parsed.meals) {
      const entry = insertHealthMeal(meal, { capturedAt, loggedDate, source: "console", rawText: text });
      if (entry) entries.push(entry);
    }
    sendJson(res, 201, { entries });
    return true;
  }

  if (url.pathname === "/api/health/log" && req.method === "POST") {
    const body = await readJsonBody(req);
    if (typeof body !== "object" || body === null || typeof (body as Record<string, unknown>).text !== "string") {
      sendJson(res, 400, { error: "Expected { text, date? }" });
      return true;
    }
    const input = body as { text: string; date?: string };
    const loggedDate = input.date ?? dateKeyInTimezone(new Date(), timezone);
    const text = (input.text as string).trim();
    if (!text) { sendJson(res, 400, { error: "text cannot be empty" }); return true; }
    const capturedAt = normalizeCapturedAt(`${loggedDate}T12:00:00.000Z`);
    const parsed = await parseHealthWithGemini({ text, source: "console", timezone });
    const entries = writeParsedHealthIntake(parsed, { capturedAt, loggedDate, source: "console", rawText: text });
    sendJson(res, 201, { confirmation: parsed.confirmation, entries, route: parsed.route });
    return true;
  }

  return false;
}
