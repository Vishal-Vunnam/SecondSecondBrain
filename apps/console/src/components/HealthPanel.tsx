import { Activity, Dumbbell, HeartPulse, LoaderCircle, Mic, Pencil, Plus, RefreshCw, Send, Trash2, Utensils, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { captureHealth, createHealthCommitment, deleteHealthEntry, loadHealthOverview, updateHealthEntry } from "../lib/healthData";
import type { HealthCommitmentEntry, HealthEntry, HealthEntryType, HealthOverview } from "../types";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: {
    transcript: string;
  };
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

type WindowWithSpeech = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

type EntryDraft = {
  type: HealthEntryType;
  capturedAt: string;
  title: string;
  summary: string;
  description: string;
  mealType: string;
  proteinGEstimate: string;
  caloriesEstimate: string;
  hunger: string;
  fullness: string;
  energy: string;
  digestion: string;
  gassiness: string;
  workoutType: string;
  focus: string;
  muscles: string;
  durationMinutes: string;
  intensity: string;
  energyBefore: string;
  energyAfter: string;
  performance: string;
  sleepHours: string;
  sleepQuality: string;
  soreness: string;
  moodScore: string;
  stress: string;
  hydration: string;
  mood: string;
  pain: string;
  symptoms: string;
  weightLb: string;
  notes: string;
  cadence: string;
  targetCount: string;
  completedCount: string;
  reviewDate: string;
  status: string;
};

function formatNumber(value: number | null, suffix = "") {
  if (value === null) return "--";
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
}

function compactNumber(value: number | null) {
  if (value === null) return "--";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function entryLabel(entry: HealthEntry) {
  if (entry.type === "commitment") return entry.title;
  if (entry.type === "body") return entry.summary || entry.notes || "Body check-in";
  if (entry.summary) return entry.summary;
  return entry.description;
}

function entryMeta(entry: HealthEntry) {
  if (entry.type === "commitment") {
    return [entry.cadence, entry.reviewDate ? `review ${entry.reviewDate}` : null, entry.status].filter(Boolean).join(" / ");
  }
  return [formatDateTime(entry.capturedAt), entry.source].filter(Boolean).join(" / ");
}

function draftFromEntry(entry: HealthEntry): EntryDraft {
  const base = {
    caloriesEstimate: "",
    cadence: "",
    capturedAt: "capturedAt" in entry ? toDateTimeLocal(entry.capturedAt) : "",
    completedCount: "",
    description: "",
    digestion: "",
    durationMinutes: "",
    energy: "",
    energyAfter: "",
    energyBefore: "",
    focus: "",
    fullness: "",
    gassiness: "",
    hunger: "",
    hydration: "",
    intensity: "",
    mealType: "",
    mood: "",
    moodScore: "",
    muscles: "",
    notes: "",
    pain: "",
    performance: "",
    proteinGEstimate: "",
    reviewDate: "",
    sleepHours: "",
    sleepQuality: "",
    soreness: "",
    status: "",
    summary: "",
    stress: "",
    symptoms: "",
    targetCount: "",
    title: "",
    type: entry.type,
    weightLb: "",
    workoutType: "",
  };

  if (entry.type === "meal") {
    return {
      ...base,
      caloriesEstimate: entry.caloriesEstimate?.toString() ?? "",
      description: entry.description,
      summary: entry.summary ?? "",
      digestion: entry.digestion?.toString() ?? "",
      energy: entry.energy?.toString() ?? "",
      fullness: entry.fullness?.toString() ?? "",
      gassiness: entry.gassiness?.toString() ?? "",
      hunger: entry.hunger?.toString() ?? "",
      mealType: entry.mealType ?? "",
      notes: entry.notes ?? "",
      proteinGEstimate: entry.proteinGEstimate?.toString() ?? "",
    };
  }

  if (entry.type === "workout") {
    return {
      ...base,
      description: entry.description,
      summary: entry.summary ?? "",
      durationMinutes: entry.durationMinutes?.toString() ?? "",
      energyAfter: entry.energyAfter?.toString() ?? "",
      energyBefore: entry.energyBefore?.toString() ?? "",
      focus: entry.focus ?? "",
      intensity: entry.intensity?.toString() ?? "",
      muscles: entry.muscles ?? "",
      notes: entry.notes ?? "",
      performance: entry.performance?.toString() ?? "",
      workoutType: entry.workoutType ?? "",
    };
  }

  if (entry.type === "body") {
    return {
      ...base,
      energy: entry.energy?.toString() ?? "",
      summary: entry.summary ?? "",
      gassiness: entry.gassiness?.toString() ?? "",
      hydration: entry.hydration?.toString() ?? "",
      mood: entry.mood ?? "",
      moodScore: entry.moodScore?.toString() ?? "",
      notes: entry.notes ?? "",
      pain: entry.pain ?? "",
      sleepHours: entry.sleepHours?.toString() ?? "",
      sleepQuality: entry.sleepQuality?.toString() ?? "",
      soreness: entry.soreness?.toString() ?? "",
      stress: entry.stress?.toString() ?? "",
      symptoms: entry.symptoms ?? "",
      weightLb: entry.weightLb?.toString() ?? "",
    };
  }

  return {
    ...base,
    cadence: entry.cadence,
    completedCount: entry.completedCount.toString(),
    description: entry.description ?? "",
    reviewDate: entry.reviewDate ?? "",
    status: entry.status,
    targetCount: entry.targetCount?.toString() ?? "",
    title: entry.title,
  };
}

function payloadFromDraft(draft: EntryDraft) {
  if (draft.type === "commitment") {
    return {
      cadence: draft.cadence,
      completedCount: numberOrNull(draft.completedCount),
      description: draft.description,
      reviewDate: draft.reviewDate,
      status: draft.status,
      targetCount: numberOrNull(draft.targetCount),
      title: draft.title,
      type: draft.type,
    };
  }

  const base = {
    capturedAt: fromDateTimeLocal(draft.capturedAt),
    description: draft.description,
    notes: draft.notes,
    summary: draft.summary,
    type: draft.type,
  };

  if (draft.type === "meal") {
    return {
      ...base,
      caloriesEstimate: numberOrNull(draft.caloriesEstimate),
      digestion: numberOrNull(draft.digestion),
      energy: numberOrNull(draft.energy),
      fullness: numberOrNull(draft.fullness),
      gassiness: numberOrNull(draft.gassiness),
      hunger: numberOrNull(draft.hunger),
      mealType: draft.mealType,
      proteinGEstimate: numberOrNull(draft.proteinGEstimate),
    };
  }

  if (draft.type === "workout") {
    return {
      ...base,
      durationMinutes: numberOrNull(draft.durationMinutes),
      energyAfter: numberOrNull(draft.energyAfter),
      energyBefore: numberOrNull(draft.energyBefore),
      focus: draft.focus,
      intensity: numberOrNull(draft.intensity),
      muscles: draft.muscles,
      performance: numberOrNull(draft.performance),
      workoutType: draft.workoutType,
    };
  }

  return {
    ...base,
    energy: numberOrNull(draft.energy),
    gassiness: numberOrNull(draft.gassiness),
    hydration: numberOrNull(draft.hydration),
    mood: draft.mood,
    moodScore: numberOrNull(draft.moodScore),
    pain: draft.pain,
    sleepHours: numberOrNull(draft.sleepHours),
    sleepQuality: numberOrNull(draft.sleepQuality),
    soreness: numberOrNull(draft.soreness),
    stress: numberOrNull(draft.stress),
    symptoms: draft.symptoms,
    weightLb: numberOrNull(draft.weightLb),
  };
}

function HealthEntryIcon({ type }: { type: HealthEntryType }) {
  if (type === "meal") return <Utensils size={16} />;
  if (type === "workout") return <Dumbbell size={16} />;
  if (type === "body") return <HeartPulse size={16} />;
  return <Activity size={16} />;
}

function HealthEntryCard({ entry, onChanged }: { entry: HealthEntry; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EntryDraft>(() => draftFromEntry(entry));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(draftFromEntry(entry));
    setEditing(false);
    setError(null);
  }, [entry]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateHealthEntry(entry.type, entry.id, payloadFromDraft(draft));
      await onChanged();
      setEditing(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not update entry");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this health entry?")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteHealthEntry(entry.type, entry.id);
      await onChanged();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not delete entry");
    } finally {
      setSaving(false);
    }
  }

  const isLog = entry.type !== "commitment";

  return (
    <article className="health-entry-row">
      <div className={`health-entry-icon ${entry.type}`}>
        <HealthEntryIcon type={entry.type} />
      </div>
      <div className="health-entry-main">
        {!editing ? (
          <>
            <div className="health-entry-copy">
              <strong>{entryLabel(entry)}</strong>
              <span>{entryMeta(entry)}</span>
              {"summary" in entry && entry.summary && entryLabel(entry) !== entry.summary ? <p>{entry.summary}</p> : null}
              {"notes" in entry && entry.notes ? <small>{entry.notes}</small> : null}
            </div>
            {entry.type === "meal" && (
              <div className="health-entry-facts">
                <span>{entry.mealType || "meal"}</span>
                <span>{compactNumber(entry.proteinGEstimate)}g protein</span>
                <span>{compactNumber(entry.caloriesEstimate)} cal</span>
                <span>hungry {formatNumber(entry.hunger)}/5</span>
                <span>gassy {formatNumber(entry.gassiness)}/5</span>
              </div>
            )}
            {entry.type === "workout" && (
              <div className="health-entry-facts">
                <span>{entry.workoutType || entry.focus || "training"}</span>
                {entry.muscles ? <span>{entry.muscles}</span> : null}
                <span>{formatNumber(entry.durationMinutes, " min")}</span>
                <span>intensity {formatNumber(entry.intensity)}/5</span>
                <span>performance {formatNumber(entry.performance)}/5</span>
              </div>
            )}
            {entry.type === "body" && (
              <div className="health-entry-facts">
                <span>{formatNumber(entry.sleepHours, "h sleep")}</span>
                <span>energy {formatNumber(entry.energy)}/5</span>
                <span>mood {formatNumber(entry.moodScore)}/5</span>
                <span>stress {formatNumber(entry.stress)}/5</span>
                <span>sore {formatNumber(entry.soreness)}/5</span>
                <span>gassy {formatNumber(entry.gassiness)}/5</span>
              </div>
            )}
            {entry.type === "commitment" && (
              <div className="health-entry-facts">
                <span>{entry.completedCount}/{entry.targetCount ?? "--"}</span>
                <span>{entry.reviewDate ?? "no review date"}</span>
              </div>
            )}
          </>
        ) : (
          <div className="health-edit-grid">
            {isLog ? (
              <>
                <label>
                  <span>Time</span>
                  <input type="datetime-local" value={draft.capturedAt} onChange={(event) => setDraft({ ...draft, capturedAt: event.target.value })} />
                </label>
                <label>
                  <span>Type</span>
                  <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as HealthEntryType })}>
                    <option value="meal">Meal</option>
                    <option value="workout">Workout</option>
                    <option value="body">Body</option>
                  </select>
                </label>
                {draft.type !== "body" && (
                  <label className="wide">
                    <span>Description</span>
                    <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
                  </label>
                )}
                <label className="wide">
                  <span>Summary</span>
                  <input value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
                </label>
              </>
            ) : (
              <>
                <label className="wide">
                  <span>Title</span>
                  <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
                </label>
                <label>
                  <span>Status</span>
                  <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="done">Done</option>
                  </select>
                </label>
              </>
            )}
            {draft.type === "meal" && (
              <>
                <label>
                  <span>Meal</span>
                  <select value={draft.mealType} onChange={(event) => setDraft({ ...draft, mealType: event.target.value })}>
                    <option value="">Loose</option>
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                    <option value="snack">Snack</option>
                    <option value="drink">Drink</option>
                  </select>
                </label>
                <label>
                  <span>Protein</span>
                  <input inputMode="decimal" value={draft.proteinGEstimate} onChange={(event) => setDraft({ ...draft, proteinGEstimate: event.target.value })} />
                </label>
                <label>
                  <span>Calories</span>
                  <input inputMode="decimal" value={draft.caloriesEstimate} onChange={(event) => setDraft({ ...draft, caloriesEstimate: event.target.value })} />
                </label>
                <label>
                  <span>Hunger</span>
                  <input inputMode="numeric" value={draft.hunger} onChange={(event) => setDraft({ ...draft, hunger: event.target.value })} />
                </label>
                <label>
                  <span>Fullness</span>
                  <input inputMode="numeric" value={draft.fullness} onChange={(event) => setDraft({ ...draft, fullness: event.target.value })} />
                </label>
                <label>
                  <span>Energy after</span>
                  <input inputMode="numeric" value={draft.energy} onChange={(event) => setDraft({ ...draft, energy: event.target.value })} />
                </label>
                <label>
                  <span>Digestion</span>
                  <input inputMode="numeric" value={draft.digestion} onChange={(event) => setDraft({ ...draft, digestion: event.target.value })} />
                </label>
                <label>
                  <span>Gassiness</span>
                  <input inputMode="numeric" value={draft.gassiness} onChange={(event) => setDraft({ ...draft, gassiness: event.target.value })} />
                </label>
              </>
            )}
            {draft.type === "workout" && (
              <>
                <label>
                  <span>Kind</span>
                  <input value={draft.workoutType} onChange={(event) => setDraft({ ...draft, workoutType: event.target.value })} />
                </label>
                <label>
                  <span>Focus</span>
                  <input value={draft.focus} onChange={(event) => setDraft({ ...draft, focus: event.target.value })} />
                </label>
                <label>
                  <span>Muscles</span>
                  <input value={draft.muscles} onChange={(event) => setDraft({ ...draft, muscles: event.target.value })} />
                </label>
                <label>
                  <span>Minutes</span>
                  <input inputMode="numeric" value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value })} />
                </label>
                <label>
                  <span>Intensity</span>
                  <input inputMode="numeric" value={draft.intensity} onChange={(event) => setDraft({ ...draft, intensity: event.target.value })} />
                </label>
                <label>
                  <span>After</span>
                  <input inputMode="numeric" value={draft.energyAfter} onChange={(event) => setDraft({ ...draft, energyAfter: event.target.value })} />
                </label>
                <label>
                  <span>Performance</span>
                  <input inputMode="numeric" value={draft.performance} onChange={(event) => setDraft({ ...draft, performance: event.target.value })} />
                </label>
              </>
            )}
            {draft.type === "body" && (
              <>
                <label>
                  <span>Sleep</span>
                  <input inputMode="decimal" value={draft.sleepHours} onChange={(event) => setDraft({ ...draft, sleepHours: event.target.value })} />
                </label>
                <label>
                  <span>Sleep quality</span>
                  <input inputMode="numeric" value={draft.sleepQuality} onChange={(event) => setDraft({ ...draft, sleepQuality: event.target.value })} />
                </label>
                <label>
                  <span>Energy</span>
                  <input inputMode="numeric" value={draft.energy} onChange={(event) => setDraft({ ...draft, energy: event.target.value })} />
                </label>
                <label>
                  <span>Mood score</span>
                  <input inputMode="numeric" value={draft.moodScore} onChange={(event) => setDraft({ ...draft, moodScore: event.target.value })} />
                </label>
                <label>
                  <span>Stress</span>
                  <input inputMode="numeric" value={draft.stress} onChange={(event) => setDraft({ ...draft, stress: event.target.value })} />
                </label>
                <label>
                  <span>Soreness</span>
                  <input inputMode="numeric" value={draft.soreness} onChange={(event) => setDraft({ ...draft, soreness: event.target.value })} />
                </label>
                <label>
                  <span>Hydration</span>
                  <input inputMode="numeric" value={draft.hydration} onChange={(event) => setDraft({ ...draft, hydration: event.target.value })} />
                </label>
                <label>
                  <span>Gassiness</span>
                  <input inputMode="numeric" value={draft.gassiness} onChange={(event) => setDraft({ ...draft, gassiness: event.target.value })} />
                </label>
                <label>
                  <span>Mood</span>
                  <input value={draft.mood} onChange={(event) => setDraft({ ...draft, mood: event.target.value })} />
                </label>
                <label>
                  <span>Pain</span>
                  <input value={draft.pain} onChange={(event) => setDraft({ ...draft, pain: event.target.value })} />
                </label>
                <label>
                  <span>Symptoms</span>
                  <input value={draft.symptoms} onChange={(event) => setDraft({ ...draft, symptoms: event.target.value })} />
                </label>
              </>
            )}
            {draft.type === "commitment" && (
              <>
                <label>
                  <span>Cadence</span>
                  <input value={draft.cadence} onChange={(event) => setDraft({ ...draft, cadence: event.target.value })} />
                </label>
                <label>
                  <span>Target</span>
                  <input inputMode="numeric" value={draft.targetCount} onChange={(event) => setDraft({ ...draft, targetCount: event.target.value })} />
                </label>
                <label>
                  <span>Done</span>
                  <input inputMode="numeric" value={draft.completedCount} onChange={(event) => setDraft({ ...draft, completedCount: event.target.value })} />
                </label>
                <label>
                  <span>Review</span>
                  <input type="date" value={draft.reviewDate} onChange={(event) => setDraft({ ...draft, reviewDate: event.target.value })} />
                </label>
              </>
            )}
            <label className="wide">
              <span>{draft.type === "commitment" ? "Description" : "Notes"}</span>
              <input
                value={draft.type === "commitment" ? draft.description : draft.notes}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    description: draft.type === "commitment" || draft.type === "body" ? event.target.value : draft.description,
                    notes: draft.type === "commitment" ? draft.notes : event.target.value,
                  })
                }
              />
            </label>
          </div>
        )}
        {error ? <p className="health-error">{error}</p> : null}
      </div>
      <div className="health-entry-actions">
        {editing ? (
          <>
            <button disabled={saving} onClick={save} type="button">
              {saving ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}
            </button>
            <button disabled={saving} onClick={() => setEditing(false)} type="button">
              <X size={15} />
            </button>
          </>
        ) : (
          <>
            <button disabled={saving} onClick={() => setEditing(true)} type="button">
              <Pencil size={15} />
            </button>
            <button disabled={saving} onClick={remove} type="button">
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function latestBodySummary(body: HealthOverview["today"]["body"]) {
  if (!body.count) return "No body check-in";
  return [
    body.sleepHours === null ? null : `${body.sleepHours}h sleep`,
    body.sleepQuality === null ? null : `${body.sleepQuality}/5 sleep quality`,
    body.energy === null ? null : `${body.energy}/5 energy`,
    body.moodScore === null ? null : `${body.moodScore}/5 mood`,
    body.stress === null ? null : `${body.stress}/5 stress`,
    body.mood,
  ]
    .filter(Boolean)
    .join(" / ");
}

export function HealthPanel() {
  const [overview, setOverview] = useState<HealthOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [commitmentTitle, setCommitmentTitle] = useState("");
  const [commitmentTarget, setCommitmentTarget] = useState("");
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const loadOverview = useCallback(async () => {
    setRefreshing(true);
    try {
      const nextOverview = await loadHealthOverview();
      setOverview(nextOverview);
      setCaptureError(null);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "Could not load health overview");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  async function submitCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!captureText.trim()) return;

    setCapturing(true);
    setCaptureError(null);
    setConfirmation(null);
    try {
      const response = await captureHealth(captureText);
      setConfirmation(response.confirmation);
      setCaptureText("");
      await loadOverview();
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "Could not capture health update");
    } finally {
      setCapturing(false);
    }
  }

  function startDictation() {
    const SpeechRecognition = (window as WindowWithSpeech).SpeechRecognition ?? (window as WindowWithSpeech).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setCaptureError("Browser dictation is unavailable here. Use the text box or the iPhone Shortcut.");
      textAreaRef.current?.focus();
      return;
    }

    const baseText = captureText.trim();
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const segments: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        segments.push(event.results[index][0].transcript);
      }
      setCaptureText([baseText, segments.join(" ")].filter(Boolean).join(" "));
    };
    recognition.onerror = (event) => {
      setCaptureError(event.error ? `Dictation stopped: ${event.error}` : "Dictation stopped");
      setDictating(false);
    };
    recognition.onend = () => setDictating(false);
    recognitionRef.current = recognition;
    setDictating(true);
    recognition.start();
  }

  async function addCommitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!commitmentTitle.trim()) return;
    setCaptureError(null);
    try {
      await createHealthCommitment({
        cadence: "weekly",
        targetCount: numberOrNull(commitmentTarget),
        title: commitmentTitle,
      });
      setCommitmentTitle("");
      setCommitmentTarget("");
      await loadOverview();
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "Could not create commitment");
    }
  }

  const today = overview?.today;
  const recent = overview?.recent ?? [];
  const commitments = overview?.commitments ?? [];
  const generatedLabel = useMemo(() => (overview ? formatDateTime(overview.generatedAt) : ""), [overview]);

  return (
    <section className="health-panel" aria-label="Health overview">
      <div className="health-shell">
        <header className="health-heading">
          <div>
            <span>Health</span>
            <h3>Overview</h3>
          </div>
          <button disabled={refreshing} onClick={loadOverview} type="button">
            <RefreshCw className={refreshing ? "spin" : ""} size={15} />
            Refresh
          </button>
        </header>

        <form className="health-capture" onSubmit={submitCapture}>
          <div className="health-capture-toolbar">
            <button className={dictating ? "active" : ""} onClick={startDictation} type="button">
              <Mic size={18} />
              {dictating ? "Listening" : "Voice"}
            </button>
            <span>{generatedLabel || "Ready"}</span>
          </div>
          <textarea
            ref={textAreaRef}
            value={captureText}
            onChange={(event) => setCaptureText(event.target.value)}
            placeholder="Slept 6h20, quality 2. Eggs and yogurt for breakfast, chicken bowl lunch, pasta dinner, gassy after dinner. Lifted legs 45 min. Energy 3, mood calm, stress 3, sore legs, knee tight because hips felt tight."
          />
          <div className="health-capture-actions">
            <button disabled={capturing || !captureText.trim()} type="submit">
              {capturing ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
              Capture
            </button>
          </div>
        </form>

        {confirmation ? <p className="health-confirmation">{confirmation}</p> : null}
        {captureError ? <p className="health-error">{captureError}</p> : null}

        <div className="health-today-grid" aria-busy={loading}>
          <article className="health-today-card">
            <Utensils size={18} />
            <span>Food</span>
            <strong>{today?.meals.count ?? 0}</strong>
            <p>
              {compactNumber(today?.meals.proteinGEstimate ?? null)}g protein / {compactNumber(today?.meals.caloriesEstimate ?? null)} cal
            </p>
            <small>{today?.meals.lastDescription ?? "No meals logged"}</small>
          </article>
          <article className="health-today-card">
            <Dumbbell size={18} />
            <span>Training</span>
            <strong>{today?.workouts.count ?? 0}</strong>
            <p>{formatNumber(today?.workouts.durationMinutes ?? null, " min")} / intensity {formatNumber(today?.workouts.averageIntensity ?? null)}/5</p>
            <small>{today?.workouts.lastDescription ?? "No workout logged"}</small>
          </article>
          <article className="health-today-card">
            <HeartPulse size={18} />
            <span>Body</span>
            <strong>{today?.body.count ?? 0}</strong>
            <p>{today ? latestBodySummary(today.body) : "Loading"}</p>
            <small>
              {[
                today?.body.soreness === null ? null : `Soreness ${today?.body.soreness}/5`,
                today?.body.gassiness === null ? null : `Gassiness ${today?.body.gassiness}/5`,
                today?.body.pain ? `Pain: ${today.body.pain}` : null,
              ]
                .filter(Boolean)
                .join(" / ") || "No body details"}
            </small>
          </article>
          <article className="health-today-card">
            <Activity size={18} />
            <span>Commitments</span>
            <strong>{today?.commitments.activeCount ?? 0}</strong>
            <p>{today?.commitments.dueCount ?? 0} due for review</p>
            <small>{today?.commitments.next?.title ?? "No active commitment"}</small>
          </article>
        </div>

        <div className="health-lower-grid">
          <section className="health-insights">
            <div className="health-section-heading">
              <span>Patterns</span>
            </div>
            {overview?.insights.length ? overview.insights.map((insight) => <p key={insight}>{insight}</p>) : <p>No patterns yet.</p>}
          </section>

          <section className="health-commitments">
            <div className="health-section-heading">
              <span>Commitments</span>
            </div>
            <form className="health-commitment-form" onSubmit={addCommitment}>
              <input value={commitmentTitle} onChange={(event) => setCommitmentTitle(event.target.value)} placeholder="Weekly choice" />
              <input inputMode="numeric" value={commitmentTarget} onChange={(event) => setCommitmentTarget(event.target.value)} placeholder="Target" />
              <button disabled={!commitmentTitle.trim()} type="submit" aria-label="Add commitment">
                <Plus size={15} />
              </button>
            </form>
            <div className="health-commitment-list">
              {commitments.length ? (
                commitments.slice(0, 4).map((commitment: HealthCommitmentEntry) => (
                  <div key={commitment.id}>
                    <strong>{commitment.title}</strong>
                    <span>{commitment.completedCount}/{commitment.targetCount ?? "--"} / {commitment.cadence}</span>
                  </div>
                ))
              ) : (
                <p>No commitments yet.</p>
              )}
            </div>
          </section>
        </div>

        <section className="health-recent">
          <div className="health-section-heading">
            <span>Recent</span>
          </div>
          {recent.length ? (
            <div className="health-entry-list">
              {recent.map((entry) => (
                <HealthEntryCard entry={entry} key={`${entry.type}-${entry.id}`} onChanged={loadOverview} />
              ))}
            </div>
          ) : (
            <p className="health-empty">No health entries yet.</p>
          )}
        </section>
      </div>
    </section>
  );
}
