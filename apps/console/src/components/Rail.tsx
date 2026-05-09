import { BookOpenText, GalleryVerticalEnd, Terminal } from "lucide-react";
import type { WorkspacePanel } from "../types";

type RailProps = {
  activePanel: WorkspacePanel;
  onSelectPanel: (panel: WorkspacePanel) => void;
};

const railItems: Array<{ panel: WorkspacePanel; label: string; icon: typeof BookOpenText }> = [
  { panel: "notes", label: "Notes", icon: BookOpenText },
  { panel: "terminal", label: "Terminal", icon: Terminal },
  { panel: "ledger", label: "Ledger", icon: GalleryVerticalEnd },
];

export function Rail({ activePanel, onSelectPanel }: RailProps) {
  return (
    <aside className="rail" aria-label="Workspace rail">
      <div className="sigil">SB</div>
      <nav className="rail-nav">
        {railItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              aria-label={item.label}
              aria-pressed={activePanel === item.panel}
              className={`rail-button ${activePanel === item.panel ? "active" : ""}`}
              key={item.panel}
              onClick={() => onSelectPanel(item.panel)}
              title={item.label}
              type="button"
            >
              <Icon size={18} />
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
