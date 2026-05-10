import type { NewsSummary, WeatherSummary } from "../types";
import { apiUrl } from "./api";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const errorPayload = payload as { error?: string };
    throw new Error(errorPayload.error ?? `Request failed with ${response.status}`);
  }
  return payload as T;
}

export async function loadWeatherSummary() {
  const response = await fetch(apiUrl("/api/home/weather"), { cache: "no-store", credentials: "include" });
  return parseJson<WeatherSummary>(response);
}

export async function loadNewsSummary() {
  const response = await fetch(apiUrl("/api/home/news"), { cache: "no-store", credentials: "include" });
  return parseJson<NewsSummary>(response);
}
