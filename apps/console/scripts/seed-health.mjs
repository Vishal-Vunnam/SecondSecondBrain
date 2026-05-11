// Seed ~75 days of plausible health data with intentional weekly patterns.
// Run: node --experimental-sqlite apps/console/scripts/seed-health.mjs
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DAYS = 75;
const here = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.VISHAL_AI_DB_PATH ?? resolve(here, "../data/vishal-ai.db");
const db = new DatabaseSync(DB_PATH);

const today = new Date();
today.setUTCHours(0, 0, 0, 0);

const rng = (() => {
  let seed = 0x1f2e3d4c;
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 10_000) / 10_000;
  };
})();

const jitter = (amp) => (rng() - 0.5) * 2 * amp;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round1 = (value) => Math.round(value * 10) / 10;

const MEAL_LIBRARY = {
  breakfast: [
    { description: "Eggs and yogurt", protein: 28, calories: 420 },
    { description: "Oats with peanut butter and banana", protein: 18, calories: 520 },
    { description: "Protein shake and toast", protein: 35, calories: 380 },
    { description: "Two breakfast tacos", protein: 22, calories: 540 },
  ],
  lunch: [
    { description: "Chicken bowl with rice", protein: 45, calories: 720 },
    { description: "Salmon salad", protein: 38, calories: 560 },
    { description: "Burrito and chips", protein: 30, calories: 880 },
    { description: "Turkey sandwich", protein: 28, calories: 620 },
  ],
  dinner: [
    { description: "Steak and sweet potato", protein: 50, calories: 780 },
    { description: "Pasta with chicken", protein: 40, calories: 820 },
    { description: "Tofu stir fry", protein: 25, calories: 620 },
    { description: "Pizza with friends", protein: 28, calories: 1100 },
  ],
  snack: [
    { description: "Greek yogurt", protein: 17, calories: 180 },
    { description: "Protein bar", protein: 20, calories: 230 },
    { description: "Apple and almonds", protein: 6, calories: 240 },
  ],
};

const WORKOUTS = [
  { type: "lift", focus: "push", muscles: "chest, shoulders, triceps", description: "Push day" },
  { type: "lift", focus: "pull", muscles: "back, biceps", description: "Pull day" },
  { type: "lift", focus: "legs", muscles: "quads, hamstrings, glutes", description: "Leg day" },
  { type: "run", focus: "cardio", muscles: "full body", description: "Easy run" },
  { type: "yoga", focus: "mobility", muscles: "full body", description: "Yoga + mobility" },
];

function pick(list) {
  return list[Math.floor(rng() * list.length)];
}

function timeIso(dateKey, hour, minute = 0) {
  return new Date(`${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`).toISOString();
}

const insertMeal = db.prepare(
  `INSERT INTO health_meals (captured_at, logged_date, source, summary, description, meal_type, protein_g_estimate, calories_estimate, hunger, fullness, energy, digestion, gassiness, notes, raw_text, created_at, updated_at)
   VALUES (?, ?, 'seed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
);
const insertWorkout = db.prepare(
  `INSERT INTO health_workouts (captured_at, logged_date, source, summary, workout_type, focus, muscles, description, duration_minutes, intensity, energy_before, energy_after, performance, notes, raw_text, created_at, updated_at)
   VALUES (?, ?, 'seed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
);
const insertBody = db.prepare(
  `INSERT INTO health_body_logs (captured_at, logged_date, source, summary, sleep_hours, sleep_quality, energy, mood_score, soreness, stress, hydration, gassiness, mood, pain, symptoms, weight_lb, notes, raw_text, created_at, updated_at)
   VALUES (?, ?, 'seed', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, ?, ?)`,
);

let inserted = { meals: 0, workouts: 0, body: 0, skipped: 0 };

db.exec("BEGIN");

for (let i = 0; i < DAYS; i += 1) {
  const date = new Date(today);
  date.setUTCDate(date.getUTCDate() - (DAYS - 1 - i));
  const key = date.toISOString().slice(0, 10);
  const dow = date.getUTCDay(); // 0 = Sun
  const nowIso = new Date().toISOString();

  // 8% of days unlogged
  if (rng() < 0.08) { inserted.skipped += 1; continue; }

  // ── Body log ───────────────────────────────────────────────
  const sleepBase = 7.1;
  const sleepDow =
    dow === 2 ? -0.75 :       // Tuesdays: less sleep
    dow === 5 ? +0.35 :       // Friday: catch up
    dow === 6 ? +0.6 :        // Saturday: sleep in
    0;
  const sleepHours = clamp(round1(sleepBase + sleepDow + jitter(0.6)), 4.5, 9.5);
  const sleepQuality = Math.round(clamp(3.3 + sleepDow * 0.6 + jitter(0.8), 1, 5));
  const energy = Math.round(clamp(3.2 + (sleepHours - 7) * 0.6 + jitter(0.8), 1, 5));
  const mood = Math.round(clamp(3.6 + (dow === 0 ? -0.4 : 0) + jitter(0.7), 1, 5));
  const stressDow = dow === 0 ? 0.9 : dow === 1 ? 0.4 : dow === 5 || dow === 6 ? -0.5 : 0;
  const stress = Math.round(clamp(2.7 + stressDow + jitter(0.7), 1, 5));

  // Workout decision (skipped for body table — see below)
  // ── Workout ────────────────────────────────────────────────
  const workoutLikelihood =
    dow === 1 ? 0.85 :
    dow === 3 ? 0.30 :  // Wednesday skips
    dow === 5 ? 0.85 :
    dow === 6 ? 0.55 :
    dow === 0 ? 0.35 :
    0.6;
  const didWorkout = rng() < workoutLikelihood;
  let nextDaySoreness = 1.5;
  if (didWorkout) {
    const choice = pick(WORKOUTS);
    const duration = Math.round(clamp(45 + jitter(20), 20, 90));
    const intensity = Math.round(clamp(3.4 + jitter(1.1), 2, 5));
    const performance = Math.round(clamp(3.4 + (sleepHours - 7) * 0.4 + jitter(0.8), 1, 5));
    const ts = timeIso(key, 17, Math.floor(rng() * 60));
    insertWorkout.run(
      ts, key,
      choice.description,
      choice.type, choice.focus, choice.muscles, choice.description,
      duration, intensity,
      Math.round(clamp(energy - 0.3 + jitter(0.5), 1, 5)),
      Math.round(clamp(energy + 0.3 + jitter(0.5), 1, 5)),
      performance,
      nowIso, nowIso,
    );
    inserted.workouts += 1;
    nextDaySoreness = clamp(2.2 + (intensity - 3) * 0.6 + (choice.focus === "legs" ? 1.2 : 0) + jitter(0.5), 1, 5);
  }
  const soreness = Math.round(clamp(nextDaySoreness + jitter(0.4), 1, 5));
  const hydration = Math.round(clamp(3.2 + jitter(0.8), 1, 5));
  const gassiness = Math.round(clamp(2.4 + jitter(1.0), 1, 5));
  const moodWord = mood >= 4 ? "good" : mood <= 2 ? "flat" : "steady";

  const bodyTs = timeIso(key, 8, Math.floor(rng() * 30));
  insertBody.run(
    bodyTs, key,
    sleepHours, sleepQuality, energy, mood, soreness, stress, hydration, gassiness, moodWord, null, nowIso, nowIso,
  );
  inserted.body += 1;

  // ── Meals ─────────────────────────────────────────────────
  const mealsToday = [
    { slot: "breakfast", hour: 8 },
    { slot: "lunch", hour: 13 },
    { slot: "dinner", hour: 19 },
  ];
  if (rng() < 0.5) mealsToday.push({ slot: "snack", hour: 15 });

  for (const m of mealsToday) {
    const choice = pick(MEAL_LIBRARY[m.slot]);
    const ts = timeIso(key, m.hour, Math.floor(rng() * 50));
    insertMeal.run(
      ts, key,
      choice.description, choice.description, m.slot,
      Math.round(choice.protein + jitter(6)),
      Math.round(choice.calories + jitter(80)),
      Math.round(clamp(3 + jitter(1.2), 1, 5)),
      Math.round(clamp(3.5 + jitter(1.0), 1, 5)),
      Math.round(clamp(3 + jitter(1.0), 1, 5)),
      Math.round(clamp(3 + jitter(1.0), 1, 5)),
      Math.round(clamp(2.4 + jitter(1.2), 1, 5)),
      nowIso, nowIso,
    );
    inserted.meals += 1;
  }
}

db.exec("COMMIT");
console.log("Seeded health data:", inserted);
db.close();
