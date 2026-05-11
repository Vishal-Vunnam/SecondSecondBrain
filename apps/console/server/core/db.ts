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
  `);

  ensureColumn("health_meals", "hunger", "INTEGER");
  ensureColumn("health_meals", "summary", "TEXT");
  ensureColumn("health_meals", "gassiness", "INTEGER");
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
}

migrate();
