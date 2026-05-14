# Food alignment

Goal: show whether today's food is helping focus, energy, nutrient coverage, and long-term health without turning eating into a rigid score. The system should be low-friction, explainable, and cheap to run.

This should use the data already captured by the health logging page before asking for new inputs.

## Product Shape

The daily check-in stays the primary workflow:

- Body signals: sleep hours, sleep quality, energy, mood, focus, anxiety, clarity, motivation, soreness, stress, social, activity, sun, sick, alcohol, marijuana, hydration, weight, and notes.
- Food logs: freeform meal text parsed into summary, description, meal type, calories, protein, carbs, fat, and fiber, with optional hunger, fullness, meal energy, digestion, gassiness, and notes.
- Edits: logged meals can already be corrected for meal type, calories, protein, carbs, fat, fiber, and description.

Food alignment reads from those logs and returns four compact states:

- **Focus**: supported / shaky / unknown
- **Energy**: stable / underfed / crash-risk / unknown
- **Nutrients**: covered / missing protein / missing fiber-plants / unknown
- **Longevity**: aligned / mixed / low-signal

Then it gives one nudge:

> Protein is covered. Today is light on fiber/plants, so dinner should include beans, greens, berries, lentils, or a big vegetable side.

No points. No guilt language. No banned foods. The language should stay observational and practical.

## Current Data Contract

Canonical tables already available:

- `health_meals`
- `health_body_logs`
- `workouts`

`health_meals` currently supports:

```text
id
captured_at
logged_date
source
summary
description
meal_type
calories_estimate
protein_g_estimate
carbs_g_estimate
fat_g_estimate
fiber_g_estimate
hunger
fullness
energy
digestion
gassiness
notes
raw_text
created_at
updated_at
```

`health_body_logs` currently supports:

```text
id
captured_at
logged_date
source
summary
sleep_hours
sleep_quality
energy
mood_score
soreness
stress
hydration
gassiness
focus
anxiety
clarity
motivation
social
activity_level
sun_exposure
sick
alcohol
marijuana
mood
pain
symptoms
weight_lb
notes
raw_text
created_at
updated_at
```

The migration in `apps/console/server/core/db.ts` ensures the newer meal macro columns (`carbs_g_estimate`, `fat_g_estimate`, `fiber_g_estimate`) and newer check-in columns (`focus`, `anxiety`, `clarity`, `motivation`, `social`, `activity_level`, `sun_exposure`, `sick`, `alcohol`, `marijuana`) exist.

Important parser note: the visible `DailyCheckinCard` writes the newer body fields directly through `/api/health/checkin`. The freeform Gemini body parser currently normalizes the older body fields and does not yet emit focus, clarity, motivation, anxiety, social, activity, sun, sick, alcohol, or marijuana. Food alignment v1 should rely on the saved `health_body_logs` fields, not assume every field came from freeform parsing.

## Cost Policy

Phase 1 should add zero new LLM calls.

Allowed:

- SQL aggregation.
- Deterministic rules.
- Derived meal tags from macros and keywords.
- Cached meal templates.
- Simple text normalization and fuzzy matching.

Avoid:

- Calling an LLM when the dashboard loads.
- Calling an LLM to judge alignment.
- Training a model before enough personal history exists.

Existing meal parsing can stay. Over time, call it less:

- If a meal matches a known template, reuse the template macros and tags.
- If the user edits macros, save that correction as the better default.
- Only call Gemini for unfamiliar freeform meals.

## Daily Feature Layer

Build one deterministic feature object per date.

Food features from `health_meals`:

```text
date
meal_count
calories_total
protein_total
carbs_total
fat_total
fiber_total
first_meal_at
first_meal_type
first_meal_protein
breakfast_logged
protein_by_meal_type
calories_by_meal_type
plant_tag_count
stable_carb_count
crash_risk_count
ultra_processed_count
omega3_count_7d
fermented_count_7d
```

Outcome and context features from `health_body_logs`:

```text
sleep_hours
sleep_quality
energy
mood_score
focus
anxiety
clarity
motivation
soreness
stress
hydration
gassiness
social
activity_level
sun_exposure
sick
alcohol
marijuana
weight_lb
```

Training context from `workouts`:

```text
workout_done
workout_minutes
workout_intensity
energy_before
energy_after
performance
```

This mirrors the current Overview series, which already aggregates daily sleep, energy, mood, stress, soreness, weight, protein, calories, workout minutes, and workout intensity.

## Context Modifiers

Alcohol, marijuana, sickness, poor sleep, high stress, and training load should affect confidence. They should not become food targets.

Rules:

- If alcohol was logged yesterday, lower confidence that today's low focus or energy was caused by food.
- If marijuana was logged yesterday, lower confidence that today's low focus or energy was caused by food.
- If sickness is logged today or yesterday, avoid promoting or demoting a food nudge.
- If sleep hours or sleep quality are low, lower confidence that food caused low focus or energy.
- If stress is high, treat focus and energy changes as multi-factor.
- If workout minutes or intensity are high, avoid labeling higher appetite or calories as a problem.
- If data is sparse, output `unknown` or `low-signal`.

Example:

> Energy is low today, but alcohol was logged yesterday and sleep quality was low, so food confidence is low. Keep the next food move simple: protein plus steady carbs.

## Meal Tags

Generate tags from macros and meal description. No model needed.

Examples:

- `high-protein`: protein >= 30g, or protein density is strong for calories.
- `low-protein`: meaningful calories with low protein.
- `fiber-support`: fiber >= 8g.
- `plant-heavy`: description includes beans, lentils, vegetables, greens, fruit, berries, salad, etc.
- `stable-carb`: oats, rice, potatoes, beans, lentils, whole grains, fruit.
- `crash-risk`: sugar/refined-carb keywords with low protein and low fiber.
- `omega-3`: salmon, sardines, trout, tuna, mackerel.
- `fermented`: yogurt, kefir, kimchi, sauerkraut.
- `ultra-processed`: fast food, packaged snack, candy, soda, fried chain meal keywords.
- `focus-friendly`: high protein or stable carb, unless `crash-risk` is present.

Negative tags override positive focus tags. A meal can keep raw descriptive tags, but should not receive `focus-friendly` if `crash-risk` is present.

## Alignment Logic V1

Focus:

- Supported if protein appears early, stable carbs are present, and no crash-risk meal is logged before the main work window.
- Shaky if calories are very low, the first meal is low-protein, or crash-risk tags appear early.
- Unknown if there is too little meal or body data.
- Lower confidence when poor sleep, high stress, alcohol, marijuana, sickness, or unusually high training load is present.

Energy:

- Stable if calories are not extremely low, meals are spaced, and stable-carb/protein tags exist.
- Underfed if calories are far below recent baseline by evening, especially with low energy.
- Crash-risk if sugar/refined-carb tags appear without protein or fiber.
- Lower confidence when sleep or substance context is the more likely explanation.

Nutrients:

- Covered if protein floor plus plant/fiber tags are present.
- Missing protein if protein is below the current progressive band.
- Missing fiber-plants if fiber or plant tags are low.
- Unknown if logged meals have too many missing macro estimates.

Longevity:

- Aligned if the 7-day pattern includes plants, legumes or whole grains, healthy fats, omega-3/fish, fermented foods, and limited ultra-processed tags.
- Mixed if some anchors are present but ultra-processed/crash-risk frequency is high.
- Low-signal if the week has too few meal logs.

## Progressive Tracks

Tracks should adapt from recent baseline, not from idealized targets.

```sql
CREATE TABLE food_alignment_tracks (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  priority INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  baseline_value REAL,
  current_target_min REAL,
  current_target_max REAL,
  confidence TEXT NOT NULL DEFAULT 'low',
  active_nudge TEXT,
  last_promoted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Initial tracks:

- `focus`: improve focus and clarity outcomes.
- `energy`: reduce underfed and crash-risk days.
- `nutrients`: raise protein, fiber, plants, and variety.
- `longevity`: favor a Mediterranean-ish weekly pattern.
- `digestion`: optional, using digestion/gassiness when logged.

Progression examples:

- If 14-day protein average is 70g, next band might be 80-95g, not 150g.
- If protein band is hit on 10 of the last 14 days, promote the target or shift the nudge to fiber/plants.
- If focus worsens while a nudge is active, do not promote it.
- If poor sleep, alcohol, marijuana, sickness, or high stress are present, reduce confidence.
- Only one main nudge should be active at a time.

Cadence:

- Daily: compute today's alignment.
- Weekly: update baselines and choose one active nudge.
- Monthly: widen the analysis window and look for stronger personal patterns.

## Meal Memory

Add a canonical meal table after the deterministic readout exists.

```sql
CREATE TABLE food_meal_templates (
  id INTEGER PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  normalized_key TEXT NOT NULL UNIQUE,
  default_meal_type TEXT,
  calories_estimate REAL,
  protein_g_estimate REAL,
  carbs_g_estimate REAL,
  fat_g_estimate REAL,
  fiber_g_estimate REAL,
  tags TEXT NOT NULL DEFAULT '[]',
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Matching v1:

- Lowercase description.
- Remove punctuation and filler words.
- Exact match on normalized key first.
- Basic fuzzy match second.
- If confidence is high, reuse template.
- If confidence is low, use current parser behavior.
- If the user edits macros, update the template candidate after confirmation.

## API Sketch

```text
GET /api/health/food-alignment?date=YYYY-MM-DD
```

Response:

```json
{
  "date": "2026-05-13",
  "reads": {
    "focus": {
      "status": "supported",
      "confidence": "medium",
      "reason": "Protein appeared early and no crash-risk meals are logged."
    },
    "energy": {
      "status": "stable",
      "confidence": "medium",
      "reason": "Calories and meal spacing are close to your recent baseline."
    },
    "nutrients": {
      "status": "missing_fiber_plants",
      "confidence": "medium",
      "reason": "Protein is covered, but plant/fiber tags are light."
    },
    "longevity": {
      "status": "mixed",
      "confidence": "low",
      "reason": "The 7-day pattern has too few tagged foods."
    }
  },
  "nudge": "Add a fiber/plant anchor at dinner: beans, greens, berries, lentils, or a big vegetable side.",
  "features": {
    "mealCount": 3,
    "proteinTotal": 92,
    "caloriesTotal": 1850,
    "fiberTotal": 14,
    "plantTagCount": 1,
    "crashRiskCount": 0
  },
  "contextModifiers": {
    "alcoholYesterday": false,
    "marijuanaYesterday": true,
    "sickTodayOrYesterday": false,
    "sleepLow": true,
    "stressHigh": false,
    "heavyTraining": false,
    "foodConfidenceAdjusted": true
  }
}
```

## UI Direction

Add the first readout inside `health-food` or directly under the food area in `DailyCheckinCard`. It should feel like the Overview chart, not like a diet app.

Layout:

- Header: `Food alignment` with a quiet date/range control.
- Four compact readouts: Focus, Energy, Nutrients, Longevity.
- One short nudge.
- Optional disclosure row for reasons and context modifiers.
- A small weekly visual for protein/fiber/plants/crash-risk if there is enough data.

Visual principles from Overview:

- Use mostly text, whitespace, thin lines, and one restrained accent at a time.
- Prefer transparent surfaces and existing variables over heavy cards.
- Use the Overview-style large readout only for one selected metric, not for all four states.
- Use SVG paths with soft area fills for trends, matching `.big-chart-svg`.
- Use tiny mono axis/date labels like `.big-chart-axis-label` and `.big-chart-foot`.
- Use subtle hover readouts like the Overview tooltip.
- Keep chart strokes around `2px`, rounded caps, and no grid clutter.
- Reuse existing health palette tokens: `var(--teal)`, `var(--olive)`, `var(--orange)`, `var(--red)`, `var(--mist)`.
- Avoid traffic-light blocks, badge-heavy scoring, thick rings, celebratory gradients, and gamified point visuals.

Good v1 visuals:

- **Alignment strip**: four labels with small status text and a 1px underline using the metric accent.
- **Weekly nutrition ribbon**: seven narrow vertical bars showing protein or fiber total, with muted days for missing data.
- **Protein/fiber trend**: one Overview-style mini area chart with metric selector.
- **Context markers**: tiny ticks below the chart for poor sleep, alcohol, marijuana, sickness, or heavy training.

The default empty state should be calm:

> Log a meal and daily check-in to see food alignment.

## Build Sequence

1. Add deterministic meal tagger.
2. Add daily food feature aggregation from `health_meals`, `health_body_logs`, and `workouts`.
3. Add context modifiers for sleep, stress, alcohol, marijuana, sickness, and training load.
4. Add `GET /api/health/food-alignment`.
5. Add compact UI readout using the Overview visual language.
6. Add weekly mini visual once the endpoint returns enough history.
7. Add meal templates and template matching.
8. Add weekly progressive track update.
9. Update the freeform body parser if voice/text logging should fill the newer check-in fields.
10. Add personal learning only after enough real logs exist.

## Personal Learning V2

Start simple after real data exists:

- Rolling averages.
- Correlations with lag checks.
- Linear/logistic regression.
- Small decision tree or random forest if needed.

Target labels:

- High focus day: focus >= rolling baseline + meaningful delta.
- Low focus day: focus <= rolling baseline - meaningful delta.
- Same for energy and clarity.

Inputs:

- Food features from today and yesterday.
- Sleep, stress, hydration, workout, alcohol, marijuana, sick.

Output wording:

- Say "possible pattern" until confidence is high.
- Mention alcohol, marijuana, sickness, stress, and sleep as context when they likely explain focus/energy changes.
- Never phrase food correlations as medical certainty.

Neural model threshold:

- Do not consider a neural model until there are at least 180 real logged days with food and focus/energy outcomes.
- Even then, prefer local/simple models unless a neural model clearly beats simpler baselines.

## Open Questions

- Should the first protein floor start from body weight, recent observed baseline, or a conservative default band?
- Should the first nudge optimize focus above all else, or should nutrients win when protein/fiber are clearly weak?
- Should caffeine timing become a one-tap field later, or remain out of scope?
- Should body composition goals influence food alignment now, or stay separate from focus/energy/nutrients/longevity?
