import { RefreshCw } from "lucide-react";

type TopbarProps = {
  onRefresh: () => void;
  refreshing: boolean;
};

export function Topbar({ onRefresh, refreshing }: TopbarProps) {
  const host = window.location.hostname || "localhost";

  return (
    <header className="topbar">
      <div>
        <p className="overline">Quiet Research OS</p>
        <h2>Atelier for notes, synthesis, and agent work</h2>
      </div>
      <div className="topbar-actions">
        <span className="host-chip">{host}</span>
        <button className="icon-button" onClick={onRefresh} type="button" aria-label="Refresh status">
          <RefreshCw size={17} className={refreshing ? "spin" : ""} />
        </button>
      </div>
    </header>
  );
}
