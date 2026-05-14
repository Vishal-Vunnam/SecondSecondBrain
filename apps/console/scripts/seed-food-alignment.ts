import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const dbPath = path.resolve(process.cwd(), "data/vishal-ai.db");
const db = new DatabaseSync(dbPath);

const TODAY = "2026-05-14";

function dateKey(offsetFromToday: number) {
  const date = new Date(`${TODAY}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetFromToday);
  return date.toISOString().slice(0, 10);
}

function iso(dateKey: string, hour: number, minute = 0) {
  return `${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

type MealSeed = {
  hour: number;
  mealType: string;
  description: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
};

type DaySeed = {
  date: string;
  meals: MealSeed[];
  body: {
    sleepHours: number | null;
    sleepQuality: number | null;
    energy: number | null;
    moodScore: number | null;
    focus: number | null;
    anxiety: number | null;
    clarity: number | null;
    motivation: number | null;
    soreness: number | null;
    stress: number | null;
    hydration: number | null;
    weightLb: number | null;
    sick?: boolean;
    alcohol?: boolean;
    marijuana?: boolean;
    activityLevel?: string;
    social?: string;
    sunExposure?: string;
  };
  workout?: { name: string; duration: number; intensity: number };
};

const M = (hour: number, mealType: string, description: string, calories: number, protein: number, carbs: number, fat: number, fiber: number): MealSeed => ({
  hour,
  mealType,
  description,
  calories,
  protein,
  carbs,
  fat,
  fiber,
});

const eggs = M(8, "breakfast", "scrambled eggs and avocado toast", 480, 28, 30, 26, 8);
const oatmeal = M(8, "breakfast", "oatmeal with berries and walnuts", 380, 12, 55, 14, 9);
const greekYogurt = M(8, "breakfast", "greek yogurt with granola and blueberries", 420, 24, 50, 12, 6);
const proteinSmoothie = M(8, "breakfast", "protein smoothie with banana and peanut butter", 450, 35, 45, 14, 6);
const bagelCreamCheese = M(9, "breakfast", "bagel with cream cheese", 480, 12, 65, 18, 2);
const pastryCoffee = M(9, "breakfast", "blueberry muffin and latte", 520, 9, 70, 22, 2);

const chickenSalad = M(13, "lunch", "grilled chicken salad with quinoa and chickpeas", 620, 42, 55, 22, 12);
const burrito = M(13, "lunch", "Qdoba chicken burrito bowl with black beans", 780, 48, 80, 26, 14);
const sushi = M(13, "lunch", "salmon sushi rolls with edamame", 680, 38, 90, 14, 8);
const turkeyWrap = M(13, "lunch", "turkey wrap with hummus and greens", 580, 32, 60, 18, 9);
const pizza = M(13, "lunch", "two slices pepperoni pizza", 720, 28, 78, 30, 4);
const fastFood = M(13, "lunch", "McDonald's quarter pounder with fries", 1080, 38, 110, 50, 6);

const salmonRice = M(19, "dinner", "salmon with rice and roasted vegetables", 720, 45, 70, 24, 9);
const lentilStew = M(19, "dinner", "lentil stew with spinach and brown rice", 680, 32, 95, 14, 18);
const stirFry = M(19, "dinner", "tofu vegetable stir fry with brown rice", 640, 26, 85, 18, 12);
const steakPotato = M(19, "dinner", "steak with sweet potato and broccoli", 780, 52, 60, 32, 11);
const pastaRed = M(19, "dinner", "pasta with marinara and meatballs", 820, 38, 95, 28, 8);
const takeoutChinese = M(19, "dinner", "general tsos chicken with white rice", 1100, 36, 130, 42, 4);

const apple = M(16, "snack", "apple with almond butter", 250, 6, 30, 14, 6);
const proteinBar = M(16, "snack", "protein bar", 220, 20, 22, 8, 3);
const chips = M(16, "snack", "bag of chips", 320, 4, 36, 18, 2);
const cookies = M(15, "snack", "two chocolate chip cookies", 360, 4, 50, 16, 1);
const yogurt = M(16, "snack", "kefir and walnuts", 240, 14, 18, 14, 2);

const days: DaySeed[] = [
  // 13 days ago
  {
    date: dateKey(-13),
    meals: [eggs, chickenSalad, salmonRice, apple],
    body: { sleepHours: 7.5, sleepQuality: 4, energy: 4, moodScore: 4, focus: 4, anxiety: 2, clarity: 4, motivation: 4, soreness: 2, stress: 2, hydration: 7, weightLb: 178, activityLevel: "active", social: "light", sunExposure: "some" },
    workout: { name: "Upper body lift", duration: 60, intensity: 4 },
  },
  {
    date: dateKey(-12),
    meals: [oatmeal, sushi, lentilStew, yogurt],
    body: { sleepHours: 7.8, sleepQuality: 4, energy: 4, moodScore: 4, focus: 4, anxiety: 2, clarity: 4, motivation: 4, soreness: 3, stress: 2, hydration: 8, weightLb: 178, activityLevel: "mixed", social: "alone", sunExposure: "some" },
  },
  {
    date: dateKey(-11),
    meals: [bagelCreamCheese, pizza, takeoutChinese],
    body: { sleepHours: 6.5, sleepQuality: 3, energy: 2, moodScore: 3, focus: 2, anxiety: 3, clarity: 2, motivation: 3, soreness: 2, stress: 4, hydration: 5, weightLb: 179, alcohol: true, activityLevel: "sedentary", social: "heavy", sunExposure: "none" },
  },
  {
    date: dateKey(-10),
    meals: [greekYogurt, turkeyWrap, stirFry, apple],
    body: { sleepHours: 6.0, sleepQuality: 2, energy: 2, moodScore: 3, focus: 2, anxiety: 3, clarity: 2, motivation: 2, soreness: 3, stress: 3, hydration: 6, weightLb: 178.5, activityLevel: "sedentary", social: "alone", sunExposure: "some" },
  },
  {
    date: dateKey(-9),
    meals: [proteinSmoothie, chickenSalad, salmonRice, proteinBar],
    body: { sleepHours: 8.0, sleepQuality: 5, energy: 5, moodScore: 4, focus: 5, anxiety: 1, clarity: 5, motivation: 5, soreness: 2, stress: 2, hydration: 9, weightLb: 178, activityLevel: "active", social: "light", sunExposure: "lots" },
    workout: { name: "Lower body lift", duration: 70, intensity: 5 },
  },
  {
    date: dateKey(-8),
    meals: [eggs, burrito, lentilStew],
    body: { sleepHours: 7.5, sleepQuality: 4, energy: 4, moodScore: 4, focus: 4, anxiety: 2, clarity: 4, motivation: 4, soreness: 4, stress: 2, hydration: 8, weightLb: 178, activityLevel: "mixed", social: "light", sunExposure: "some" },
  },
  {
    date: dateKey(-7),
    meals: [pastryCoffee, fastFood, pastaRed, cookies],
    body: { sleepHours: 6.8, sleepQuality: 3, energy: 2, moodScore: 3, focus: 2, anxiety: 3, clarity: 2, motivation: 2, soreness: 2, stress: 3, hydration: 5, weightLb: 179.5, marijuana: true, activityLevel: "sedentary", social: "heavy", sunExposure: "none" },
  },
  {
    date: dateKey(-6),
    meals: [oatmeal, sushi, salmonRice, yogurt],
    body: { sleepHours: 7.2, sleepQuality: 4, energy: 3, moodScore: 4, focus: 3, anxiety: 2, clarity: 3, motivation: 3, soreness: 2, stress: 2, hydration: 7, weightLb: 178.5, activityLevel: "mixed", social: "alone", sunExposure: "some" },
  },
  {
    date: dateKey(-5),
    meals: [greekYogurt, chickenSalad, steakPotato, apple],
    body: { sleepHours: 7.8, sleepQuality: 4, energy: 4, moodScore: 5, focus: 4, anxiety: 1, clarity: 4, motivation: 4, soreness: 2, stress: 2, hydration: 8, weightLb: 178, activityLevel: "active", social: "light", sunExposure: "lots" },
    workout: { name: "Run + abs", duration: 45, intensity: 3 },
  },
  {
    date: dateKey(-4),
    meals: [proteinSmoothie, turkeyWrap, lentilStew],
    body: { sleepHours: 7.5, sleepQuality: 4, energy: 4, moodScore: 4, focus: 4, anxiety: 2, clarity: 4, motivation: 4, soreness: 3, stress: 2, hydration: 7, weightLb: 178, activityLevel: "mixed", social: "light", sunExposure: "some" },
  },
  {
    date: dateKey(-3),
    meals: [bagelCreamCheese, pizza, pastaRed, chips],
    body: { sleepHours: 6.2, sleepQuality: 2, energy: 2, moodScore: 3, focus: 2, anxiety: 4, clarity: 2, motivation: 2, soreness: 2, stress: 4, hydration: 4, weightLb: 179, alcohol: true, activityLevel: "sedentary", social: "heavy", sunExposure: "none" },
  },
  {
    date: dateKey(-2),
    meals: [eggs, chickenSalad, salmonRice, yogurt],
    body: { sleepHours: 7.0, sleepQuality: 3, energy: 3, moodScore: 4, focus: 3, anxiety: 2, clarity: 3, motivation: 3, soreness: 3, stress: 3, hydration: 7, weightLb: 178.5, activityLevel: "mixed", social: "alone", sunExposure: "some" },
    workout: { name: "Push day", duration: 65, intensity: 4 },
  },
  // yesterday — marijuana + low sleep so today's confidence drops
  {
    date: dateKey(-1),
    meals: [oatmeal, burrito, takeoutChinese, cookies],
    body: { sleepHours: 6.0, sleepQuality: 2, energy: 3, moodScore: 3, focus: 3, anxiety: 3, clarity: 2, motivation: 3, soreness: 2, stress: 3, hydration: 5, weightLb: 179, marijuana: true, activityLevel: "sedentary", social: "light", sunExposure: "some" },
  },
  // today — protein covered but light fiber/plants → "missing_fiber_plants" + applicable nudge
  {
    date: dateKey(0),
    meals: [
      M(8, "breakfast", "greek yogurt with granola", 380, 24, 50, 8, 3),
      M(13, "lunch", "grilled chicken sandwich", 520, 38, 48, 18, 4),
      M(19, "dinner", "steak with white rice", 720, 48, 70, 26, 3),
    ],
    body: { sleepHours: 6.5, sleepQuality: 3, energy: 3, moodScore: 4, focus: 3, anxiety: 2, clarity: 3, motivation: 4, soreness: 2, stress: 2, hydration: 6, weightLb: 178.5, activityLevel: "mixed", social: "light", sunExposure: "some" },
  },
];

const timestamp = new Date().toISOString();
const tx = db.exec.bind(db);

tx("BEGIN");
try {
  // Wipe prior synthetic seed for these dates so re-running is clean
  const start = days[0].date;
  const end = days[days.length - 1].date;
  db.prepare("DELETE FROM health_meals WHERE logged_date BETWEEN ? AND ? AND source = 'seed'").run(start, end);
  db.prepare("DELETE FROM health_body_logs WHERE logged_date BETWEEN ? AND ? AND source = 'seed'").run(start, end);
  db.prepare("DELETE FROM workouts WHERE date BETWEEN ? AND ? AND description = 'seed'").run(start, end);

  const insertMeal = db.prepare(
    `INSERT INTO health_meals (
       captured_at, logged_date, source, summary, description, meal_type,
       calories_estimate, protein_g_estimate, carbs_g_estimate, fat_g_estimate, fiber_g_estimate,
       hunger, fullness, energy, digestion, gassiness, notes, raw_text, created_at, updated_at
     ) VALUES (?, ?, 'seed', NULL, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)`,
  );
  const insertBody = db.prepare(
    `INSERT INTO health_body_logs (
       captured_at, logged_date, source, summary, sleep_hours, sleep_quality, energy, mood_score,
       soreness, stress, hydration, gassiness, focus, anxiety, clarity, motivation,
       social, activity_level, sun_exposure, sick, alcohol, marijuana,
       mood, pain, symptoms, weight_lb, notes, raw_text, created_at, updated_at
     ) VALUES (?, ?, 'seed', NULL, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, '', ?, ?)`,
  );
  const insertWorkout = db.prepare(
    `INSERT INTO workouts (date, name, description, status, planned, recurrence_id,
       duration_minutes, intensity, energy_before, energy_after, performance, focus, notes, created_at, updated_at)
     VALUES (?, ?, 'seed', 'done', 0, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
  );

  let mealCount = 0;
  let bodyCount = 0;
  let workoutCount = 0;
  for (const day of days) {
    for (const meal of day.meals) {
      insertMeal.run(
        iso(day.date, meal.hour),
        day.date,
        meal.description,
        meal.mealType,
        meal.calories,
        meal.protein,
        meal.carbs,
        meal.fat,
        meal.fiber,
        meal.description,
        timestamp,
        timestamp,
      );
      mealCount += 1;
    }
    const b = day.body;
    insertBody.run(
      iso(day.date, 22),
      day.date,
      b.sleepHours,
      b.sleepQuality,
      b.energy,
      b.moodScore,
      b.soreness,
      b.stress,
      b.hydration,
      b.focus,
      b.anxiety,
      b.clarity,
      b.motivation,
      b.social ?? null,
      b.activityLevel ?? null,
      b.sunExposure ?? null,
      b.sick === undefined ? null : b.sick ? 1 : 0,
      b.alcohol === undefined ? null : b.alcohol ? 1 : 0,
      b.marijuana === undefined ? null : b.marijuana ? 1 : 0,
      b.weightLb,
      timestamp,
      timestamp,
    );
    bodyCount += 1;
    if (day.workout) {
      insertWorkout.run(day.date, day.workout.name, day.workout.duration, day.workout.intensity, timestamp, timestamp);
      workoutCount += 1;
    }
  }
  tx("COMMIT");
  console.log(`Seeded ${mealCount} meals, ${bodyCount} body logs, ${workoutCount} workouts across ${days.length} days (${start} → ${end}).`);
} catch (error) {
  tx("ROLLBACK");
  throw error;
}
