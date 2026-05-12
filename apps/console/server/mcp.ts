import type { IncomingMessage, ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { mcpBearerToken } from "./core/config.js";
import { safeEqual } from "./core/auth.js";
import { readJsonBody, sendJson } from "./core/http.js";
import { tools, getTool } from "./tools.js";

function buildServer() {
  const server = new Server(
    { name: "vishalbot", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = getTool(name);
    if (!tool) {
      return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }
    try {
      const result = await tool.handler((args ?? {}) as Record<string, unknown>);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { isError: true, content: [{ type: "text", text: message }] };
    }
  });

  return server;
}

function hasValidMcpBearer(req: IncomingMessage) {
  if (!mcpBearerToken.trim()) return false;
  const header = req.headers.authorization ?? "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  return token.length > 0 && safeEqual(token, mcpBearerToken);
}

export async function handleMcpRequest(req: IncomingMessage, res: ServerResponse) {
  if (!hasValidMcpBearer(req)) {
    sendJson(res, 401, { error: "Valid MCP bearer token required" });
    return;
  }

  let body: unknown = undefined;
  if (req.method === "POST") {
    try {
      body = await readJsonBody(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request body";
      sendJson(res, 400, { error: message });
      return;
    }
  }

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
