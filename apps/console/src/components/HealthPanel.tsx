import { LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type HealthSeriesPoint, loadHealthRhythm, loadHealthSeries } from "../lib/healthData";

type Range = 7 | 30 | 90;

type MetricKey =
  | "sleepHours"
  | "energy"
  | "mood"
  | "stress"
  | "soreness"
  | "protein"
  | "workoutMinutes"
  | "weight";

type MetricSpec = {
  key: MetricKey;
  label: string;
  unit: string;
  precision: 0 | 1;
  color: string;
  glow: string;
};

const METRICS: MetricSpec[] = [
  { key: "sleepHours", label: "Sleep", unit: "h", precision: 1, color: "var(--teal)", glow: "rgba(49, 115, 129, 0.35)" },
  { key: "energy", label: "Energy", unit: "/5", precision: 1, color: "var(--olive)", glow: "rgba(112, 115, 92, 0.35)" },
  { key: "mood", label: "Mood", unit: "/5", precision: 1, color: "var(--orange)", glow: "rgba(210, 105, 30, 0.35)" },
  { key: "stress", label: "Stress", unit: "/5", precision: 1, color: "var(--red)", glow: "rgba(184, 68, 67, 0.35)" },
  { key: "soreness", label: "Soreness", unit: "/5", precision: 1, color: "var(--mist)", glow: "rgba(195, 200, 199, 0.45)" },
  { key: "protein", label: "Protein", unit: "g", precision: 0, color: "var(--olive)", glow: "rgba(112, 115, 92, 0.35)" },
  { key: "workoutMinutes", label: "Training", unit: "m", precision: 0, color: "var(--teal)", glow: "rgba(49, 115, 129, 0.35)" },
  { key: "weight", label: "Weight", unit: "lb", precision: 1, color: "var(--mist)", glow: "rgba(195, 200, 199, 0.45)" },
];

function pickValue(point: HealthSeriesPoint, key: MetricKey): number | null {
  return point[key];
}

function formatValue(value: number | null, precision: 0 | 1) {
  if (value === null) return "—";
  return precision === 0 ? Math.round(value).toString() : value.toFixed(1);
}

function lastNonNull(series: HealthSeriesPoint[], key: MetricKey): number | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const value = pickValue(series[i], key);
    if (value !== null) return value;
  }
  return null;
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function deltaPercent(series: HealthSeriesPoint[], key: MetricKey) {
  const values = series.map((point) => pickValue(point, key)).filter((value): value is number => value !== null);
  if (values.length < 4) return null;
  const half = Math.floor(values.length / 2);
  const prev = average(values.slice(0, half));
  const next = average(values.slice(half));
  if (prev === null || next === null || prev === 0) return null;
  return ((next - prev) / Math.abs(prev)) * 100;
}

function buildPoints(series: HealthSeriesPoint[], key: MetricKey, width: number, height: number, padX: number, padY: number) {
  const values = series.map((point) => pickValue(point, key));
  const nonNull = values.filter((v): v is number => v !== null);
  if (nonNull.length < 2) return null;
  const min = Math.min(...nonNull);
  const max = Math.max(...nonNull);
  const span = max - min || 1;
  const stepX = (width - padX * 2) / Math.max(1, values.length - 1);
  return values.map((value, index) => {
    if (value === null) return null;
    const x = padX + index * stepX;
    const y = height - padY - ((value - min) / span) * (height - padY * 2);
    return { x, y };
  });
}

function segmentsFrom(points: Array<{ x: number; y: number } | null>) {
  const out: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const point of points) {
    if (point === null) {
      if (current.length > 1) out.push(current);
      current = [];
    } else {
      current.push(point);
    }
  }
  if (current.length > 1) out.push(current);
  return out;
}

function pathFrom(pts: Array<{ x: number; y: number }>) {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

function formatHoverDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(y, m - 1, d));
}

function BigChart({ series, metric }: { series: HealthSeriesPoint[]; metric: MetricSpec }) {
  const width = 1000;
  const height = 320;
  const padX = 16;
  const padY = 28;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const points = buildPoints(series, metric.key, width, height, padX, padY);

  if (!points) {
    return (
      <div className="big-chart-empty">
        <span>Not enough data yet</span>
      </div>
    );
  }

  const safePoints = points;
  const segs = segmentsFrom(safePoints);
  const lastPoint = [...safePoints].reverse().find((p): p is { x: number; y: number } => p !== null);
  const values = series.map((p) => pickValue(p, metric.key)).filter((v): v is number => v !== null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const gradientId = `big-spark-${metric.key}`;

  const areaFrom = (pts: Array<{ x: number; y: number }>) =>
    `${pathFrom(pts)} L${pts[pts.length - 1].x.toFixed(2)},${height} L${pts[0].x.toFixed(2)},${height} Z`;

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((event.clientX - rect.left) / rect.width) * width;
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < safePoints.length; i += 1) {
      const p = safePoints[i];
      if (!p) continue;
      const dist = Math.abs(p.x - relX);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    setHoverIndex(best >= 0 ? best : null);
  }

  const hoverPoint = hoverIndex !== null ? safePoints[hoverIndex] : null;
  const hoverValue = hoverIndex !== null ? pickValue(series[hoverIndex], metric.key) : null;
  const hoverDate = hoverIndex !== null ? series[hoverIndex].date : null;

  return (
    <svg
      ref={svgRef}
      className="big-chart-svg"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      onMouseMove={handleMove}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={metric.color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={metric.color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <text x={padX} y={18} className="big-chart-axis-label" fill="currentColor" opacity={0.45}>
        {metric.precision === 0 ? Math.round(max) : max.toFixed(1)}
        {metric.unit}
      </text>
      <text x={padX} y={height - 8} className="big-chart-axis-label" fill="currentColor" opacity={0.45}>
        {metric.precision === 0 ? Math.round(min) : min.toFixed(1)}
        {metric.unit}
      </text>
      {segs.map((seg, index) => (
        <path key={`fill-${index}`} d={areaFrom(seg)} fill={`url(#${gradientId})`} />
      ))}
      {segs.map((seg, index) => (
        <path
          key={`line-${index}`}
          d={pathFrom(seg)}
          fill="none"
          stroke={metric.color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {lastPoint && !hoverPoint ? (
        <>
          <circle cx={lastPoint.x} cy={lastPoint.y} r={14} fill={metric.glow} opacity={0.45} />
          <circle cx={lastPoint.x} cy={lastPoint.y} r={5} fill={metric.color} />
        </>
      ) : null}
      {hoverPoint && hoverValue !== null && hoverDate ? (
        <>
          <line
            x1={hoverPoint.x}
            x2={hoverPoint.x}
            y1={padY / 2}
            y2={height - padY / 2}
            stroke={metric.color}
            strokeWidth={1}
            strokeDasharray="3 4"
            opacity={0.45}
          />
          <circle cx={hoverPoint.x} cy={hoverPoint.y} r={14} fill={metric.glow} opacity={0.45} />
          <circle cx={hoverPoint.x} cy={hoverPoint.y} r={5} fill={metric.color} />
          <g
            transform={`translate(${Math.min(width - 110, Math.max(10, hoverPoint.x - 55))}, ${Math.max(8, hoverPoint.y - 56)})`}
            style={{ pointerEvents: "none" }}
          >
            <rect width={110} height={42} rx={8} fill="transparent" />
            <text x={10} y={17} className="big-chart-tip-date" fill="currentColor" opacity={0.6}>
              {formatHoverDate(hoverDate)}
            </text>
            <text x={10} y={33} className="big-chart-tip-value" fill="currentColor">
              {formatValue(hoverValue, metric.precision)}
              {metric.unit}
            </text>
          </g>
        </>
      ) : null}
    </svg>
  );
}

export function HealthPanel() {
  const [series, setSeries] = useState<HealthSeriesPoint[]>([]);
  const [range, setRange] = useState<Range>(30);
  const [activeKey, setActiveKey] = useState<MetricKey>("sleepHours");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rhythmBullets, setRhythmBullets] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadHealthRhythm(60)
      .then((result) => { if (!cancelled) setRhythmBullets(result.bullets); })
      .catch(() => { if (!cancelled) setRhythmBullets([]); });
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async (nextRange: Range) => {
    setRefreshing(true);
    try {
      const result = await loadHealthSeries(nextRange);
      setSeries(result.series);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load analytics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh(range);
  }, [range, refresh]);

  const visibleMetrics = useMemo(() => {
    return METRICS.filter((metric) => {
      if (metric.key !== "weight") return true;
      return series.some((point) => point.weight !== null);
    });
  }, [series]);

  const activeMetric = useMemo(
    () => visibleMetrics.find((metric) => metric.key === activeKey) ?? visibleMetrics[0] ?? METRICS[0],
    [activeKey, visibleMetrics],
  );

  const latest = lastNonNull(series, activeMetric.key);
  const delta = deltaPercent(series, activeMetric.key);
  const deltaSign = delta === null ? null : delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat";
  const rangeStart = series[0]?.date;
  const rangeEnd = series[series.length - 1]?.date;

  return (
    <section className="health-panel" aria-label="Health analytics">
      <div className="health-shell health-analytics">
        <header className="health-heading">
          <div>
            <span>Health</span>
            <h3>Overview</h3>
          </div>
          <div className="health-range-toolbar">
            <div className="range-text" role="tablist" aria-label="Range">
              {([7, 30, 90] as Range[]).flatMap((value, index) => {
                const button = (
                  <button
                    key={value}
                    className={`range-text-btn${range === value ? " is-active" : ""}`}
                    onClick={() => setRange(value)}
                    role="tab"
                    aria-selected={range === value}
                    type="button"
                  >
                    {value}d
                  </button>
                );
                return index === 0 ? [button] : [<span key={`sep-${value}`} className="range-sep">·</span>, button];
              })}
            </div>
            <button className="range-refresh" disabled={refreshing} onClick={() => refresh(range)} type="button" aria-label="Refresh">
              {refreshing ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
            </button>
          </div>
        </header>

        {error ? <p className="health-error">{error}</p> : null}

        {loading ? (
          <div className="health-spark-loading">
            <LoaderCircle className="spin" size={18} />
          </div>
        ) : (
          <div className="big-chart">
            {rhythmBullets.length ? (
              <section className="insights-block">
                <header>
                  <span className="insights-eyebrow">Insights</span>
                  <h4>What your last 60 days say</h4>
                </header>
                <ul>
                  {rhythmBullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            <div className="big-chart-top">
              <select
                className="metric-select"
                value={activeMetric.key}
                onChange={(event) => setActiveKey(event.target.value as MetricKey)}
                aria-label="Metric"
              >
                {visibleMetrics.map((metric) => (
                  <option key={metric.key} value={metric.key}>{metric.label}</option>
                ))}
              </select>
              <div className="big-chart-readout">
                <strong>{formatValue(latest, activeMetric.precision)}</strong>
                <em>{activeMetric.unit}</em>
                {delta !== null ? (
                  <span className={`big-chart-delta big-chart-delta-${deltaSign}`}>
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(0)}%
                  </span>
                ) : null}
              </div>
            </div>
            <div className="big-chart-canvas">
              <BigChart metric={activeMetric} series={series} />
            </div>
            <div className="big-chart-foot">{rangeStart} → {rangeEnd}</div>
          </div>
        )}
      </div>
    </section>
  );
}
