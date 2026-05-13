# Personal Feed

The home page is being reframed from a "daily brief" widget into a personal content feed. News is the first ingest type; the architecture is designed so that future sources (arXiv, GitHub releases, newsletters, papers, podcasts) and a future recommendation layer driven by stated learning motivations can be added without rewriting.

## Mental model

Three independent layers:

1. **Sources (ingestion)** — adapters that produce normalized items.
2. **Item store** — every item, regardless of source, in one shape, persisted.
3. **Ranking** — pluggable scoring against one or more interest profiles.

Decoupling them is the whole point. New source = new adapter file. Smarter ranking = swap the scorer. Neither touches the UI.

## Layer 1: Sources

Each source is a small adapter with one job:

```
fetch(source) -> NormalizedItem[]
```

v1 source types:
- `rss` — generic RSS/Atom (BBC, blogs, etc.)
- `hn` — Hacker News RSS
- `reddit` — subreddit `.rss` endpoints

Later, drop-in additions (no schema changes needed):
- arXiv category feeds
- GitHub trending / release atom feeds
- YouTube channel RSS
- Podcast feeds
- IMAP newsletters
- Twitter/X lists (via Nitter or API)

Source config lives in the DB (`feed_sources`), not env vars, so it's editable from the UI eventually.

```
feed_sources
  id, name, type, url, weight, enabled, created_at
```

## Layer 2: Item store

Every item normalizes to the same shape and is persisted to SQLite (the app already uses SQLite).

```
feed_items
  id (hash of url), source_id, title, url, summary,
  authors, tags (json), published_at, fetched_at,
  embedding (blob, nullable), raw (json)

feed_interactions
  item_id, action (opened|saved|dismissed|hidden), at
```

Why persistence matters:
- Dedupe across sources.
- Show only unseen items.
- Save-for-later as a first-class action.
- **Interaction history is the training data for future recommendations.** Every day without it is lost signal. Recording from day one is cheap; reconstructing later is impossible.

## Layer 3: Ranking

A scoring function with a stable interface:

```
score(item, profile, now) -> number
```

Items are ranked per profile. Multiple profiles can be active; the UI can show them separately or merged.

```
feed_profiles
  id, name, description, keyword_include (json),
  keyword_exclude (json), source_weights (json),
  embedding (blob, nullable), enabled
```

Ranking evolution path:

- **v1 (build now):** `weight × recency_decay`, filtered by include/exclude keywords. Dumb, fast, good enough.
- **v2:** named profiles with their own keywords + source weights. Multiple profiles run in parallel.
- **v3:** embeddings. Each item embedded once at ingest. Each profile's `description` ("I want to go deep on inference-time compute, RL on LLMs, small efficient models") is embedded. Score = `cosine(item, profile) × recency × source_trust`.
- **v4:** feedback loop. Interactions become positive/negative examples; profile embeddings shift or a small ranker is trained.
- **v5:** generative brief. Claude reads top-N per profile and writes "three things you'd care about today and why." This is where "recommend new tech based on motivations" actually lives.

The schema above is already shaped for v3+. No migration needed when we get there.

## Fetch model

Background poller, not fetch-on-request.

- A scheduled job (interval, configurable per source, default 15 min) pulls all enabled sources, normalizes, and upserts into `feed_items`.
- Page load reads from the DB — instant, no network dependency.
- Fail-soft per source; one dead feed doesn't blank the page.

## Home page layout

News-first with a tasks rail:

- Left/main: ranked feed. Source chip, title, time, save/dismiss actions. Grouped by profile when multiple are active.
- Right rail: open tasks (compact), click to toggle done.
- Drop weather, system stats, daily brief card, launch grid.
- Keep a slim date header.

Save and dismiss are wired from day one even before they affect ranking, because the interactions table needs data.

## Build order

**Phase 1 — scaffold + v1 ranking (this iteration):**
1. SQLite migrations for `feed_sources`, `feed_items`, `feed_interactions`, `feed_profiles`.
2. Source adapters: `rss`, `hn`, `reddit` (all RSS-shaped, one file).
3. Background poller wired into the existing server.
4. `GET /api/feed?profile=...` returning ranked items from the DB.
5. `POST /api/feed/interactions` for save/dismiss/open.
6. New `HomePanel`: news-first layout + tasks rail.
7. Seed one default profile with the user's initial keyword include/exclude and feed list.

**Phase 2 — multi-profile UI:**
- CRUD for profiles and sources from the UI.
- Switcher / merge view.

**Phase 3 — embeddings + brief:**
- Embed items at ingest.
- Embed profile descriptions.
- Cosine-based scorer.
- Optional Claude-written morning brief per profile.

**Phase 4 — feedback-trained ranking:**
- Use `feed_interactions` to nudge ranking. Start simple (boost sources/keywords correlated with `saved`, suppress those correlated with `dismissed`).

## Decisions locked in

- Persistence: SQLite, from day one.
- Fetch: background poller, not on-request.
- Profiles: multi-profile schema from day one (seed with one default row).
- Interactions: tracked from day one.

## Open for later

- Whether the brief is rendered server-side at poll time or client-side on demand.
- Embedding provider (local vs. API) — defer until v3.
- Whether to expose a "why was this shown to me?" explanation per item (likely yes once ranking is non-trivial).
