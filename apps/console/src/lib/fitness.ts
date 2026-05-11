import type { ExerciseSummary, FitnessStats, Workout, WorkoutRecurrence, WorkoutSet, WorkoutStatus } from "../types";
import { apiUrl } from "./api";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error ?? `Request failed with ${response.status}`);
  }
  return payload as T;
}

type WorkoutInput = {
  date: string;
  name: string;
  description?: string | null;
  status?: WorkoutStatus;
  planned?: boolean;
  sets: Pick<WorkoutSet, "exercise" | "weight" | "reps">[];
};

export async function loadWorkouts(start: string, end: string) {
  const url = apiUrl(`/api/fitness/workouts?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  const res = await fetch(url, { cache: "no-store", credentials: "include" });
  return parseJson<{ workouts: Workout[] }>(res);
}

export async function getWorkout(id: number) {
  const res = await fetch(apiUrl(`/api/fitness/workouts/${id}`), { cache: "no-store", credentials: "include" });
  return parseJson<{ workout: Workout }>(res);
}

export async function createWorkout(input: WorkoutInput) {
  const res = await fetch(apiUrl("/api/fitness/workouts"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson<{ workout: Workout }>(res);
}

export async function updateWorkout(id: number, input: Partial<WorkoutInput>) {
  const res = await fetch(apiUrl(`/api/fitness/workouts/${id}`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson<{ workout: Workout }>(res);
}

export async function patchWorkoutStatus(id: number, status: WorkoutStatus) {
  const res = await fetch(apiUrl(`/api/fitness/workouts/${id}/status`), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status }),
  });
  return parseJson<{ workout: Workout }>(res);
}

export async function deleteWorkout(id: number) {
  const res = await fetch(apiUrl(`/api/fitness/workouts/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  return parseJson<{ deleted: true }>(res);
}

export async function loadFitnessStats() {
  const res = await fetch(apiUrl("/api/fitness/stats"), { cache: "no-store", credentials: "include" });
  return parseJson<FitnessStats>(res);
}

export async function loadExercises() {
  const res = await fetch(apiUrl("/api/fitness/exercises"), { cache: "no-store", credentials: "include" });
  return parseJson<{ exercises: ExerciseSummary[] }>(res);
}

export async function loadLastSet(exercise: string) {
  const res = await fetch(apiUrl(`/api/fitness/exercises/last?exercise=${encodeURIComponent(exercise)}`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<{ last: { weight: number | null; reps: number | null; date: string } | null }>(res);
}

export async function loadRecurrences() {
  const res = await fetch(apiUrl("/api/fitness/recurrences"), { cache: "no-store", credentials: "include" });
  return parseJson<{ recurrences: WorkoutRecurrence[] }>(res);
}

type RecurrenceInput = {
  name: string;
  description?: string | null;
  daysOfWeek: number[];
  templateSets: { exercise: string; weight: number | null; reps: number | null }[];
  startDate: string;
  endDate?: string | null;
};

export async function createRecurrence(input: RecurrenceInput) {
  const res = await fetch(apiUrl("/api/fitness/recurrences"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson<{ recurrence: WorkoutRecurrence }>(res);
}

export async function updateRecurrence(id: number, input: Partial<RecurrenceInput>) {
  const res = await fetch(apiUrl(`/api/fitness/recurrences/${id}`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson<{ recurrence: WorkoutRecurrence }>(res);
}

export async function deleteRecurrence(id: number) {
  const res = await fetch(apiUrl(`/api/fitness/recurrences/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  return parseJson<{ deleted: true }>(res);
}
