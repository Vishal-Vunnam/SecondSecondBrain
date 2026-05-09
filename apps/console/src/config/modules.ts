import type { AppModule, AppModuleId } from "../types";

export const appModules: AppModule[] = [
  {
    id: "notes",
    title: "Notes",
    shortTitle: "Notes",
    description: "Read, write, and organize the Obsidian vault.",
    group: "core",
    status: "active",
  },
  {
    id: "agent",
    title: "Agent",
    shortTitle: "Agent",
    description: "Choose agent tools and workflows for work inside the vault.",
    group: "core",
    status: "active",
  },
  {
    id: "terminal",
    title: "Terminal",
    shortTitle: "Shell",
    description: "Raw shell access in the synced vault folder.",
    group: "system",
    status: "active",
  },
  {
    id: "system",
    title: "System",
    shortTitle: "System",
    description: "Service state, sync, and infrastructure register.",
    group: "system",
    status: "active",
  },
  {
    id: "health",
    title: "Health",
    shortTitle: "Health",
    description: "A future personal health operating surface.",
    group: "life",
    status: "planned",
  },
  {
    id: "finances",
    title: "Finances",
    shortTitle: "Money",
    description: "A future finance, budget, and planning workspace.",
    group: "life",
    status: "planned",
  },
];

export function getAppModule(id: AppModuleId) {
  return appModules.find((module) => module.id === id) ?? appModules[0];
}
