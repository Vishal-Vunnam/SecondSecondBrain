import { Dumbbell, HeartPulse, LoaderCircle, Send, Utensils, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { type HealthCalendarDay, captureHealthLog, loadHealthCalendar } from "../lib/healthData";

type Toast = { kind: "info" | "error"; text: string };

function scoreColor(score: number) {
  if (score === 0) return "var(--muted)";
  if (score < 34) return "#e05263";
  if (score < 67) return "var(--accent)";
  return "#3ecf8e";
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(y, m - 1, d));
}

function formatDayLabel(dateStr: string, today: string) {
  if (dateStr === today) return "Today";
  const [y, m, d] = dateStr.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000);
  if (diff === 1) return "Yesterday";
  return formatDate(dateStr);
}

function groupByMonth(calendar: HealthCalendarDay[]) {
  const map = new Map<string, HealthCalendarDay[]>();
  for (const day of calendar) {
    const key = day.date.slice(0, 7);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(day);
  }
  return Array.from(map.entries()).map(([key, days]) => {
    const [y, m] = key.split("-").map(Number);
    const label = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
    return { key, label, days };
  });
}

function DayStrip({ days, selectedDate, today, onSelect }: {
  days: HealthCalendarDay[];
  selectedDate: string | null;
  today: string;
  onSelect: (date: string) => void;
}) {
  if (!days.length) return null;
  return (
    <div className="hlog-strip" role="listbox" aria-label="Days">
      {days.map((d) => {
        const isSelected = d.date === selectedDate;
        const isToday = d.date === today;
        const isFuture = d.date > today;
        const dayNum = Number(d.date.slice(8));
        return (
          <button
            key={d.date}
            type="button"
            role="option"
            aria-selected={isSelected}
            disabled={isFuture}
            className={`hlog-cell${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}${isFuture ? " is-future" : ""}`}
            onClick={() => onSelect(d.date)}
            title={`${formatDate(d.date)} — ${d.score || 0}`}
          >
            <span
              className="hlog-bubble"
              style={{ borderColor: isFuture ? "var(--line)" : scoreColor(d.score) }}
            >
              {dayNum}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function HealthLogPanel() {
  const [calendar, setCalendar] = useState<HealthCalendarDay[]>([]);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async (keepSelection = false) => {
    try {
      const data = await loadHealthCalendar(90);
      setCalendar(data.calendar);
      setToday(data.today);
      if (!keepSelection) {
        setSelectedMonth(data.today.slice(0, 7));
        setSelectedDate(data.today);
      }
    } catch (err) {
      setToast({ kind: "error", text: err instanceof Error ? err.message : "Could not load calendar" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, []);

  const months = groupByMonth(calendar);
  const activeDays = months.find((m) => m.key === selectedMonth)?.days ?? [];
  const selectedDay = calendar.find((d) => d.date === selectedDate) ?? null;
  const isBackfill = !!selectedDate && selectedDate !== today;

  function handleMonthChange(key: string) {
    setSelectedMonth(key);
    const days = months.find((m) => m.key === key)?.days ?? [];
    const inMonth = days.find((d) => d.date === today);
    setSelectedDate(inMonth ? today : days[days.length - 1]?.date ?? null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setToast(null);
    try {
      const result = await captureHealthLog(text, selectedDate ?? undefined);
      setToast({ kind: "info", text: result.confirmation });
      await refresh(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not log entry";
      setToast({ kind: "error", text: msg });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="health-panel" aria-label="Health log">
      <div className="health-shell">
        <header className="health-heading">
          <div>
            <span>Health</span>
            <h3>Log</h3>
          </div>
          {/* Month picker */}
          {!loading && months.length > 0 && (
            <select
              className="hlog-month-select"
              value={selectedMonth ?? ""}
              onChange={(e) => handleMonthChange(e.target.value)}
            >
              {months.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          )}
        </header>

        {loading ? (
          <div className="hlog-loading"><LoaderCircle className="spin" size={18} /></div>
        ) : (
          <DayStrip days={activeDays} selectedDate={selectedDate} today={today} onSelect={setSelectedDate} />
        )}

        {/* Selected day header */}
        {selectedDay && (
          <div className="hlog-day-header">
            <div className="hlog-day-title">
              <span>{formatDayLabel(selectedDay.date, today)}</span>
              <strong>{formatDate(selectedDay.date)}</strong>
            </div>
            <div className="hlog-day-cats">
              <span className={selectedDay.hasMeal ? "on" : "off"}><Utensils size={12} />Meal</span>
              <span className={selectedDay.hasWorkout ? "on" : "off"}><Dumbbell size={12} />Workout</span>
              <span className={selectedDay.hasBody ? "on" : "off"}><HeartPulse size={12} />Body</span>
            </div>
            {isBackfill && (
              <button className="hlog-back-btn" onClick={() => { setSelectedDate(today); setSelectedMonth(today.slice(0, 7)); }} type="button">
                <X size={12} />Today
              </button>
            )}
          </div>
        )}

        <form className="hlog-form" onSubmit={submit}>
          {isBackfill && <div className="hlog-backfill-badge">Logging for {selectedDate ? formatDate(selectedDate) : ""}</div>}
          {toast && (
            <div className={`hlog-toast hlog-toast-${toast.kind}`} role="status">
              <p>{toast.text}</p>
              <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}><X size={14} /></button>
            </div>
          )}
          <div className="hlog-input-row">
            <textarea
              className="hlog-input"
              disabled={sending}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(e as unknown as FormEvent); } }}
              placeholder={isBackfill ? "What did you eat, do, and feel that day?" : "Slept 7h, eggs for breakfast, lifted chest 45 min, energy 4/5…"}
              rows={5}
              value={input}
            />
            <button className="hlog-send" disabled={sending || !input.trim()} type="submit">
              {sending ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
