export type ServiceKey = "syncthing" | "terminal" | "couchdb" | "ollama";

export type ServiceStatus = "checking" | "online" | "offline";

export type Service = {
  key: ServiceKey;
  label: string;
  detail: string;
  endpoint: string;
};

export type Shelf = {
  name: string;
  detail: string;
  count: string;
};

export type AgentCommand = {
  command: string;
  label: string;
};
