import { ChevronLeft, FileText, Folder, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { services } from "../config/workspace";
import type { ServiceKey, ServiceStatus, VaultEntry } from "../types";
import { StatusDot } from "./StatusDot";

type VaultPaneProps = {
  currentPath: string;
  entries: VaultEntry[];
  error: string | null;
  loading: boolean;
  onCreateNote: () => void;
  onOpenEntry: (entry: VaultEntry) => void;
  onOpenParent?: () => void;
  selectedPath: string | null;
  statuses: Record<ServiceKey, ServiceStatus>;
};

export function VaultPane({
  currentPath,
  entries,
  error,
  loading,
  onCreateNote,
  onOpenEntry,
  onOpenParent,
  selectedPath,
  statuses,
}: VaultPaneProps) {
  const [query, setQuery] = useState("");
  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return entries;
    return entries.filter((entry) => entry.name.toLowerCase().includes(normalized));
  }, [entries, query]);

  return (
    <aside className="vault-pane">
      <header className="pane-heading">
        <h1>Vault</h1>
        <button className="new-note-button" onClick={onCreateNote} type="button">
          <Plus size={13} />
          New
        </button>
      </header>

      <label className="search-plate">
        <Search size={13} />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          value={query}
          aria-label="Search archive"
        />
      </label>

      <div className="file-browser">
        <div className="path-row">
          <button disabled={!onOpenParent} onClick={onOpenParent} type="button" aria-label="Open parent folder">
            <ChevronLeft size={14} />
          </button>
          <span>{currentPath || "Vault root"}</span>
        </div>
        <nav className="file-list" aria-label="Vault files">
          {loading && <p className="empty-state">Loading vault...</p>}
          {!loading && error && <p className="error-state">{error}</p>}
          {!loading && !error && filteredEntries.length === 0 && <p className="empty-state">No files here.</p>}
          {!loading &&
            !error &&
            filteredEntries.map((entry) => (
              <button
                className={`file-item ${entry.path === selectedPath ? "active" : ""}`}
                key={entry.path}
                onClick={() => onOpenEntry(entry)}
                type="button"
              >
                {entry.type === "directory" ? <Folder size={14} /> : <FileText size={14} />}
                <span>{entry.name}</span>
              </button>
            ))}
        </nav>
      </div>

      <section className="service-ledger" aria-label="Service state">
        {services.map((service) => (
          <div className="service-row" key={service.key}>
            <StatusDot status={statuses[service.key]} />
            <strong>{service.label}</strong>
            <span>{service.detail}</span>
          </div>
        ))}
      </section>
    </aside>
  );
}
