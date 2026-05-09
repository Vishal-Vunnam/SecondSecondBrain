import type { VaultDirectory, VaultFile } from "../types";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const errorPayload = payload as { error?: string };
    throw new Error(errorPayload.error ?? `Request failed with ${response.status}`);
  }
  return payload as T;
}

export async function loadVaultDirectory(path = "") {
  const response = await fetch(`/api/vault/tree?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  return parseJson<VaultDirectory>(response);
}

export async function loadVaultFile(path: string) {
  const response = await fetch(`/api/vault/file?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  return parseJson<VaultFile>(response);
}

export async function saveVaultFile(path: string, content: string) {
  const response = await fetch("/api/vault/file", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  return parseJson<VaultFile>(response);
}
