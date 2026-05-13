import {
  Check,
  Droplets,
  HeartPulse,
  Loader2,
  Minus,
  Plus,
  Send,
  Sun,
  Users,
  Utensils,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type HealthCheckinPayload,
  deleteHealthMeal,
  loadHealthCheckin,
  loadHealthMeals,
  logHealthMeal,
  saveHealthCheckin,
} from "../lib/healthData";
import type { ActivityLevel, HealthBodyEntry, HealthMealEntry, SocialLevel, SunLevel } from "../types";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const SCORE_LABELS = ["1", "2", "3", "4", "5"];
const SOCIAL_OPTIONS: SocialLevel[] = ["alone", "light", "heavy"];
const ACTIVITY_OPTIONS: ActivityLevel[] = ["sedentary", "mixed", "active"];
const SUN_OPTIONS: SunLevel[] = ["none", "some", "lots"];

type ScoreRowProps = {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
};

function ScoreRow({ label, value, onChange }: ScoreRowProps) {
  return (
    <div className="checkin-score-row">
      <span className="checkin-row-label">{label}</span>
      <div className="checkin-score-buttons" role="radiogroup" aria-label={label}>
        {SCORE_LABELS.map((digit, i) => {
          const score = i + 1;
          const active = value === score;
          return (
            <button
              aria-checked={active}
              className={active ? "active" : ""}
              key={digit}
              onClick={() => onChange(active ? null : score)}
              role="radio"
              type="button"
            >
              {digit}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type SegmentRowProps<T extends string> = {
  label: string;
  icon: React.ReactNode;
  options: readonly T[];
  value: T | null;
  onChange: (value: T | null) => void;
};

function SegmentRow<T extends string>({ label, icon, options, value, onChange }: SegmentRowProps<T>) {
  return (
    <div className="checkin-segment-row">
      <span className="checkin-row-label">
        {icon}
        {label}
      </span>
      <div className="checkin-segments" role="radiogroup" aria-label={label}>
        {options.map((option) => {
          const active = value === option;
          return (
            <button
              aria-checked={active}
              className={active ? "active" : ""}
              key={option}
              onClick={() => onChange(active ? null : option)}
              role="radio"
              type="button"
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type DailyCheckinCardProps = {
  date?: string | null;
};

export function DailyCheckinCard({ date }: DailyCheckinCardProps = {}) {
  const [entry, setEntry] = useState<HealthBodyEntry | null>(null);
  const [meals, setMeals] = useState<HealthMealEntry[]>([]);
  const [mealText, setMealText] = useState("");
  const [mealLogging, setMealLogging] = useState(false);
  const [mealError, setMealError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const saveTimeout = useRef<number | null>(null);
  const pending = useRef<HealthCheckinPayload>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      loadHealthCheckin(date ?? undefined),
      loadHealthMeals(date ?? undefined),
    ])
      .then(([checkin, mealResult]) => {
        if (!active) return;
        setEntry(checkin.entry);
        setMeals(mealResult.entries);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [date]);

  const submitMeal = useCallback(async () => {
    const text = mealText.trim();
    if (!text || mealLogging) return;
    setMealLogging(true);
    setMealError(null);
    try {
      const result = await logHealthMeal({ text, date: date ?? undefined });
      setMeals((prev) => [...prev, ...result.entries]);
      setMealText("");
    } catch (err) {
      setMealError(err instanceof Error ? err.message : "Could not parse meal");
    } finally {
      setMealLogging(false);
    }
  }, [date, mealText, mealLogging]);

  const removeMeal = useCallback(async (id: number) => {
    setMeals((prev) => prev.filter((m) => m.id !== id));
    try {
      await deleteHealthMeal(id);
    } catch {
      setMealError("Could not delete meal");
    }
  }, []);

  const flush = useCallback(async () => {
    const payload = pending.current;
    pending.current = {};
    if (!Object.keys(payload).length) return;
    setStatus("saving");
    try {
      const result = await saveHealthCheckin({ ...payload, date: date ?? undefined });
      setEntry(result.entry);
      setStatus("saved");
      window.setTimeout(() => setStatus((current) => (current === "saved" ? "idle" : current)), 900);
    } catch {
      setStatus("error");
    }
  }, [date]);

  const queueSave = useCallback(
    (patch: HealthCheckinPayload) => {
      pending.current = { ...pending.current, ...patch };
      setEntry((prev) => {
        const base: Partial<HealthBodyEntry> = prev ?? {};
        return { ...base, ...patch } as HealthBodyEntry;
      });
      if (saveTimeout.current) window.clearTimeout(saveTimeout.current);
      saveTimeout.current = window.setTimeout(flush, 400);
    },
    [flush],
  );

  const hydration = entry?.hydration ?? 0;
  const weightText = useMemo(() => (entry?.weightLb ? String(entry.weightLb) : ""), [entry?.weightLb]);

  const statusLabel = (() => {
    if (loading) return "Loading";
    if (status === "saving") return "Saving";
    if (status === "saved") return "Saved";
    if (status === "error") return "Save failed";
    return "Idle";
  })();

  return (
    <article className="home-card checkin-card" aria-label="Daily check-in">
      <div className="home-card-heading">
        <div>
          <HeartPulse size={18} />
          <span>Daily check-in</span>
        </div>
        <small className={`checkin-status checkin-status-${status}`} aria-live="polite">
          {status === "saving" ? <Loader2 className="spin" size={12} /> : status === "saved" ? <Check size={12} /> : null}
          {statusLabel}
        </small>
      </div>

      <div className="checkin-grid">
        <div className="checkin-col">
          <div className="checkin-number-row">
            <label className="checkin-row-label" htmlFor="checkin-sleep">Sleep (hrs)</label>
            <input
              className="checkin-number"
              id="checkin-sleep"
              inputMode="decimal"
              onChange={(e) => {
                const trimmed = e.target.value.trim();
                queueSave({ sleepHours: trimmed === "" ? null : Number(trimmed) });
              }}
              placeholder="—"
              step="0.5"
              type="number"
              value={entry?.sleepHours ?? ""}
            />
          </div>
          <ScoreRow label="Sleep quality" onChange={(v) => queueSave({ sleepQuality: v })} value={entry?.sleepQuality ?? null} />
          <ScoreRow label="Energy" onChange={(v) => queueSave({ energy: v })} value={entry?.energy ?? null} />
          <ScoreRow label="Mood" onChange={(v) => queueSave({ moodScore: v })} value={entry?.moodScore ?? null} />
          <ScoreRow label="Focus" onChange={(v) => queueSave({ focus: v })} value={entry?.focus ?? null} />
          <ScoreRow label="Anxiety" onChange={(v) => queueSave({ anxiety: v })} value={entry?.anxiety ?? null} />
          <ScoreRow label="Clarity" onChange={(v) => queueSave({ clarity: v })} value={entry?.clarity ?? null} />
          <ScoreRow label="Motivation" onChange={(v) => queueSave({ motivation: v })} value={entry?.motivation ?? null} />
          <ScoreRow label="Soreness" onChange={(v) => queueSave({ soreness: v })} value={entry?.soreness ?? null} />
          <ScoreRow label="Stress" onChange={(v) => queueSave({ stress: v })} value={entry?.stress ?? null} />
        </div>

        <div className="checkin-col">
          <SegmentRow
            icon={<Users size={14} />}
            label="Social"
            onChange={(v) => queueSave({ social: v })}
            options={SOCIAL_OPTIONS}
            value={entry?.social ?? null}
          />
          <SegmentRow
            icon={<Zap size={14} />}
            label="Activity"
            onChange={(v) => queueSave({ activityLevel: v })}
            options={ACTIVITY_OPTIONS}
            value={entry?.activityLevel ?? null}
          />
          <SegmentRow
            icon={<Sun size={14} />}
            label="Sun"
            onChange={(v) => queueSave({ sunExposure: v })}
            options={SUN_OPTIONS}
            value={entry?.sunExposure ?? null}
          />

          <div className="checkin-toggle-row">
            {([
              ["Sick", "sick"],
              ["Alcohol", "alcohol"],
              ["Marijuana", "marijuana"],
            ] as const).map(([label, key]) => {
              const active = entry?.[key] === true;
              return (
                <button
                  aria-pressed={active}
                  className={`checkin-toggle ${active ? "active" : ""}`}
                  key={key}
                  onClick={() => queueSave({ [key]: !active } as HealthCheckinPayload)}
                  type="button"
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="checkin-counter-row">
            <span className="checkin-row-label">
              <Droplets size={14} />
              Hydration
            </span>
            <div className="checkin-counter">
              <button
                aria-label="Decrement hydration"
                onClick={() => queueSave({ hydration: Math.max(0, hydration - 1) })}
                type="button"
              >
                <Minus size={14} />
              </button>
              <strong>{hydration}</strong>
              <button
                aria-label="Increment hydration"
                onClick={() => queueSave({ hydration: hydration + 1 })}
                type="button"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className="checkin-number-row">
            <label className="checkin-row-label" htmlFor="checkin-weight">Weight (lb)</label>
            <input
              className="checkin-number"
              defaultValue={weightText}
              id="checkin-weight"
              inputMode="decimal"
              key={weightText}
              onBlur={(e) => {
                const trimmed = e.target.value.trim();
                queueSave({ weightLb: trimmed === "" ? null : Number(trimmed) });
              }}
              placeholder="—"
              step="0.1"
              type="number"
            />
          </div>
        </div>
      </div>

      <div className="checkin-food">
        <span className="checkin-row-label">
          <Utensils size={14} />
          Food
        </span>
        <div className="checkin-food-input">
          <textarea
            aria-label="What did you eat?"
            disabled={mealLogging}
            onChange={(e) => setMealText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submitMeal();
              }
            }}
            placeholder="What did you eat? e.g. oatmeal + protein for breakfast, chicken bowl for lunch…"
            rows={2}
            value={mealText}
          />
          <button
            aria-label="Log meal"
            disabled={!mealText.trim() || mealLogging}
            onClick={submitMeal}
            type="button"
          >
            {mealLogging ? <Loader2 className="spin" size={14} /> : <Send size={14} />}
          </button>
        </div>
        {mealError && <p className="checkin-food-error">{mealError}</p>}
        {meals.length > 0 && (
          <ul className="checkin-food-list">
            {meals.map((m) => {
              const parts: string[] = [];
              if (m.mealType) parts.push(m.mealType);
              if (m.caloriesEstimate !== null && m.caloriesEstimate !== undefined) parts.push(`${Math.round(m.caloriesEstimate)} kcal`);
              if (m.proteinGEstimate !== null && m.proteinGEstimate !== undefined) parts.push(`P ${Math.round(m.proteinGEstimate)}g`);
              if (m.carbsGEstimate !== null && m.carbsGEstimate !== undefined) parts.push(`C ${Math.round(m.carbsGEstimate)}g`);
              if (m.fatGEstimate !== null && m.fatGEstimate !== undefined) parts.push(`F ${Math.round(m.fatGEstimate)}g`);
              if (m.fiberGEstimate !== null && m.fiberGEstimate !== undefined) parts.push(`Fb ${Math.round(m.fiberGEstimate)}g`);
              return (
                <li key={m.id}>
                  <div>
                    <strong>{m.summary || m.description}</strong>
                    {parts.length > 0 && <small>{parts.join(" · ")}</small>}
                  </div>
                  <button aria-label="Remove meal" onClick={() => removeMeal(m.id)} type="button">
                    <X size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="checkin-notes">
        <label className="checkin-row-label" htmlFor="checkin-notes">Notes</label>
        <textarea
          defaultValue={entry?.notes ?? ""}
          id="checkin-notes"
          key={entry?.notes ?? ""}
          onBlur={(e) => {
            const trimmed = e.target.value.trim();
            queueSave({ notes: trimmed === "" ? null : trimmed });
          }}
          placeholder="Anything else worth remembering about today?"
          rows={3}
        />
      </div>
    </article>
  );
}
