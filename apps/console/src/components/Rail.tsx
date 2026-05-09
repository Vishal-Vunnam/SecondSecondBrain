import { Activity, BookOpenText, Bot, ChartNoAxesCombined, GalleryVerticalEnd, Terminal } from "lucide-react";
import { appModules } from "../config/modules";
import type { AppModuleGroup, AppModuleId } from "../types";

type RailProps = {
  activeModuleId: AppModuleId;
  onSelectModule: (module: AppModuleId) => void;
};

const moduleIcons: Record<AppModuleId, typeof BookOpenText> = {
  notes: BookOpenText,
  agent: Bot,
  terminal: Terminal,
  system: GalleryVerticalEnd,
  health: Activity,
  finances: ChartNoAxesCombined,
};

const groupLabels: Record<AppModuleGroup, string> = {
  core: "Core",
  system: "Ops",
  life: "Life",
};

const groups: AppModuleGroup[] = ["core", "system", "life"];

export function Rail({ activeModuleId, onSelectModule }: RailProps) {
  return (
    <aside className="rail" aria-label="Application rail">
      <div className="sigil">SB</div>
      <nav className="rail-nav">
        {groups.map((group) => (
          <div className="rail-group" key={group}>
            <span>{groupLabels[group]}</span>
            {appModules
              .filter((module) => module.group === group)
              .map((module) => {
                const Icon = moduleIcons[module.id];
                return (
                  <button
                    aria-label={module.title}
                    aria-pressed={activeModuleId === module.id}
                    className={`rail-button ${activeModuleId === module.id ? "active" : ""} ${
                      module.status === "planned" ? "planned" : ""
                    }`}
                    key={module.id}
                    onClick={() => onSelectModule(module.id)}
                    title={module.title}
                    type="button"
                  >
                    <Icon size={17} />
                    <small>{module.shortTitle}</small>
                  </button>
                );
              })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
