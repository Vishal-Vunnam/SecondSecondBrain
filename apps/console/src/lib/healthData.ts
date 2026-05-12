import type { HealthBodyEntry, HealthBowelEntry, HealthCaptureResponse, HealthCommitmentEntry, HealthEntry, HealthEntryType, HealthOverview } from "../types";
import { apiUrl } from "./api";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const errorPayload = payload as { error?: string };
    throw new Error(errorPayload.error ?? `Request failed with ${response.status}`);
  }
  return payload as T;
}

function timezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
}

export async function loadHealthOverview() {
  const response = await fetch(apiUrl(`/api/health/overview?timezone=${encodeURIComponent(timezone())}`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<HealthOverview>(response);
}

export async function loadHealthRecent(limit = 20) {
  const response = await fetch(apiUrl(`/api/health/recent?limit=${limit}&timezone=${encodeURIComponent(timezone())}`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<{ entries: HealthEntry[] }>(response);
}

export async function captureHealth(text: string) {
  const response = await fetch(apiUrl("/api/health/capture"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      source: "console",
      text,
      timezone: timezone(),
    }),
  });
  return parseJson<HealthCaptureResponse>(response);
}

export async function updateHealthEntry(type: HealthEntryType, id: number, input: Record<string, unknown>) {
  const response = await fetch(apiUrl(`/api/health/entries/${type}/${id}?timezone=${encodeURIComponent(timezone())}`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson<{ entry: HealthEntry }>(response);
}

export async function deleteHealthEntry(type: HealthEntryType, id: number) {
  const response = await fetch(apiUrl(`/api/health/entries/${type}/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  return parseJson<{ deleted: true }>(response);
}

export async function createHealthCommitment(input: {
  title: string;
  cadence?: string;
  targetCount?: number | null;
  reviewDate?: string;
}) {
  const response = await fetch(apiUrl("/api/health/commitments"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson<{ commitment: HealthCommitmentEntry }>(response);
}

export type HealthCalendarDay = {
  date: string;
  score: number;
  hasMeal: boolean;
  hasWorkout: boolean;
  hasBody: boolean;
};

export async function loadHealthCalendar(days = 60) {
  const response = await fetch(apiUrl(`/api/health/log-calendar?days=${days}&timezone=${encodeURIComponent(timezone())}`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<{ calendar: HealthCalendarDay[]; today: string }>(response);
}

export type HealthSeriesPoint = {
  date: string;
  sleepHours: number | null;
  sleepQuality: number | null;
  energy: number | null;
  mood: number | null;
  stress: number | null;
  soreness: number | null;
  weight: number | null;
  protein: number | null;
  calories: number | null;
  workoutMinutes: number | null;
  workoutIntensity: number | null;
};

export async function loadHealthSeries(days = 30) {
  const response = await fetch(apiUrl(`/api/health/series?days=${days}&timezone=${encodeURIComponent(timezone())}`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<{ series: HealthSeriesPoint[]; today: string; days: number }>(response);
}

export async function loadHealthRhythm(days = 60) {
  const response = await fetch(apiUrl(`/api/health/rhythm?days=${days}&timezone=${encodeURIComponent(timezone())}`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<{ bullets: string[]; generatedAt: string; days: number }>(response);
}

export type HealthCheckinPayload = Partial<{
  sleepHours: number | null;
  sleepQuality: number | null;
  energy: number | null;
  moodScore: number | null;
  soreness: number | null;
  stress: number | null;
  focus: number | null;
  social: string | null;
  activityLevel: string | null;
  sunExposure: string | null;
  sick: boolean | null;
  alcohol: boolean | null;
  marijuana: boolean | null;
  weightLb: number | null;
  hydration: number | null;
  notes: string | null;
}>;

export async function loadHealthCheckin(date?: string) {
  const params = new URLSearchParams({ timezone: timezone() });
  if (date) params.set("date", date);
  const response = await fetch(apiUrl(`/api/health/checkin?${params.toString()}`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<{ date: string; entry: HealthBodyEntry | null }>(response);
}

export async function saveHealthCheckin(payload: HealthCheckinPayload & { date?: string }) {
  const response = await fetch(apiUrl(`/api/health/checkin?timezone=${encodeURIComponent(timezone())}`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return parseJson<{ entry: HealthBodyEntry }>(response);
}

export async function loadHealthBowel(date?: string) {
  const params = new URLSearchParams({ timezone: timezone() });
  if (date) params.set("date", date);
  const response = await fetch(apiUrl(`/api/health/bowel?${params.toString()}`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<{ date: string; entries: HealthBowelEntry[] }>(response);
}

export async function logHealthBowel(input: { bristol: number; date?: string; notes?: string | null }) {
  const response = await fetch(apiUrl("/api/health/bowel"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson<{ entry: HealthBowelEntry }>(response);
}

export async function deleteHealthBowel(id: number) {
  const response = await fetch(apiUrl(`/api/health/bowel/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  return parseJson<{ deleted: true }>(response);
}

export async function captureHealthLog(text: string, date?: string) {
  const response = await fetch(apiUrl(`/api/health/log?timezone=${encodeURIComponent(timezone())}`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ text, date }),
  });
  return parseJson<HealthCaptureResponse>(response);
}
