import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  SkipForward,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createRecurrence,
  createWorkout,
  deleteWorkout,
  loadExercises,
  loadFitnessStats,
  loadLastSet,
  loadWorkouts,
  patchWorkoutStatus,
  updateWorkout,
} from "../lib/fitness";
import type { ExerciseSummary, FitnessStats, Workout, WorkoutStatus } from "../types";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function startOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - dt.getDay());
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function dowFor(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function formatRange(start: string, end: string): string {
  const fmt = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(y, m - 1, d));
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatDayLabel(dateStr: string, today: string): string {
  if (dateStr === today) return "Today";
  if (dateStr === addDays(today, -1)) return "Yesterday";
  if (dateStr === addDays(today, 1)) return "Tomorrow";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date(y, m - 1, d));
}

function formatLongDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" }).format(new Date(y, m - 1, d));
}

function daysAgo(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const then = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - then) / 86400000);
}

type DraftSet = { exercise: string; weight: string; reps: string };
const EMPTY_DRAFT_SET: DraftSet = { exercise: "", weight: "", reps: "" };

function statusColor(status: WorkoutStatus): string {
  if (status === "done") return "#3ecf8e";
  if (status === "skipped") return "var(--muted)";
  return "var(--accent)";
}

function dayVolume(list: Workout[]): number {
  let total = 0;
  for (const w of list) {
    if (w.status !== "done") continue;
    for (const s of w.sets) {
      if (typeof s.weight === "number" && typeof s.reps === "number") {
        total += s.weight * s.reps;
      }
    }
  }
  return total;
}

function scoreColor(score: number, isFuture: boolean): string {
  if (isFuture) return "var(--line)";
  if (score === 0) return "var(--muted)";
  if (score < 34) return "#e05263";
  if (score < 67) return "var(--accent)";
  return "#3ecf8e";
}

export function FitnessPanel() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayLocal()));
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [exercises, setExercises] = useState<ExerciseSummary[]>([]);
  const [stats, setStats] = useState<FitnessStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => todayLocal());
  const [editingId, setEditingId] = useState<number | "new" | null>(null);

  const weekEnd = addDays(weekStart, 6);

  const refresh = useCallback(async () => {
    try {
      const [list, exList, statsResult] = await Promise.all([
        loadWorkouts(weekStart, weekEnd),
        loadExercises(),
        loadFitnessStats(),
      ]);
      setWorkouts(list.workouts);
      setExercises(exList.exercises);
      setStats(statsResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load fitness data");
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => { refresh(); }, [refresh]);

  const workoutsByDate = useMemo(() => {
    const map = new Map<string, Workout[]>();
    for (const w of workouts) {
      if (!map.has(w.date)) map.set(w.date, []);
      map.get(w.date)!.push(w);
    }
    return map;
  }, [workouts]);

  const today = todayLocal();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const selectedWorkouts = workoutsByDate.get(selectedDate) ?? [];

  const scoreByDate = useMemo(() => {
    const volumes = new Map<string, number>();
    for (const d of days) volumes.set(d, dayVolume(workoutsByDate.get(d) ?? []));
    const maxVol = Math.max(0, ...Array.from(volumes.values()));
    const scores = new Map<string, number>();
    for (const [d, v] of volumes) {
      scores.set(d, maxVol > 0 ? Math.round((v / maxVol) * 100) : 0);
    }
    return { scores, volumes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutsByDate, weekStart]);

  return (
    <section className="fitness-panel" aria-label="Fitness">
      <div className="fitness-layout">
      <div className="fitness-shell">
        <header className="fitness-heading">
          <div>
            <span>Health</span>
            <h3>Fitness</h3>
          </div>
          <div className="fitness-week-nav">
            <button type="button" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              <ChevronLeft size={14} />
            </button>
            <span>{formatRange(weekStart, weekEnd)}</span>
            <button type="button" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              <ChevronRight size={14} />
            </button>
          </div>
        </header>

        <div className="fit-strip" role="listbox" aria-label="Days of week">
          {days.map((date) => {
            const list = workoutsByDate.get(date) ?? [];
            const isSelected = date === selectedDate;
            const isToday = date === today;
            const isFuture = date > today;
            const dow = dowFor(date);
            const score = scoreByDate.scores.get(date) ?? 0;
            const volume = scoreByDate.volumes.get(date) ?? 0;
            const ringColor = scoreColor(score, isFuture);
            return (
              <button
                key={date}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`fit-cell${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                onClick={() => setSelectedDate(date)}
                title={volume > 0 ? `Volume: ${Math.round(volume)} lb` : list.length ? `${list.length} planned` : "No workout"}
              >
                <span className="fit-dow">{DAY_LABELS[dow]}</span>
                <span className="fit-bubble" style={{ borderColor: ringColor }}>
                  {Number(date.split("-")[2])}
                </span>
                <span className="fit-score">{score > 0 ? score : ""}</span>
                {list.length > 1 && (
                  <span className="fit-count" aria-label={`${list.length} workouts`}>{list.length}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="fit-day-header">
          <div className="fit-day-title">
            <span>{formatDayLabel(selectedDate, today)}</span>
            <strong>{formatLongDate(selectedDate)}</strong>
          </div>
          {editingId === null && (
            <button type="button" className="fit-add-btn" onClick={() => setEditingId("new")}>
              <Plus size={13} /> Add workout
            </button>
          )}
        </div>

        {error && <p className="fit-error">{error}</p>}

        {loading ? (
          <div className="fit-loading"><Loader2 className="spin" size={18} /></div>
        ) : (
          <div className="fit-workouts">
            {selectedWorkouts.length === 0 && editingId !== "new" && (
              <p className="fit-empty">Nothing planned. Add one above.</p>
            )}

            {selectedWorkouts.map((workout) =>
              editingId === workout.id ? (
                <WorkoutForm
                  key={workout.id}
                  initial={workout}
                  date={selectedDate}
                  exercises={exercises}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => { await refresh(); setEditingId(null); }}
                />
              ) : (
                <WorkoutCard
                  key={workout.id}
                  workout={workout}
                  onEdit={() => setEditingId(workout.id)}
                  onChanged={refresh}
                />
              ),
            )}

            {editingId === "new" && (
              <WorkoutForm
                initial={null}
                date={selectedDate}
                exercises={exercises}
                onCancel={() => setEditingId(null)}
                onSaved={async () => { await refresh(); setEditingId(null); }}
              />
            )}
          </div>
        )}
      </div>

      <aside className="fitness-analytics" aria-label="Fitness analytics">
        <AnalyticsScorecard stats={stats} />
        <VolumeSparkline stats={stats} />
      </aside>

      </div>
    </section>
  );
}

function AnalyticsScorecard({ stats }: { stats: FitnessStats | null }) {
  if (!stats) return null;
  const { workoutsDone, workoutsPlanned, volume, volumePrevWeek } = stats.thisWeek;
  const delta = volume - volumePrevWeek;
  const deltaPct = volumePrevWeek > 0 ? Math.round((delta / volumePrevWeek) * 100) : null;
  const deltaSign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return (
    <section className="fa-card">
      <header className="fa-card-head">
        <span className="fa-card-overline">This week</span>
      </header>
      <div className="fa-stat-grid">
        <div className="fa-stat">
          <span className="fa-stat-label">Workouts</span>
          <strong className="fa-stat-value">
            {workoutsDone}<span className="fa-stat-sub">/{workoutsPlanned}</span>
          </strong>
        </div>
        <div className="fa-stat">
          <span className="fa-stat-label">Volume</span>
          <strong className="fa-stat-value">
            {volume.toLocaleString()}<span className="fa-stat-sub"> lb</span>
          </strong>
        </div>
        <div className="fa-stat">
          <span className="fa-stat-label">vs last week</span>
          <strong className={`fa-stat-value fa-delta-${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}`}>
            {deltaSign}{Math.abs(delta).toLocaleString()}
            {deltaPct !== null && <span className="fa-stat-sub"> ({deltaSign}{Math.abs(deltaPct)}%)</span>}
          </strong>
        </div>
      </div>
    </section>
  );
}

function VolumeSparkline({ stats }: { stats: FitnessStats | null }) {
  if (!stats || stats.volumeByWeek.length === 0) return null;
  const weeks = stats.volumeByWeek;
  const max = Math.max(1, ...weeks.map((w) => w.volume));
  return (
    <section className="fa-card">
      <header className="fa-card-head">
        <span className="fa-card-overline">Volume · last 12 weeks</span>
        <span className="fa-card-meta">max {max.toLocaleString()} lb</span>
      </header>
      <div className="fa-spark" role="img" aria-label="Weekly volume bar chart">
        {weeks.map((w, i) => {
          const h = max > 0 ? Math.round((w.volume / max) * 100) : 0;
          const isCurrent = i === weeks.length - 1;
          const fmt = (s: string) => {
            const [y, m, d] = s.split("-").map(Number);
            return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(y, m - 1, d));
          };
          return (
            <div key={w.weekStart} className={`fa-spark-col${isCurrent ? " is-current" : ""}`} title={`${fmt(w.weekStart)}: ${w.volume.toLocaleString()} lb`}>
              <span className="fa-spark-bar" style={{ height: `${Math.max(2, h)}%` }} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WorkoutCard({
  workout,
  onEdit,
  onChanged,
}: {
  workout: Workout;
  onEdit: () => void;
  onChanged: () => void | Promise<void>;
}) {
  async function setStatus(status: WorkoutStatus) {
    await patchWorkoutStatus(workout.id, status);
    await onChanged();
  }
  async function remove() {
    if (!window.confirm(`Delete "${workout.name}"?`)) return;
    await deleteWorkout(workout.id);
    await onChanged();
  }
  return (
    <article className={`fit-card fit-card-${workout.status}`}>
      <header>
        <div className="fit-card-title">
          <span className="fit-status-dot" style={{ background: statusColor(workout.status) }} />
          <strong>{workout.name}</strong>
          {workout.recurrenceId && <Repeat size={11} aria-label="Recurring" />}
        </div>
        <div className="fit-card-actions">
          {workout.status !== "done" && (
            <button type="button" title="Mark done" onClick={() => setStatus("done")}><Check size={13} /></button>
          )}
          {workout.status === "planned" && (
            <button type="button" title="Skip" onClick={() => setStatus("skipped")}><SkipForward size={13} /></button>
          )}
          <button type="button" title="Edit" onClick={onEdit}><Pencil size={13} /></button>
          <button type="button" title="Delete" onClick={remove}><Trash2 size={13} /></button>
        </div>
      </header>
      {workout.description && <p className="fit-card-desc">{workout.description}</p>}
      {workout.sets.length > 0 && (
        <ul className="fit-set-list">
          {workout.sets.map((s, i) => (
            <li key={s.id ?? i}>
              <span className="fit-set-ex">{s.exercise}</span>
              <span className="fit-set-nums">
                {s.weight !== null ? <strong>{s.weight}</strong> : <span className="muted">—</span>}
                {s.reps !== null ? <span>×{s.reps}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function WorkoutForm({
  initial,
  date,
  exercises,
  onCancel,
  onSaved,
}: {
  initial: Workout | null;
  date: string;
  exercises: ExerciseSummary[];
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [sets, setSets] = useState<DraftSet[]>(
    initial && initial.sets.length > 0
      ? initial.sets.map((s) => ({
          exercise: s.exercise,
          weight: s.weight !== null ? String(s.weight) : "",
          reps: s.reps !== null ? String(s.reps) : "",
        }))
      : [{ ...EMPTY_DRAFT_SET }],
  );
  const [makeRecurring, setMakeRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>(() => [dowFor(date)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<number, { weight: number | null; reps: number | null; date: string } | null>>({});
  const isEditing = initial !== null;

  const fetchHint = useCallback(async (rowIdx: number, exercise: string) => {
    if (!exercise.trim()) return;
    try {
      const result = await loadLastSet(exercise.trim());
      setHints((prev) => ({ ...prev, [rowIdx]: result.last }));
    } catch {}
  }, []);

  const lastFetched = useRef<Record<number, string>>({});
  useEffect(() => {
    sets.forEach((s, i) => {
      const key = s.exercise.trim().toLowerCase();
      if (!key) return;
      if (lastFetched.current[i] === key) return;
      lastFetched.current[i] = key;
      fetchHint(i, s.exercise);
    });
  }, [sets, fetchHint]);

  function updateSet(idx: number, patch: Partial<DraftSet>) {
    setSets((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function addSet(exercise = "") {
    setSets((prev) => {
      // if there's a trailing empty row, fill it; otherwise push new
      if (prev.length > 0 && !prev[prev.length - 1].exercise.trim() && !prev[prev.length - 1].weight && !prev[prev.length - 1].reps) {
        return prev.map((s, i) => (i === prev.length - 1 ? { ...s, exercise } : s));
      }
      return [...prev, { ...EMPTY_DRAFT_SET, exercise }];
    });
  }
  function removeSet(idx: number) { setSets((prev) => prev.filter((_, i) => i !== idx)); }
  function applyHint(idx: number) {
    const hint = hints[idx];
    if (!hint) return;
    updateSet(idx, {
      weight: hint.weight !== null ? String(hint.weight) : "",
      reps: hint.reps !== null ? String(hint.reps) : "",
    });
  }
  function toggleDay(d: number) {
    setRecurringDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  }

  async function submit() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true); setError(null);
    try {
      const cleanedSets = sets
        .filter((s) => s.exercise.trim())
        .map((s) => ({
          exercise: s.exercise.trim(),
          weight: s.weight.trim() ? Number(s.weight) : null,
          reps: s.reps.trim() ? Number(s.reps) : null,
        }));
      if (isEditing && initial) {
        await updateWorkout(initial.id, {
          date,
          name: name.trim(),
          description: description.trim() || null,
          sets: cleanedSets,
        });
      } else {
        await createWorkout({
          date,
          name: name.trim(),
          description: description.trim() || null,
          status: "planned",
          planned: true,
          sets: cleanedSets,
        });
        if (makeRecurring && recurringDays.length > 0) {
          await createRecurrence({
            name: name.trim(),
            description: description.trim() || null,
            daysOfWeek: recurringDays,
            startDate: date,
            templateSets: cleanedSets,
          });
        }
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="fit-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <input
        className="fit-name-input"
        placeholder="Workout name (e.g. Push Day)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        disabled={saving}
      />

      <textarea
        className="fit-desc-input"
        placeholder="Describe how it felt (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        disabled={saving}
      />

      {exercises.length > 0 && (
        <div className="fit-saved-exercises" aria-label="Saved exercises">
          {exercises.slice(0, 12).map((ex) => (
            <button
              key={ex.name}
              type="button"
              className="fit-saved-chip"
              onClick={() => addSet(ex.name)}
              disabled={saving}
            >
              + {ex.name}
            </button>
          ))}
        </div>
      )}

      <div className="fit-sets">
        {sets.map((s, i) => {
          const hint = hints[i];
          return (
            <div key={i} className="fit-set-row">
              <input
                className="fit-set-ex-input"
                placeholder="Exercise"
                value={s.exercise}
                onChange={(e) => updateSet(i, { exercise: e.target.value })}
                list="fit-exercises"
                disabled={saving}
              />
              <input
                className="fit-set-num-input"
                inputMode="decimal"
                placeholder="lbs"
                value={s.weight}
                onChange={(e) => updateSet(i, { weight: e.target.value })}
                disabled={saving}
              />
              <span className="fit-set-x">×</span>
              <input
                className="fit-set-num-input"
                inputMode="numeric"
                placeholder="reps"
                value={s.reps}
                onChange={(e) => updateSet(i, { reps: e.target.value })}
                disabled={saving}
              />
              <button type="button" className="fit-set-remove" onClick={() => removeSet(i)} disabled={saving} aria-label="Remove">
                <X size={12} />
              </button>
              {hint && s.exercise.trim() && (!s.weight || !s.reps) && (
                <button type="button" className="fit-set-hint" onClick={() => applyHint(i)}>
                  last: {hint.weight ?? "—"}×{hint.reps ?? "—"} · {daysAgo(hint.date)}d ago
                </button>
              )}
            </div>
          );
        })}
        <button type="button" className="fit-add-row" onClick={() => addSet()} disabled={saving}>
          <Plus size={12} /> Add exercise
        </button>
        <datalist id="fit-exercises">
          {exercises.map((e) => <option key={e.name} value={e.name} />)}
        </datalist>
      </div>

      {!isEditing && (
        <div className="fit-recurring">
          <label className="fit-recurring-toggle">
            <input type="checkbox" checked={makeRecurring} onChange={(e) => setMakeRecurring(e.target.checked)} />
            <Repeat size={12} /> Make recurring
          </label>
          {makeRecurring && (
            <div className="fit-day-chips">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  className={`fit-day-chip${recurringDays.includes(i) ? " is-on" : ""}`}
                  onClick={() => toggleDay(i)}
                >
                  {label[0]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="fit-error">{error}</p>}

      <div className="fit-form-actions">
        <button type="button" className="fit-action ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="fit-action" disabled={saving}>
          {saving ? <Loader2 className="spin" size={13} /> : <Check size={13} />}
          {isEditing ? "Save" : "Create"}
        </button>
      </div>
    </form>
  );
}
