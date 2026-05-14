import { LoaderCircle, RefreshCw, Utensils } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { loadFoodAlignment } from "../lib/healthData";
import type { FoodAlignmentDay, FoodAlignmentRead, FoodAlignmentResponse } from "../types";

type FoodAlignmentCardProps = {
  date?: string | null;
  refreshKey?: number;
};

const READ_SPECS: Array<{
  key: keyof FoodAlignmentResponse["reads"];
  label: string;
  color: string;
}> = [
  { key: "focus", label: "Focus", color: "var(--teal)" },
  { key: "energy", label: "Energy", color: "var(--olive)" },
  { key: "nutrients", label: "Nutrients", color: "var(--orange)" },
  { key: "longevity", label: "Longevity", color: "var(--mist)" },
];

function labelStatus(status: string) {
  return status.replace(/[_-]/g, " ");
}

function grams(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}g`;
}

function activeContextLabels(data: FoodAlignmentResponse) {
  const labels: string[] = [];
  if (data.contextModifiers.sleepLow) labels.push("low sleep");
  if (data.contextModifiers.stressHigh) labels.push("high stress");
  if (data.contextModifiers.alcoholYesterday) labels.push("alcohol yesterday");
  if (data.contextModifiers.marijuanaYesterday) labels.push("marijuana yesterday");
  if (data.contextModifiers.sickTodayOrYesterday) labels.push("sick");
  if (data.contextModifiers.heavyTraining) labels.push("heavy training");
  return labels;
}

function WeeklyProteinLine({ days }: { days: FoodAlignmentDay[] }) {
  const width = 700;
  const height = 96;
  const padY = 10;
  const points = days.map((day, index) => {
    const value = day.mealCount ? day.proteinTotal ?? 0 : null;
    const x = days.length === 1 ? width / 2 : (index / (days.length - 1)) * width;
    return { x, value };
  });
  const numericValues = points.map((point) => point.value).filter((value): value is number => value !== null && value > 0);
  if (numericValues.length < 2) return null;
  const max = Math.max(...numericValues);
  const min = Math.min(...numericValues);
  const span = Math.max(1, max - min);
  const yFor = (value: number) => height - padY - ((value - min) / span) * (height - padY * 2);
  const projected = points.map((point) => (point.value === null ? null : { x: point.x, y: yFor(point.value) }));
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const point of projected) {
    if (point) {
      current.push(point);
    } else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);
  const path = (pts: Array<{ x: number; y: number }>) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area = (pts: Array<{ x: number; y: number }>) =>
    `${path(pts)} L${pts[pts.length - 1].x.toFixed(2)},${height} L${pts[0].x.toFixed(2)},${height} Z`;
  const gradientId = "food-alignment-protein-fill";

  return (
    <svg
      className="food-alignment-ribbon"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--olive)" stopOpacity={0.28} />
          <stop offset="100%" stopColor="var(--olive)" stopOpacity={0} />
        </linearGradient>
      </defs>
      {segments.map((segment, index) => (
        <path key={`fill-${index}`} d={area(segment)} fill={`url(#${gradientId})`} />
      ))}
      {segments.map((segment, index) => (
        <path
          key={`line-${index}`}
          d={path(segment)}
          fill="none"
          stroke="var(--olive)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

function summarizeWeek(days: FoodAlignmentDay[]) {
  const logged = days.filter((day) => day.mealCount > 0);
  const proteinValues = logged.map((day) => day.proteinTotal ?? 0).filter((value) => value > 0);
  const proteinAvg = proteinValues.length
    ? Math.round(proteinValues.reduce((sum, value) => sum + value, 0) / proteinValues.length)
    : null;
  const fiberValues = logged.map((day) => day.fiberTotal ?? 0).filter((value) => value > 0);
  const fiberAvg = fiberValues.length
    ? Math.round(fiberValues.reduce((sum, value) => sum + value, 0) / fiberValues.length)
    : null;
  const plantDays = logged.filter((day) => day.plantTagCount > 0).length;
  const crashDays = logged.filter((day) => day.crashRiskCount > 0).length;
  const contextDays = days.filter((day) => Object.values(day.context).some(Boolean)).length;
  return { loggedCount: logged.length, proteinAvg, fiberAvg, plantDays, crashDays, contextDays };
}

function ReadItem({ label, read, color }: { label: string; read: FoodAlignmentRead; color: string }) {
  return (
    <div className="food-alignment-read" style={{ "--alignment-color": color } as CSSProperties}>
      <span>{label}</span>
      <strong>{labelStatus(read.status)}</strong>
      <small>{read.confidence}</small>
    </div>
  );
}

export function FoodAlignmentCard({ date, refreshKey = 0 }: FoodAlignmentCardProps) {
  const [data, setData] = useState<FoodAlignmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await loadFoodAlignment(date ?? undefined);
      setData(result);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load food alignment");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh, refreshKey]);

  const contextLabels = useMemo(() => (data ? activeContextLabels(data) : []), [data]);

  return (
    <section className="food-alignment-card" aria-label="Food alignment">
      <header className="food-alignment-head">
        <div>
          <Utensils size={15} />
          <span>Food alignment</span>
        </div>
        <button aria-label="Refresh food alignment" disabled={refreshing} onClick={refresh} type="button">
          {refreshing ? <LoaderCircle className="spin" size={13} /> : <RefreshCw size={13} />}
        </button>
      </header>

      {loading ? (
        <div className="food-alignment-loading">
          <LoaderCircle className="spin" size={16} />
        </div>
      ) : error ? (
        <p className="food-alignment-error">{error}</p>
      ) : data ? (
        <>
          <div className="food-alignment-strip">
            {READ_SPECS.map((spec) => (
              <ReadItem key={spec.key} label={spec.label} read={data.reads[spec.key]} color={spec.color} />
            ))}
          </div>

          <p className="food-alignment-nudge">{data.nudge}</p>

          <div className="food-alignment-totals">
            <span>Protein {grams(data.features.proteinTotal)} / {data.features.proteinTargetMin}g</span>
            <span>Fiber {grams(data.features.fiberTotal)} / {data.features.fiberTargetMin}g</span>
            <span>{data.features.weeklyLoggedDays}/7 logged</span>
          </div>

          <WeeklyProteinLine days={data.weekly} />
          {(() => {
            const summary = summarizeWeek(data.weekly);
            const parts = [
              `${summary.loggedCount}/7 days logged`,
              summary.proteinAvg !== null ? `protein avg ${summary.proteinAvg}g` : null,
              summary.fiberAvg !== null ? `fiber avg ${summary.fiberAvg}g` : null,
              summary.plantDays ? `${summary.plantDays} plant-heavy day${summary.plantDays === 1 ? "" : "s"}` : null,
              summary.crashDays ? `${summary.crashDays} crash-risk day${summary.crashDays === 1 ? "" : "s"}` : null,
              summary.contextDays ? `${summary.contextDays} day${summary.contextDays === 1 ? "" : "s"} with context flags` : null,
            ].filter(Boolean);
            return <p className="food-alignment-week-summary">{parts.join(" · ")}</p>;
          })()}

          {contextLabels.length ? (
            <div className="food-alignment-context" aria-label="Context modifiers">
              {contextLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          ) : null}

          <details className="food-alignment-details">
            <summary>Reasons</summary>
            <ul>
              {READ_SPECS.map((spec) => (
                <li key={spec.key}>
                  <span>{spec.label}</span>
                  {data.reads[spec.key].reason}
                </li>
              ))}
            </ul>
            {data.tracks?.length ? (
              <ul className="food-alignment-tracks">
                {data.tracks
                  .filter((track) => track.activeNudge)
                  .map((track) => (
                    <li key={track.key}>
                      <span>{track.label}</span>
                      {track.activeNudge}
                    </li>
                  ))}
              </ul>
            ) : null}
          </details>
        </>
      ) : null}
    </section>
  );
}
