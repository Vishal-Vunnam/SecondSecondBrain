export type ServiceKey = "syncthing" | "terminal" | "couchdb" | "ollama";

export type ServiceStatus = "checking" | "online" | "offline";

export type Service = {
  key: ServiceKey;
  label: string;
  detail: string;
  endpoint: string;
};

export type AppModuleId = "home" | "tasks" | "notes" | "terminal" | "system" | "health" | "fitness";

export type AppModuleStatus = "active" | "planned";

export type AppModuleGroup = "home" | "knowledge" | "health" | "fitness";

export type AppModule = {
  id: AppModuleId;
  title: string;
  shortTitle: string;
  description: string;
  group: AppModuleGroup;
  status: AppModuleStatus;
};

export type AppTheme = "light" | "dark" | "guston-light" | "guston-dark";

export type Shelf = {
  name: string;
  detail: string;
  count: string;
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

export type WeatherSummary = {
  location: string;
  condition: string;
  temperatureF: number | null;
  feelsLikeF: number | null;
  windMph: number | null;
  observedAt: string | null;
};

export type NewsItem = {
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
};

export type NewsSummary = {
  source: string;
  generatedAt: string;
  items: NewsItem[];
};

export type TaskStatus = "todo" | "doing" | "done";

export type TaskPriority = "low" | "medium" | "high";

export type TaskItem = {
  path: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due: string | null;
  project: string | null;
  links: string[];
  created: string | null;
  modifiedAt: string;
  body: string;
};

export type TaskCreateInput = {
  title: string;
  context?: string;
  due?: string;
  priority?: TaskPriority;
  project?: string;
  links?: string[];
};
