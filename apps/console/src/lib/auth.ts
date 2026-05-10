import { apiUrl } from "./api";

export type AuthStatus = {
  authenticated: boolean;
  authRequired: boolean;
};

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const errorPayload = payload as { error?: string };
    throw new Error(errorPayload.error ?? `Request failed with ${response.status}`);
  }
  return payload as T;
}

export async function loadAuthStatus() {
  const response = await fetch(apiUrl("/api/auth/status"), { cache: "no-store", credentials: "include" });
  return parseJson<AuthStatus>(response);
}

export async function login(password: string) {
  const response = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ password }),
  });
  return parseJson<AuthStatus>(response);
}

export async function logout() {
  const response = await fetch(apiUrl("/api/auth/logout"), {
    method: "POST",
    credentials: "include",
  });
  return parseJson<AuthStatus>(response);
}
