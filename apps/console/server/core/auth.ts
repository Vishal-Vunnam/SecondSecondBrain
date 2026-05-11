import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { authCookieName, authMaxAgeSeconds, authPassword, authSecret, intakeToken } from "./config.js";
import { readJsonBody, sendJson } from "./http.js";

export function isAuthEnabled() {
  return authPassword.trim().length > 0;
}

export function hasValidIntakeToken(req: IncomingMessage) {
  if (!intakeToken.trim()) return false;
  const header = req.headers.authorization ?? "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  return token.length > 0 && safeEqual(token, intakeToken);
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signSession(expiresAt: number) {
  return createHmac("sha256", authSecret).update(String(expiresAt)).digest("base64url");
}

function createSessionToken() {
  const expiresAt = Date.now() + authMaxAgeSeconds * 1000;
  return `${expiresAt}.${signSession(expiresAt)}`;
}

function parseCookies(req: IncomingMessage) {
  const header = req.headers.cookie ?? "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...value] = part.split("=");
        return [decodeURIComponent(key), decodeURIComponent(value.join("="))];
      }),
  );
}

export function isAuthenticated(req: IncomingMessage) {
  if (!isAuthEnabled()) return true;

  const token = parseCookies(req)[authCookieName];
  if (!token) return false;

  const [expiresAtRaw, signature] = token.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || !signature) return false;

  return safeEqual(signature, signSession(expiresAt));
}

function sessionCookie(value: string, maxAge: number) {
  const secure = process.env.COOKIE_SECURE === "true" ? "; Secure" : "";
  return `${authCookieName}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function clearSessionCookie() {
  return sessionCookie("", 0);
}

export async function routeAuth(req: IncomingMessage, res: ServerResponse, pathname: string) {
  if (pathname === "/api/auth/status" && req.method === "GET") {
    sendJson(res, 200, {
      authenticated: isAuthenticated(req),
      authRequired: isAuthEnabled(),
    });
    return true;
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    const body = await readJsonBody(req);
    if (typeof body !== "object" || body === null || typeof (body as { password?: unknown }).password !== "string") {
      sendJson(res, 400, { error: "Expected JSON body with a password string" });
      return true;
    }

    if (!isAuthEnabled() || safeEqual((body as { password: string }).password, authPassword)) {
      sendJson(res, 200, { authenticated: true, authRequired: isAuthEnabled() }, { "set-cookie": sessionCookie(createSessionToken(), authMaxAgeSeconds) });
      return true;
    }

    sendJson(res, 401, { error: "Incorrect password" });
    return true;
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    sendJson(res, 200, { authenticated: false, authRequired: isAuthEnabled() }, { "set-cookie": clearSessionCookie() });
    return true;
  }

  return false;
}
