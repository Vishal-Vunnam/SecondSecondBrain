import type { ShoppingItem, ShoppingNecessity } from "../types";
import { apiUrl } from "./api";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const err = (payload as { error?: string }).error;
    throw new Error(err ?? `Request failed with ${response.status}`);
  }
  return payload as T;
}

export async function loadShoppingItems() {
  const response = await fetch(apiUrl("/api/shopping"), { cache: "no-store", credentials: "include" });
  return parseJson<{ items: ShoppingItem[] }>(response);
}

export async function loadShoppingTypes() {
  const response = await fetch(apiUrl("/api/shopping/types"), { cache: "no-store", credentials: "include" });
  return parseJson<{ types: string[] }>(response);
}

export async function createShoppingItem(input: {
  title: string;
  reasoning?: string;
  type?: string;
  necessity: ShoppingNecessity;
  link?: string;
}) {
  const response = await fetch(apiUrl("/api/shopping"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJson<{ item: ShoppingItem }>(response);
}

export async function updateShoppingItem(
  id: number,
  patch: Partial<{
    title: string;
    reasoning: string | null;
    type: string | null;
    necessity: ShoppingNecessity;
    gotIt: boolean;
    link: string | null;
  }>,
) {
  const response = await fetch(apiUrl(`/api/shopping/${id}`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  return parseJson<{ item: ShoppingItem }>(response);
}

export async function deleteShoppingItem(id: number) {
  const response = await fetch(apiUrl(`/api/shopping/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  return parseJson<{ deleted: true }>(response);
}
