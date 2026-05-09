export type ServiceKey = "syncthing" | "terminal" | "couchdb" | "ollama";

export type ServiceStatus = "checking" | "online" | "offline";

export type Service = {
  key: ServiceKey;
  label: string;
  detail: string;
  endpoint: string;
};

export type WorkspacePanel = "notes" | "terminal" | "agent" | "ledger";

export type AppTheme = "light" | "dark";

export type Shelf = {
  name: string;
  detail: string;
  count: string;
};

export type AgentCommand = {
  command: string;
  label: string;
};

export type VaultEntry = {
  name: string;
  path: string;
  type: "directory" | "file";
  size: number;
  modifiedAt: string;
};

export type VaultDirectory = {
  path: string;
  parentPath: string | null;
  entries: VaultEntry[];
};

export type VaultFile = {
  path: string;
  name: string;
  content: string;
  modifiedAt: string;
  size: number;
};
