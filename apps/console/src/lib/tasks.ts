import type { TaskCreateInput, TaskItem, TaskStatus } from "../types";
import { apiUrl } from "./api";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const errorPayload = payload as { error?: string };
    throw new Error(errorPayload.error ?? `Request failed with ${response.status}`);
  }
  return payload as T;
}

export async function loadTasks() {
  const response = await fetch(apiUrl("/api/tasks"), { cache: "no-store", credentials: "include" });
  return parseJson<{ tasks: TaskItem[] }>(response);
}

export async function createTask(input: TaskCreateInput) {
  const response = await fetch(apiUrl("/api/tasks"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson<{ task: TaskItem }>(response);
}

export async function updateTaskStatus(path: string, status: TaskStatus) {
  const response = await fetch(apiUrl("/api/tasks/status"), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ path, status }),
  });
  return parseJson<{ task: TaskItem }>(response);
}
