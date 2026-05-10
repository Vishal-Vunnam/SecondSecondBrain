import type { AppModule, AppModuleId } from "../types";

export const appModules: AppModule[] = [
  {
    id: "home",
    title: "Home",
    shortTitle: "Home",
    description: "Daily brief, system status, and launch surface.",
    group: "home",
    status: "active",
  },
  {
    id: "notes",
    title: "Notes",
    shortTitle: "Notes",
    description: "Read, write, and organize the Obsidian vault.",
    group: "knowledge",
    status: "active",
  },
  {
    id: "tasks",
    title: "Tasks",
    shortTitle: "Tasks",
    description: "Markdown-backed actions connected to notes.",
    group: "home",
    status: "active",
  },
  {
    id: "terminal",
    title: "Terminal",
    shortTitle: "Shell",
    description: "Raw shell access in the synced vault folder.",
    group: "knowledge",
    status: "active",
  },
  {
    id: "system",
    title: "System",
    shortTitle: "System",
    description: "Service state, sync, and infrastructure register.",
    group: "knowledge",
    status: "active",
  },
  {
    id: "health",
    title: "Health",
    shortTitle: "Health",
    description: "A future personal health operating surface.",
    group: "health",
    status: "planned",
  },
  {
    id: "fitness",
    title: "Fitness",
    shortTitle: "Fitness",
    description: "A future training, recovery, and progress workspace.",
    group: "fitness",
    status: "planned",
  },
];

export function getAppModule(id: AppModuleId) {
  return appModules.find((module) => module.id === id) ?? appModules[0];
}
