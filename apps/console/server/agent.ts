import type { IncomingMessage, ServerResponse } from "node:http";
import { createVertex } from "@ai-sdk/google-vertex";
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic";
import { createGoogleVertexXai } from "@ai-sdk/google-vertex/xai";
import {
  convertToModelMessages,
  jsonSchema,
  pipeUIMessageStreamToResponse,
  stepCountIs,
  streamText,
  tool,
  type LanguageModel,
  type ToolSet,
  type UIMessage,
} from "ai";
import {
  agentDailyCap,
  agentDefaultModel,
  agentModelIds,
  vertexLocation,
  vertexProject,
  xaiApiKey,
} from "./core/config.js";
import { db } from "./core/db.js";
import { readJsonBody, sendJson } from "./core/http.js";
import { tools as toolDefs } from "./tools.js";

db.exec(`CREATE TABLE IF NOT EXISTS agent_usage (day TEXT PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0)`);

const incrementUsage = db.prepare(
  `INSERT INTO agent_usage (day, requests) VALUES (?, 1)
   ON CONFLICT(day) DO UPDATE SET requests = requests + 1`,
);
const selectUsage = db.prepare(`SELECT requests FROM agent_usage WHERE day = ?`);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function checkAndCountRequest(): { ok: boolean; count: number; cap: number } {
  const day = todayKey();
  const row = selectUsage.get(day) as { requests?: number } | undefined;
  const count = (row?.requests ?? 0) + 1;
  if (count > agentDailyCap) return { ok: false, count: count - 1, cap: agentDailyCap };
  incrementUsage.run(day);
  return { ok: true, count, cap: agentDailyCap };
}

type ModelKey = keyof typeof agentModelIds;

const vertexProvider = vertexProject
  ? createVertex({ project: vertexProject, location: vertexLocation })
  : null;
const vertexAnthropicProvider = vertexProject
  ? createVertexAnthropic({ project: vertexProject, location: vertexLocation })
  : null;
const vertexXaiProvider = vertexProject
  ? createGoogleVertexXai({ project: vertexProject, location: vertexLocation })
  : null;

function resolveModel(key: ModelKey): { model: LanguageModel; label: string; id: string } {
  const id = agentModelIds[key];
  if (key === "haiku" || key === "sonnet") {
    if (!vertexAnthropicProvider) throw new Error("Vertex (Anthropic) not configured");
    return { model: vertexAnthropicProvider(id), label: key, id };
  }
  if (key === "grok") {
    if (vertexXaiProvider) return { model: vertexXaiProvider(id), label: "grok", id };
    if (!xaiApiKey) throw new Error("XAI not configured (set GOOGLE_VERTEX_PROJECT or XAI_API_KEY)");
    throw new Error("Grok requires Vertex project; xAI direct fallback not wired");
  }
  if (!vertexProvider) throw new Error("Vertex not configured (GOOGLE_VERTEX_PROJECT missing)");
  return { model: vertexProvider(id), label: key, id };
}

const aiTools: ToolSet = Object.fromEntries(
  toolDefs.map((definition) => [
    definition.name,
    tool({
      description: definition.description,
      inputSchema: jsonSchema(definition.inputSchema),
      execute: async (args) => {
        try {
          return await definition.handler((args as Record<string, unknown>) ?? {});
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) };
        }
      },
    }),
  ]),
);

const SYSTEM_PROMPT = `You are vishalbot, a personal assistant embedded in Vishal's second-brain console.
You have tools that read and write his Obsidian vault, tasks, shopping list, health logs, and workouts.

Style: concise, direct, no filler. Markdown allowed. Cite vault paths inline as backticks.
Default to action: when the user asks for data, call the relevant tool instead of asking permission.
For destructive writes (write_note, log_health, add_shopping), state the plan in one sentence first, then act.
If a question is purely conversational, answer without tools.`;

function isModelKey(value: string): value is ModelKey {
  return value in agentModelIds;
}

export async function handleAgentChatRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST required" });
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const payload = body as { messages?: UIMessage[]; model?: string };
  const messages = Array.isArray(payload.messages) ? payload.messages : null;
  if (!messages || messages.length === 0) {
    sendJson(res, 400, { error: "messages array required" });
    return;
  }

  const requested = (typeof payload.model === "string" && payload.model) || agentDefaultModel;
  if (!isModelKey(requested)) {
    sendJson(res, 400, { error: `Unknown model "${requested}". Use one of: ${Object.keys(agentModelIds).join(", ")}` });
    return;
  }

  const usage = checkAndCountRequest();
  if (!usage.ok) {
    sendJson(res, 429, { error: `Daily request cap reached (${usage.cap}). Try again tomorrow.` });
    return;
  }

  let resolved: { model: LanguageModel; label: string; id: string };
  try {
    resolved = resolveModel(requested);
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Model resolution failed" });
    return;
  }

  const result = streamText({
    model: resolved.model,
    system: SYSTEM_PROMPT,
    tools: aiTools,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(8),
    onError: ({ error }) => {
      console.error("[agent] stream error", error);
    },
  });

  pipeUIMessageStreamToResponse({
    response: res,
    stream: result.toUIMessageStream(),
  });
}

export async function handleAgentStatusRequest(_req: IncomingMessage, res: ServerResponse) {
  const day = todayKey();
  const row = selectUsage.get(day) as { requests?: number } | undefined;
  sendJson(res, 200, {
    today: day,
    requests: row?.requests ?? 0,
    cap: agentDailyCap,
    defaultModel: agentDefaultModel,
    models: Object.keys(agentModelIds),
    vertexConfigured: Boolean(vertexProject),
  });
}
