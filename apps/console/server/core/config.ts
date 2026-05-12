import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const port = Number(process.env.PORT ?? 80);
export const host = process.env.HOST ?? "0.0.0.0";
export const publicRoot = path.resolve(process.env.PUBLIC_ROOT ?? path.join(__dirname, "../../public"));
export const vaultRoot = path.resolve(process.env.VAULT_ROOT ?? "/vault");
export const tailScaleIp = process.env.TAILSCALE_IP ?? "127.0.0.1";
export const terminalPort = process.env.TERMINAL_PORT ?? "7681";
export const maxFileBytes = Number(process.env.MAX_VAULT_FILE_BYTES ?? 5 * 1024 * 1024);
export const hiddenFileNames = new Set(["AGENTS.md"]);
export const tasksDirectory = "tasks";
export const homeLocation = process.env.HOME_LOCATION ?? "Boulder";
export const homeLatitude = process.env.HOME_LAT ?? "40.0150";
export const homeLongitude = process.env.HOME_LON ?? "-105.2705";
export const newsSource = process.env.NEWS_SOURCE ?? "BBC News";
export const newsFeedUrl = process.env.NEWS_RSS_URL ?? "https://feeds.bbci.co.uk/news/rss.xml";
export const authPassword = process.env.BRAIN_CONSOLE_PASSWORD ?? process.env.VISHAL_AI_PASSWORD ?? "";
export const authSecret = process.env.BRAIN_CONSOLE_SESSION_SECRET ?? process.env.VISHAL_AI_SESSION_SECRET ?? authPassword;
export const intakeToken = process.env.VISHAL_AI_INTAKE_TOKEN ?? "";
export const mcpBearerToken = process.env.MCP_BEARER_TOKEN ?? "";
export const vertexProject = process.env.GOOGLE_VERTEX_PROJECT ?? process.env.GCLOUD_PROJECT ?? "";
export const vertexLocation = process.env.GOOGLE_VERTEX_LOCATION ?? "us-central1";
export const xaiApiKey = process.env.XAI_API_KEY ?? "";
export const agentDailyCap = Number(process.env.AGENT_DAILY_REQUEST_CAP ?? 500);
export const agentDefaultModel = process.env.AGENT_DEFAULT_MODEL ?? "flash-lite";
export const agentModelIds = {
  "flash-lite": process.env.AGENT_MODEL_FLASH_LITE ?? "gemini-2.5-flash-lite",
  flash: process.env.AGENT_MODEL_FLASH ?? "gemini-2.5-flash",
  "gemini-pro": process.env.AGENT_MODEL_GEMINI_PRO ?? "gemini-2.5-pro",
  haiku: process.env.AGENT_MODEL_HAIKU ?? "claude-haiku-4-5@20251001",
  sonnet: process.env.AGENT_MODEL_SONNET ?? "claude-sonnet-4-6@20251031",
  grok: process.env.AGENT_MODEL_GROK ?? "grok-4",
};
export const geminiApiKey = process.env.GEMINI_API_KEY ?? "";
export const geminiTaskModel = process.env.GEMINI_TASK_MODEL ?? "gemini-2.5-flash";
export const geminiHealthModel = process.env.GEMINI_HEALTH_MODEL ?? "gemini-2.5-flash-lite";
export const healthDbPath = path.resolve(process.env.VISHAL_AI_DB_PATH ?? path.join(process.cwd(), "data/vishal-ai.db"));
export const authCookieName = "vishal_ai_session";
export const authMaxAgeSeconds = 60 * 60 * 24 * 14;
