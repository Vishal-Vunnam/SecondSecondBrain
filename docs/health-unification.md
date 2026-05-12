# Health unification plan

Goal: collapse `health` and `fitness` into one coherent domain. Keep everything in SQL (the point of health is diagnostics + analytics as data grows). Maximize data captured per second of effort. Wearable will layer on later via API.

## Principles

- SQL is canonical for health (not vault markdown — the rest of the app uses vault, health is the exception).
- Minimum logging, maximum data. Default everything; the user confirms or tweaks.
- Subjective fields stay manual (mood, focus, soreness). Objective fields get auto-filled by wearable later.
- Gemini intake is kept only where freeform shines (meals). Everywhere else, structured taps.

## Unify workouts

One `workouts` table that replaces both `fitness.workouts` and `health.workouts`:

- Keep from fitness: `date`, `name`, `status` (planned/done/skipped), `recurrence_id`, `description`.
- Add from health: `duration_minutes`, `intensity`, `energy_before`, `energy_after`, `performance`, `focus`, `notes`.
- `workout_sets` (child table from fitness) stays — that's the structured data analytics will lean on.

Planned-vs-done becomes a status, not a separate domain. Logging a workout = updating today's planned row to `done` and filling metadata. Freeform "describe workout" intake is removed; structured smart-default flow replaces it.

## Daily check-in card

One home-screen card. ~10 seconds. Writes one row to `health_body` per day.

Sliders / quick taps:

- Sleep hours + quality *(existing)*
- Energy, mood, soreness, stress *(existing)*
- **Focus** — flagged as the highest-value subjective metric to add
- **Social** — alone / light / heavy
- **Activity** — sedentary / mixed / active (abstract until wearable lands)
- **Sun** — none / some / lots
- **Sick** — boolean
- **Alcohol** — boolean (today)
- **Marijuana** — boolean (today)
- **Weight** — optional, when on the scale
- **Hydration** — +1 counter tapped throughout the day

## Event-style logs (when it happens)

- **Meals** — Gemini intake stays. Breakfast / lunch / dinner. Freeform text or photo → parsed → rows in `health_meals`. This is where Gemini earns its keep.
- **Workouts** — unified planned-or-done flow:
  - If today has a planned workout: open it, sets default to last session's weight×reps, one tap to mark "did the plan."
  - Deviations are edits, not new entries.
  - PR detection falls out for free.
- **Bowel** — Bristol 1–7 single tap. New `health_bowel` table (timestamp, scale, optional note).
- **Emoji micro-log** — row of tap chips on home (💪 strong, 😴 tired, 🤢 bloated, 🔥 wiped, 🧠 sharp, etc.). Each tap → one row in new `health_signals` (timestamp, tag, optional note). Dense symptom/feeling timeline over months.

## Weekly

- **Reflection** — Sunday (or any day) prompt, single free-form text field. Lands in new `health_reflections` table (week_start, text, created_at).

## What we are removing

- All-encompassing Gemini freeform intake. Too thin, not thorough enough for the rest of the surfaces.
- Freeform "workout description → parsed" path. Workouts log via the unified structured flow.
- `/api/intake/health` becomes redundant once the agent (Phase 2 of `agent-plan.md`) can call `log_health` directly.

## What we are NOT adding (decided against)

To keep effort low. Listed here so we don't re-litigate:

- Caffeine timing, alcohol units / timing (binary boolean is enough)
- Supplements / meds log
- Pain log by body region
- Naps, sex, sauna / cold / stretching / walks
- Travel / time zone, weather (auto-pullable later if wanted)
- Location, menstrual, libido
- Morning HRV proxy, grip strength
- Body measurements (waist/chest/arms), progress photos
- Weekly "wins / friction" beyond the single reflection field

Wearable will fill the objective gaps (HRV, RHR, sleep stages, steps, etc.) when it lands. Manual logging stays focused on what a wearable can't see: subjective state, food, deliberate inputs (alcohol/marijuana/sick), bowel, reflection.

## Tables (sketch)

Existing, modified:

- `workouts` — merge fitness + health workout columns. `status` enum: planned / done / skipped.
- `workout_sets` — unchanged (child of `workouts`).
- `health_body` — add `focus`, `social`, `activity_level`, `sun_exposure`, `sick`, `alcohol`, `marijuana`.
- `health_meals` — unchanged. Gemini-parsed.

New:

- `health_bowel` — id, captured_at, logged_date, bristol (1–7), notes.
- `health_signals` — id, captured_at, logged_date, tag, notes. (Emoji micro-log.)
- `health_reflections` — id, week_start, text, created_at.

Removed:

- `health.workouts` table merges into unified `workouts`. Migration: copy rows over with `status='done'`.

## Sequencing

Do this after agent Phase 1 ships (per `agent-plan.md`). Writing the agent's workout tools forces the unification — having two overlapping APIs to expose is the forcing function.

Order once agent Phase 1 is done:

1. Merge `workouts` tables. Migration + remove `health.workouts` routes.
2. `health_body` column additions + daily check-in card UI.
3. `health_signals` (emoji micro-log) + `health_bowel` chips on home.
4. `health_reflections` weekly prompt.
5. Remove freeform Gemini intake path. Keep meal intake only.
