import type { VaultDirectory, VaultFile } from "../types";
import { apiUrl } from "./api";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const errorPayload = payload as { error?: string };
    throw new Error(errorPayload.error ?? `Request failed with ${response.status}`);
  }
  return payload as T;
}

export async function loadVaultDirectory(path = "") {
  const response = await fetch(apiUrl(`/api/vault/tree?path=${encodeURIComponent(path)}`), { cache: "no-store", credentials: "include" });
  return parseJson<VaultDirectory>(response);
}

export async function loadVaultFile(path: string) {
  const response = await fetch(apiUrl(`/api/vault/file?path=${encodeURIComponent(path)}`), { cache: "no-store", credentials: "include" });
  return parseJson<VaultFile>(response);
}

export async function saveVaultFile(path: string, content: string) {
  const response = await fetch(apiUrl("/api/vault/file"), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ path, content }),
  });
  return parseJson<VaultFile>(response);
}
