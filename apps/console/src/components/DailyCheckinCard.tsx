import {
  Check,
  Droplets,
  HeartPulse,
  Loader2,
  Minus,
  Plus,
  Sun,
  Toilet,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type HealthCheckinPayload,
  deleteHealthBowel,
  loadHealthBowel,
  loadHealthCheckin,
  logHealthBowel,
  saveHealthCheckin,
} from "../lib/healthData";
import type { ActivityLevel, HealthBodyEntry, HealthBowelEntry, SocialLevel, SunLevel } from "../types";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const SCORE_LABELS = ["1", "2", "3", "4", "5"];
const SOCIAL_OPTIONS: SocialLevel[] = ["alone", "light", "heavy"];
const ACTIVITY_OPTIONS: ActivityLevel[] = ["sedentary", "mixed", "active"];
const SUN_OPTIONS: SunLevel[] = ["none", "some", "lots"];

const BRISTOL_LABELS: Record<number, string> = {
  1: "Hard lumps",
  2: "Lumpy",
  3: "Cracked",
  4: "Smooth",
  5: "Soft blobs",
  6: "Mushy",
  7: "Liquid",
};

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
  const [bowels, setBowels] = useState<HealthBowelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const saveTimeout = useRef<number | null>(null);
  const pending = useRef<HealthCheckinPayload>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      loadHealthCheckin(date ?? undefined),
      loadHealthBowel(date ?? undefined),
    ])
      .then(([checkin, bowelResult]) => {
        if (!active) return;
        setEntry(checkin.entry);
        setBowels(bowelResult.entries);
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

  const tapBowel = useCallback(
    async (bristol: number) => {
      try {
        const result = await logHealthBowel({ bristol, date: date ?? undefined });
        setBowels((prev) => [...prev, result.entry]);
      } catch {
        setStatus("error");
      }
    },
    [date],
  );

  const removeBowel = useCallback(async (id: number) => {
    setBowels((prev) => prev.filter((b) => b.id !== id));
    try {
      await deleteHealthBowel(id);
    } catch {
      setStatus("error");
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

      <div className="checkin-bowel">
        <span className="checkin-row-label">
          <Toilet size={14} />
          Bowel (Bristol)
        </span>
        <div className="checkin-score-buttons">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button
              aria-label={`Bristol ${n} ${BRISTOL_LABELS[n]}`}
              key={n}
              onClick={() => tapBowel(n)}
              title={BRISTOL_LABELS[n]}
              type="button"
            >
              {n}
            </button>
          ))}
        </div>
        {bowels.length > 0 && (
          <ul className="checkin-tap-log">
            {bowels.map((b) => (
              <li key={b.id}>
                <span>Bristol {b.bristol} · {BRISTOL_LABELS[b.bristol] ?? ""}</span>
                <button aria-label="Remove" onClick={() => removeBowel(b.id)} type="button">
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
