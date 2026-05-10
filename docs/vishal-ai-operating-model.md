# Vishal.ai Operating Model

Vishal.ai is a personal operating system over an Obsidian vault. The vault is the database. The app is a set of focused lenses over markdown files. Agents can either use app endpoints or write the same markdown formats directly.

## Principles

- Markdown files are canonical.
- UI tools write structured notes, not hidden app rows.
- Agents may create and edit notes directly when they follow the schema.
- Every useful object should be linkable with Obsidian wikilinks.
- The app should reduce data entry, not create a second job.

## Input Modes

### Quick Capture

One fast text field for incomplete thoughts, tasks, links, groceries, or reminders. These land in `inbox/` or `daily/` and can be refined later.

### Structured Tools

Dedicated views for common formats:

- Tasks
- Recipes
- Workouts
- Daily logs

These tools write markdown files with frontmatter so the app can render them predictably.

### Agent Write Mode

Claude, Codex, or another agent can write notes directly if it follows the documented file locations and frontmatter. The app should treat agent-created notes exactly like UI-created notes.

## Vault Layout

```txt
tasks/
recipes/
workouts/
daily/
inbox/
summaries/
```

Existing folders can stay as-is. These folders are typed surfaces for app features.

## Task Schema

Location:

```txt
tasks/{slug}.md
```

Format:

```md
---
type: task
status: todo
priority: medium
due:
project:
links: []
created: 2026-05-09T00:00:00.000Z
---

# Read consensus paper

## Context
Need this for class comparison note.
```

Allowed values:

- `status`: `todo`, `doing`, `done`
- `priority`: `low`, `medium`, `high`
- `due`: ISO date such as `2026-05-12`, or blank
- `links`: Obsidian wikilinks such as `[[Paper Scans/Consensus Notes]]`

Agent rule:

When creating a task, write a single markdown file in `tasks/`, preserve frontmatter, and use wikilinks for related notes.

## Recipe Schema

Location:

```txt
recipes/{slug}.md
```

Format:

```md
---
type: recipe
title: Greek Yogurt Chicken Bowl
meal: lunch
tags: [high-protein, quick, post-workout]
protein_g: 48
carbs_g: 62
fat_g: 18
calories: 610
prep_minutes: 10
cook_minutes: 15
ingredients:
  - chicken breast
  - greek yogurt
  - rice
  - cucumber
---

# Greek Yogurt Chicken Bowl

## Steps
1. Cook rice.
2. Season and cook chicken.
3. Mix yogurt sauce.

## Notes
Good post-workout meal.
```

Useful app behavior:

- Suggest recipes by training day, time, ingredients, and protein needs.
- Generate grocery lists from selected recipes.
- Link recipes to notes about diet, digestion, energy, or performance.

## Workout Schema

Location:

```txt
workouts/{date-or-slug}.md
```

Format:

```md
---
type: workout
date: 2026-05-09
focus: upper
intensity: medium
duration_minutes: 55
equipment: gym
tags: [strength, push]
---

# Upper Strength

## Plan
- Bench press: 4x5
- Row: 4x8
- Incline dumbbell press: 3x10

## Notes
Shoulders felt good. Sleep was mediocre.
```

Useful app behavior:

- Show today’s workout recommendation.
- Adjust intensity from recovery, sleep, soreness, and calendar pressure.
- Connect workouts to recipes and daily logs.

## Daily Log Schema

Location:

```txt
daily/YYYY-MM-DD.md
```

Format:

```md
---
type: daily-log
date: 2026-05-09
sleep_hours:
energy:
training:
---

# 2026-05-09

## Notes

## Food

## Training

## Tasks
```

## First Implementation Slice

Build `Tasks` first.

Minimum useful version:

- `Tasks` top-level tab.
- Reads `tasks/*.md`.
- Creates new task notes from a small form.
- Toggles `todo` and `done`.
- Displays due date, priority, project, and linked notes.

The task API is a convenience writer. The durable contract is still the markdown schema above.
