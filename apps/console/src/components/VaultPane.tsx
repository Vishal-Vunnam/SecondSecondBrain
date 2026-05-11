import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { services } from "../config/workspace";
import type { ServiceKey, ServiceStatus, VaultEntry } from "../types";
import { StatusDot } from "./StatusDot";

type VaultPaneProps = {
  entries: VaultEntry[]; // recursive tree
  error: string | null;
  loading: boolean;
  onCreateNote: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onOpenFile: (path: string) => void;
  onRename: (entry: VaultEntry, newName: string) => Promise<void> | void;
  onDelete: (entry: VaultEntry) => void;
  onMove: (from: string, toParent: string) => void;
  selectedPath: string | null;
  statuses: Record<ServiceKey, ServiceStatus>;
};

type CtxMenu = { x: number; y: number; entry: VaultEntry | null };

function parentOf(p: string) {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? "" : p.slice(0, idx);
}

function matchTree(entries: VaultEntry[], normalizedQuery: string): VaultEntry[] {
  if (!normalizedQuery) return entries;
  const out: VaultEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "directory") {
      const childMatches = matchTree(entry.children ?? [], normalizedQuery);
      const selfMatches = entry.name.toLowerCase().includes(normalizedQuery);
      if (selfMatches || childMatches.length) {
        out.push({ ...entry, children: selfMatches ? entry.children ?? [] : childMatches });
      }
    } else if (entry.name.toLowerCase().includes(normalizedQuery)) {
      out.push(entry);
    }
  }
  return out;
}

function TreeNode({
  entry,
  depth,
  selectedPath,
  expanded,
  onToggle,
  onOpenFile,
  onContext,
  onMove,
  renaming,
  onCommitRename,
  onCancelRename,
}: {
  entry: VaultEntry;
  depth: number;
  selectedPath: string | null;
  expanded: Set<string>;
  onToggle: (p: string) => void;
  onOpenFile: (p: string) => void;
  onContext: (e: ReactMouseEvent, entry: VaultEntry) => void;
  onMove: (from: string, toParent: string) => void;
  renaming: string | null;
  onCommitRename: (entry: VaultEntry, name: string) => void;
  onCancelRename: () => void;
}) {
  const isOpen = expanded.has(entry.path);
  const isDir = entry.type === "directory";
  const isSelected = entry.path === selectedPath;
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isRenaming = renaming === entry.path;

  useEffect(() => {
    if (isRenaming) inputRef.current?.select();
  }, [isRenaming]);

  function handleClick() {
    if (isDir) onToggle(entry.path);
    else onOpenFile(entry.path);
  }

  function handleKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommitRename(entry, (e.target as HTMLInputElement).value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancelRename();
    }
  }

  return (
    <>
      <div
        className={`tree-row${isSelected ? " is-selected" : ""}${dragOver ? " is-drop" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={!isRenaming}
        onClick={isRenaming ? undefined : handleClick}
        onContextMenu={(e) => onContext(e, entry)}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/x-vault-path", entry.path);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (isDir) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          setDragOver(false);
          if (!isDir) return;
          e.preventDefault();
          const from = e.dataTransfer.getData("text/x-vault-path");
          if (from && from !== entry.path) onMove(from, entry.path);
        }}
      >
        <span className="tree-twirly">
          {isDir ? (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span style={{ width: 12 }} />}
        </span>
        <span className="tree-icon">
          {isDir ? (isOpen ? <FolderOpen size={14} /> : <Folder size={14} />) : <FileText size={14} />}
        </span>
        {isRenaming ? (
          <input
            ref={inputRef}
            className="tree-rename"
            defaultValue={entry.name}
            onBlur={(e) => onCommitRename(entry, e.target.value)}
            onKeyDown={handleKey}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="tree-name">{entry.name.replace(/\.md$/i, "")}</span>
        )}
      </div>
      {isDir && isOpen &&
        (entry.children ?? []).map((child) => (
          <TreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            expanded={expanded}
            onToggle={onToggle}
            onOpenFile={onOpenFile}
            onContext={onContext}
            onMove={onMove}
            renaming={renaming}
            onCommitRename={onCommitRename}
            onCancelRename={onCancelRename}
          />
        ))}
    </>
  );
}

export function VaultPane({
  entries,
  error,
  loading,
  onCreateNote,
  onCreateFolder,
  onOpenFile,
  onRename,
  onDelete,
  onMove,
  selectedPath,
  statuses,
}: VaultPaneProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [ctx, setCtx] = useState<CtxMenu | null>(null);

  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(() => matchTree(entries, normalized), [entries, normalized]);

  // auto-expand directories that match the search
  useEffect(() => {
    if (!normalized) return;
    const next = new Set(expanded);
    const walk = (list: VaultEntry[]) => {
      for (const e of list) {
        if (e.type === "directory") {
          next.add(e.path);
          walk(e.children ?? []);
        }
      }
    };
    walk(filtered);
    setExpanded(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized]);

  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [ctx]);

  function toggle(p: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function handleContext(e: ReactMouseEvent, entry: VaultEntry | null) {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, entry });
  }

  async function commitRename(entry: VaultEntry, raw: string) {
    const next = raw.trim();
    setRenaming(null);
    if (!next || next === entry.name) return;
    await onRename(entry, next);
  }

  function rootDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const from = e.dataTransfer.getData("text/x-vault-path");
    if (from) onMove(from, "");
  }

  return (
    <aside className="vault-pane" onContextMenu={(e) => handleContext(e, null)}>
      <header className="pane-heading">
        <h1>Vault</h1>
        <div className="vault-actions">
          <button title="New note" onClick={() => onCreateNote("")} type="button" aria-label="New note">
            <FilePlus size={13} />
          </button>
          <button title="New folder" onClick={() => onCreateFolder("")} type="button" aria-label="New folder">
            <FolderPlus size={13} />
          </button>
        </div>
      </header>

      <label className="search-plate">
        <Search size={13} />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          value={query}
          aria-label="Search vault"
        />
      </label>

      <div
        className="vault-tree"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={rootDrop}
      >
        {loading && <p className="empty-state">Loading vault…</p>}
        {!loading && error && <p className="error-state">{error}</p>}
        {!loading && !error && filtered.length === 0 && <p className="empty-state">No notes yet.</p>}
        {!loading && !error && filtered.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            selectedPath={selectedPath}
            expanded={expanded}
            onToggle={toggle}
            onOpenFile={onOpenFile}
            onContext={handleContext}
            onMove={onMove}
            renaming={renaming}
            onCommitRename={commitRename}
            onCancelRename={() => setRenaming(null)}
          />
        ))}
      </div>

      {ctx && (
        <div className="ctx-menu" style={{ top: ctx.y, left: ctx.x }} role="menu" onClick={(e) => e.stopPropagation()}>
          {ctx.entry?.type === "directory" || !ctx.entry ? (
            <>
              <button type="button" onClick={() => { onCreateNote(ctx.entry?.path ?? ""); setCtx(null); }}>
                <FilePlus size={13} /> New note
              </button>
              <button type="button" onClick={() => { onCreateFolder(ctx.entry?.path ?? ""); setCtx(null); }}>
                <FolderPlus size={13} /> New folder
              </button>
            </>
          ) : null}
          {ctx.entry && (
            <>
              <button type="button" onClick={() => { setRenaming(ctx.entry!.path); setCtx(null); }}>
                <Pencil size={13} /> Rename
              </button>
              <button type="button" className="danger" onClick={() => { onDelete(ctx.entry!); setCtx(null); }}>
                <Trash2 size={13} /> Delete
              </button>
            </>
          )}
        </div>
      )}

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

export { parentOf };
