import type { FeedInteractionAction, FeedProfile, FeedResponse, FeedSource, FeedSourceType } from "../types";
import { apiUrl } from "./api";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const errorPayload = payload as { error?: string };
    throw new Error(errorPayload.error ?? `Request failed with ${response.status}`);
  }
  return payload as T;
}

export async function loadFeed(profileId?: number) {
  const query = profileId ? `?profile=${profileId}` : "";
  const response = await fetch(apiUrl(`/api/feed${query}`), { cache: "no-store", credentials: "include" });
  return parseJson<FeedResponse>(response);
}

export async function refreshFeed() {
  const response = await fetch(apiUrl("/api/feed/refresh"), {
    method: "POST",
    credentials: "include",
  });
  return parseJson<{ ok: true }>(response);
}

export async function loadFeedSources() {
  const response = await fetch(apiUrl("/api/feed/sources"), { cache: "no-store", credentials: "include" });
  return parseJson<{ sources: FeedSource[] }>(response);
}

export async function loadFeedProfiles() {
  const response = await fetch(apiUrl("/api/feed/profiles"), { cache: "no-store", credentials: "include" });
  return parseJson<{ profiles: FeedProfile[] }>(response);
}

export async function updateFeedProfile(id: number, patch: Partial<Omit<FeedProfile, "id" | "enabled">>) {
  const response = await fetch(apiUrl(`/api/feed/profiles/${id}`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  return parseJson<{ profile: FeedProfile }>(response);
}

export async function createFeedSource(input: { name: string; type: FeedSourceType; url: string; weight?: number }) {
  const response = await fetch(apiUrl("/api/feed/sources"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson<{ source: FeedSource }>(response);
}

export async function updateFeedSource(id: number, patch: { name?: string; weight?: number; enabled?: boolean }) {
  const response = await fetch(apiUrl(`/api/feed/sources/${id}`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  return parseJson<{ source: FeedSource }>(response);
}

export async function deleteFeedSource(id: number) {
  const response = await fetch(apiUrl(`/api/feed/sources/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  return parseJson<{ ok: true }>(response);
}

export async function recordFeedInteraction(itemId: string, action: FeedInteractionAction, profileId?: number) {
  const response = await fetch(apiUrl("/api/feed/interactions"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ itemId, action, profileId }),
  });
  return parseJson<{ ok: true }>(response);
}
