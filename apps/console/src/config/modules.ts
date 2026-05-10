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
    title: "Health Overview",
    shortTitle: "Overview",
    description: "Fast health capture, today's state, and recent corrections.",
    group: "health",
    status: "active",
  },
  {
    id: "health-food",
    title: "Food",
    shortTitle: "Food",
    description: "Meal patterns and loose food logs.",
    group: "health",
    status: "planned",
  },
  {
    id: "fitness",
    title: "Fitness",
    shortTitle: "Fitness",
    description: "Training, recovery, and progress workspace.",
    group: "health",
    status: "planned",
  },
  {
    id: "health-body",
    title: "Body",
    shortTitle: "Body",
    description: "Sleep, recovery, energy, soreness, and body notes.",
    group: "health",
    status: "planned",
  },
];

export function getAppModule(id: AppModuleId) {
  return appModules.find((module) => module.id === id) ?? appModules[0];
}
