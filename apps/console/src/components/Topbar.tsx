import { RefreshCw } from "lucide-react";

type TopbarProps = {
  onRefresh: () => void;
  refreshing: boolean;
};

export function Topbar({ onRefresh, refreshing }: TopbarProps) {
  const host = window.location.hostname || "localhost";

  return (
    <header className="topbar">
      <h2>Second Brain</h2>
      <div className="topbar-actions">
        <span className="host-chip">{host}</span>
        <button className="icon-button" onClick={onRefresh} type="button" aria-label="Refresh status">
          <RefreshCw size={14} className={refreshing ? "spin" : ""} />
        </button>
      </div>
    </header>
  );
}
