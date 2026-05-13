import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { healthDbPath } from "./config.js";

mkdirSync(path.dirname(healthDbPath), { recursive: true });

export const db = new DatabaseSync(healthDbPath);

function ensureColumn(table: string, column: string, definition: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: unknown }>;
  if (rows.some((row) => row.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function migrate() {
  db.exec(`
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

    DROP TABLE IF EXISTS health_signals;
    DROP TABLE IF EXISTS health_bowel;

CREATE INDEX IF NOT EXISTS idx_health_meals_logged_date ON health_meals(logged_date);
    CREATE INDEX IF NOT EXISTS idx_health_workouts_logged_date ON health_workouts(logged_date);
    CREATE INDEX IF NOT EXISTS idx_health_body_logs_logged_date ON health_body_logs(logged_date);
    CREATE INDEX IF NOT EXISTS idx_health_commitments_status ON health_commitments(status);
    PRAGMA user_version = 1;

    CREATE TABLE IF NOT EXISTS tasks_index (
      path TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      due TEXT,
      project TEXT,
      links TEXT NOT NULL DEFAULT '[]',
      created TEXT,
      modified_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shopping_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      reasoning TEXT,
      type TEXT,
      necessity TEXT NOT NULL DEFAULT 'important',
      got_it INTEGER NOT NULL DEFAULT 0,
      link TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_recurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      days_of_week TEXT NOT NULL DEFAULT '[]',
      template_sets TEXT NOT NULL DEFAULT '[]',
      start_date TEXT NOT NULL,
      end_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      planned INTEGER NOT NULL DEFAULT 1,
      recurrence_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (recurrence_id) REFERENCES workout_recurrences(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS workout_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_id INTEGER NOT NULL,
      exercise TEXT NOT NULL,
      weight REAL,
      reps INTEGER,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);
    CREATE INDEX IF NOT EXISTS idx_workout_sets_workout ON workout_sets(workout_id);
    CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets(exercise);

    CREATE TABLE IF NOT EXISTS feed_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      weight REAL NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_polled_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS feed_items (
      id TEXT PRIMARY KEY,
      source_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      summary TEXT,
      authors TEXT,
      tags TEXT,
      published_at TEXT,
      fetched_at TEXT NOT NULL,
      FOREIGN KEY (source_id) REFERENCES feed_sources(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_feed_items_published ON feed_items(published_at);
    CREATE INDEX IF NOT EXISTS idx_feed_items_source ON feed_items(source_id);

    CREATE TABLE IF NOT EXISTS feed_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      keyword_include TEXT NOT NULL DEFAULT '[]',
      keyword_exclude TEXT NOT NULL DEFAULT '[]',
      source_weights TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS feed_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL,
      profile_id INTEGER,
      action TEXT NOT NULL,
      at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES feed_items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_feed_interactions_item ON feed_interactions(item_id);
    CREATE INDEX IF NOT EXISTS idx_feed_interactions_at ON feed_interactions(at);
  `);

  ensureColumn("health_meals", "hunger", "INTEGER");
  ensureColumn("health_meals", "summary", "TEXT");
  ensureColumn("health_meals", "gassiness", "INTEGER");
  ensureColumn("health_meals", "carbs_g_estimate", "REAL");
  ensureColumn("health_meals", "fat_g_estimate", "REAL");
  ensureColumn("health_meals", "fiber_g_estimate", "REAL");
  ensureColumn("health_workouts", "summary", "TEXT");
  ensureColumn("health_workouts", "workout_type", "TEXT");
  ensureColumn("health_workouts", "muscles", "TEXT");
  ensureColumn("health_workouts", "performance", "INTEGER");
  ensureColumn("health_body_logs", "sleep_quality", "INTEGER");
  ensureColumn("health_body_logs", "summary", "TEXT");
  ensureColumn("health_body_logs", "mood_score", "INTEGER");
  ensureColumn("health_body_logs", "stress", "INTEGER");
  ensureColumn("health_body_logs", "hydration", "INTEGER");
  ensureColumn("health_body_logs", "gassiness", "INTEGER");
  ensureColumn("health_body_logs", "pain", "TEXT");
  ensureColumn("health_body_logs", "symptoms", "TEXT");
  ensureColumn("shopping_items", "link", "TEXT");

  ensureColumn("health_body_logs", "focus", "INTEGER");
  ensureColumn("health_body_logs", "social", "TEXT");
  ensureColumn("health_body_logs", "activity_level", "TEXT");
  ensureColumn("health_body_logs", "sun_exposure", "TEXT");
  ensureColumn("health_body_logs", "sick", "INTEGER");
  ensureColumn("health_body_logs", "alcohol", "INTEGER");
  ensureColumn("health_body_logs", "marijuana", "INTEGER");
  ensureColumn("health_body_logs", "anxiety", "INTEGER");
  ensureColumn("health_body_logs", "clarity", "INTEGER");
  ensureColumn("health_body_logs", "motivation", "INTEGER");

  ensureColumn("workouts", "duration_minutes", "INTEGER");
  ensureColumn("workouts", "intensity", "INTEGER");
  ensureColumn("workouts", "energy_before", "INTEGER");
  ensureColumn("workouts", "energy_after", "INTEGER");
  ensureColumn("workouts", "performance", "INTEGER");
  ensureColumn("workouts", "focus", "INTEGER");
  ensureColumn("workouts", "notes", "TEXT");

  const healthWorkoutsExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='health_workouts'`)
    .get();
  if (healthWorkoutsExists) {
    db.exec(`
      INSERT INTO workouts (
        date, name, description, status, planned, recurrence_id,
        duration_minutes, intensity, energy_before, energy_after, performance, focus, notes,
        created_at, updated_at
      )
      SELECT
        logged_date,
        COALESCE(NULLIF(TRIM(summary), ''), 'Workout'),
        description,
        'done',
        0,
        NULL,
        duration_minutes,
        intensity,
        energy_before,
        energy_after,
        performance,
        CASE WHEN focus GLOB '-?[0-9]*' OR focus GLOB '[0-9]*' THEN CAST(focus AS INTEGER) ELSE NULL END,
        notes,
        created_at,
        updated_at
      FROM health_workouts;
      DROP TABLE health_workouts;
    `);
  }
}

migrate();
