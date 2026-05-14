import type { ReadingItem, ReadingPriority, ReadingStatus } from "../types";
import { apiUrl } from "./api";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const err = (payload as { error?: string }).error;
    throw new Error(err ?? `Request failed with ${response.status}`);
  }
  return payload as T;
}

export async function loadReadingItems() {
  const response = await fetch(apiUrl("/api/reading-list"), { cache: "no-store", credentials: "include" });
  return parseJson<{ items: ReadingItem[] }>(response);
}

export async function loadReadingCategories() {
  const response = await fetch(apiUrl("/api/reading-list/categories"), { cache: "no-store", credentials: "include" });
  return parseJson<{ categories: string[] }>(response);
}

export async function createReadingItem(input: {
  title: string;
  url?: string;
  note?: string;
  category?: string;
  priority?: ReadingPriority;
  status?: ReadingStatus;
}) {
  const response = await fetch(apiUrl("/api/reading-list"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson<{ item: ReadingItem }>(response);
}

export async function updateReadingItem(
  id: number,
  patch: Partial<{
    title: string;
    url: string | null;
    note: string | null;
    category: string | null;
    priority: ReadingPriority;
    status: ReadingStatus;
  }>,
) {
  const response = await fetch(apiUrl(`/api/reading-list/${id}`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  return parseJson<{ item: ReadingItem }>(response);
}

export async function deleteReadingItem(id: number) {
  const response = await fetch(apiUrl(`/api/reading-list/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  return parseJson<{ deleted: true }>(response);
}
