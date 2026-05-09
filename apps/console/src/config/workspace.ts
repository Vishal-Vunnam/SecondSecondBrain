import type { AgentCommand, Service, ServiceKey, ServiceStatus, Shelf } from "../types";

export const services: Service[] = [
  { key: "syncthing", label: "Syncthing", detail: "vault mirror", endpoint: "/health/syncthing" },
  { key: "terminal", label: "Terminal", detail: "agent shell", endpoint: "/health/terminal" },
  { key: "couchdb", label: "CouchDB", detail: "legacy sync", endpoint: "/health/couchdb" },
  { key: "ollama", label: "Ollama", detail: "local fallback", endpoint: "/health/ollama" },
];

export const initialStatuses: Record<ServiceKey, ServiceStatus> = {
  syncthing: "checking",
  terminal: "checking",
  couchdb: "checking",
  ollama: "checking",
};

export const shelves: Shelf[] = [
  { name: "Index", detail: "Second Brain Ideas", count: "01" },
  { name: "The Brain", detail: "Systems, notes, synthesis", count: "02" },
  { name: "The Lab", detail: "Experiments and prototypes", count: "03" },
  { name: "The Life", detail: "Personal canon", count: "04" },
  { name: "External World", detail: "Signals and references", count: "05" },
];

export const agentCommands: AgentCommand[] = [
  { command: "codex", label: "Codex" },
  { command: "claude", label: "Claude" },
  { command: "aider", label: "Aider" },
  { command: "nvim .", label: "Editor" },
];
