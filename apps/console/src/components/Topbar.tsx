import { Moon, RefreshCw, Sun } from "lucide-react";
import type { AppTheme } from "../types";

type TopbarProps = {
  onRefresh: () => void;
  onToggleTheme: () => void;
  refreshing: boolean;
  theme: AppTheme;
};

export function Topbar({ onRefresh, onToggleTheme, refreshing, theme }: TopbarProps) {
  const host = window.location.hostname || "localhost";
  const ThemeIcon = theme === "dark" ? Sun : Moon;

  return (
    <header className="topbar">
      <h2>Second Brain</h2>
      <div className="topbar-actions">
        <span className="host-chip">{host}</span>
        <button
          className="icon-button"
          onClick={onToggleTheme}
          type="button"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
        >
          <ThemeIcon size={14} />
        </button>
        <button className="icon-button" onClick={onRefresh} type="button" aria-label="Refresh status">
          <RefreshCw size={14} className={refreshing ? "spin" : ""} />
        </button>
      </div>
    </header>
  );
}
