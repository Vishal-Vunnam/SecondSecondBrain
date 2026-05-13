import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  healthDbPath,
  host,
  port,
  publicRoot,
  tailScaleIp,
  terminalPort,
  vaultRoot,
} from "./core/config.js";
import { contentTypes, getRequestUrl, send, sendJson } from "./core/http.js";
import { isAuthEnabled, isAuthenticated, routeAuth } from "./core/auth.js";
import { routeFeed, startFeedPoller } from "./domains/feed.js";
import { routeFitness, topUpRecurrences } from "./domains/fitness.js";
import { intakeHealth, routeHealthApi } from "./domains/health.js";
import { routeHome } from "./domains/home.js";
import { routeShopping } from "./domains/shopping.js";
import { routeTasks, syncTaskIndex } from "./domains/tasks.js";
import { routeVault } from "./domains/vault.js";
import { handleMcpRequest } from "./mcp.js";
import { handleAgentChatRequest, handleAgentStatusRequest } from "./agent.js";

async function probe(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return response.ok || [401, 403].includes(response.status);
  } catch {
    return false;
  }
}

async function routeHealth(res: ServerResponse, pathname: string) {
  const checks: Record<string, string> = {
    "/health/couchdb": "http://couchdb:5984/_up",
    "/health/syncthing": "http://syncthing:8384/rest/noauth/health",
    "/health/terminal": `http://${tailScaleIp}:${terminalPort}/`,
    "/health/ollama": "http://ollama:11434/api/tags",
    "/health/anythingllm": "http://anythingllm:3001/",
  };

  if (pathname === "/health/console") {
    send(res, 204);
    return;
  }

  const url = checks[pathname];
  if (!url) {
    sendJson(res, 404, { error: "Unknown health check" });
    return;
  }

  send(res, (await probe(url)) ? 204 : 503);
}

async function serveStatic(res: ServerResponse, url: URL) {
  const requested = decodeURIComponent(url.pathname);
  const relativePath = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
  const filePath = path.resolve(publicRoot, relativePath);
  const safePath = filePath.startsWith(`${publicRoot}${path.sep}`) ? filePath : path.join(publicRoot, "index.html");
  const fallbackPath = path.join(publicRoot, "index.html");

  try {
    await access(safePath, constants.R_OK);
    const data = await readFile(safePath);
    send(res, 200, data, {
      "content-type": contentTypes[path.extname(safePath)] ?? "application/octet-stream",
      "cache-control": safePath === fallbackPath ? "no-store" : "public, max-age=31536000, immutable",
    });
  } catch {
    const data = await readFile(fallbackPath);
    send(res, 200, data, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
  }
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = getRequestUrl(req);

  if (req.method === "OPTIONS") {
    send(res, 204);
    return;
  }

  if (await routeAuth(req, res, url.pathname)) {
    return;
  }

  if (url.pathname === "/api/intake/health" && req.method === "POST") {
    await intakeHealth(req, res, { requireBearerToken: true });
    return;
  }

  if (url.pathname === "/api/mcp") {
    await handleMcpRequest(req, res);
    return;
  }

  if (
    isAuthEnabled() &&
    !isAuthenticated(req) &&
    (url.pathname.startsWith("/api/") || (url.pathname.startsWith("/health/") && url.pathname !== "/health/console"))
  ) {
    sendJson(res, 401, { error: "Authentication required" });
    return;
  }

  if (url.pathname === "/api/health/capture" && req.method === "POST") {
    await intakeHealth(req, res, { requireBearerToken: false });
    return;
  }

  if (url.pathname === "/api/agent/chat" && req.method === "POST") {
    await handleAgentChatRequest(req, res);
    return;
  }

  if (url.pathname === "/api/agent/status" && req.method === "GET") {
    await handleAgentStatusRequest(req, res);
    return;
  }

  if (url.pathname.startsWith("/api/health/") && (await routeHealthApi(req, res, url))) {
    return;
  }

  if (url.pathname.startsWith("/health/")) {
    await routeHealth(res, url.pathname);
    return;
  }

  if (url.pathname.startsWith("/api/home/") && (await routeHome(req, res, url))) {
    return;
  }

  if (url.pathname.startsWith("/api/feed") && (await routeFeed(req, res, url))) {
    return;
  }

  if ((url.pathname.startsWith("/api/tasks") || url.pathname === "/api/intake/task") && (await routeTasks(req, res, url))) {
    return;
  }

  if (url.pathname.startsWith("/api/shopping") && (await routeShopping(req, res, url))) {
    return;
  }

  if (url.pathname.startsWith("/api/vault/") && (await routeVault(req, res, url))) {
    return;
  }

  if (url.pathname.startsWith("/api/fitness/") && (await routeFitness(req, res, url))) {
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "Unknown API route" });
    return;
  }

  await serveStatic(res, url);
}

const server = createServer((req, res) => {
  route(req, res).catch((error: unknown) => {
    const status = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 500;
    const message = error instanceof Error ? error.message : "Unexpected server error";
    sendJson(res, Number.isFinite(status) ? status : 500, { error: message });
  });
});

server.listen(port, host, () => {
  console.log(`brain console listening on ${host}:${port}`);
  console.log(`vault root: ${vaultRoot}`);
  console.log(`health db: ${healthDbPath}`);
  syncTaskIndex().catch((error) => console.warn("initial tasks index sync failed", error));
  try { topUpRecurrences(); } catch (error) { console.warn("initial recurrence top-up failed", error); }
  try { startFeedPoller(); } catch (error) { console.warn("initial feed poll failed", error); }
});
