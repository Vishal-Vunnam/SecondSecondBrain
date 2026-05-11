import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { FitnessPanel } from "./components/FitnessPanel";
import { HealthLogPanel } from "./components/HealthLogPanel";
import { HealthPanel } from "./components/HealthPanel";
import { HomePanel } from "./components/HomePanel";
import { LedgerPanel } from "./components/LedgerPanel";
import { ManuscriptPanel } from "./components/ManuscriptPanel";
import { PlannedModulePanel } from "./components/PlannedModulePanel";
import { ShoppingPanel } from "./components/ShoppingPanel";
import { TasksPanel } from "./components/TasksPanel";
import { TerminalPanel } from "./components/TerminalPanel";
import { Topbar } from "./components/Topbar";
import { VaultPane } from "./components/VaultPane";
import { getAppModule } from "./config/modules";
import { loadAuthStatus, login, logout } from "./lib/auth";
import { getCheckingStatuses, probeServices } from "./lib/health";
import { buildTerminalUrl } from "./lib/terminal";
import {
  createVaultFolder,
  deleteVaultEntry,
  loadVaultFile,
  loadVaultTree,
  renameVaultEntry,
  saveVaultFile,
} from "./lib/vault";
import type { AppModuleId, AppTheme, ServiceKey, ServiceStatus, VaultEntry, VaultFile } from "./types";

function joinVaultPath(directoryPath: string, fileName: string) {
  return directoryPath ? `${directoryPath}/${fileName}` : fileName;
}

const themeCycle: AppTheme[] = ["light", "dark", "guston-light", "guston-dark"];

function getInitialTheme(): AppTheme {
  const stored = window.localStorage.getItem("vishal-ai-theme") ?? window.localStorage.getItem("second-brain-theme");
  if (stored && (themeCycle as string[]).includes(stored)) return stored as AppTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function nextTheme(current: AppTheme): AppTheme {
  const index = themeCycle.indexOf(current);
  return themeCycle[(index + 1) % themeCycle.length];
}

export function App() {
  const terminalUrl = useMemo(buildTerminalUrl, []);
  const [authState, setAuthState] = useState<"checking" | "authenticated" | "locked">("checking");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statuses, setStatuses] = useState<Record<ServiceKey, ServiceStatus>>(getCheckingStatuses);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<VaultFile | null>(null);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeModuleId, setActiveModuleId] = useState<AppModuleId>("home");
  const [theme, setTheme] = useState<AppTheme>(getInitialTheme);
  const activeModule = getAppModule(activeModuleId);
  const authenticated = authState === "authenticated";

  const refreshHealth = useCallback(async () => {
    if (!authenticated) return;
    setRefreshing(true);
    setStatuses(getCheckingStatuses());

    const nextStatuses = await probeServices();
    setStatuses(nextStatuses);
    setRefreshing(false);
  }, [authenticated]);

  useEffect(() => {
    loadAuthStatus()
      .then((status) => {
        setAuthState(status.authenticated ? "authenticated" : "locked");
      })
      .catch(() => {
        setAuthState("locked");
      });
  }, []);

  useEffect(() => {
    if (authenticated) refreshHealth();
  }, [authenticated, refreshHealth]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("vishal-ai-theme", theme);
  }, [theme]);

  const loadTree = useCallback(async () => {
    setVaultLoading(true);
    setVaultError(null);
    try {
      const directory = await loadVaultTree("");
      setEntries(directory.entries);
    } catch (error) {
      setVaultError(error instanceof Error ? error.message : "Could not load vault tree");
    } finally {
      setVaultLoading(false);
    }
  }, []);

  const openFile = useCallback(
    async (path: string) => {
      if (dirty && !window.confirm("Discard unsaved changes?")) return;

      setVaultLoading(true);
      setVaultError(null);
      try {
        const file = await loadVaultFile(path);
        setActiveFile(file);
        setDraft(file.content);
        setDirty(false);
      } catch (error) {
        setVaultError(error instanceof Error ? error.message : "Could not open file");
      } finally {
        setVaultLoading(false);
      }
    },
    [dirty],
  );

  const saveFile = useCallback(async () => {
    if (!activeFile) return;

    setSaving(true);
    setVaultError(null);
    try {
      const file = await saveVaultFile(activeFile.path, draft);
      setActiveFile(file);
      setDraft(file.content);
      setDirty(false);
      await loadTree();
    } catch (error) {
      setVaultError(error instanceof Error ? error.message : "Could not save file");
    } finally {
      setSaving(false);
    }
  }, [activeFile, draft, loadTree]);

  function existingNamesAt(parentPath: string): Set<string> {
    if (!parentPath) return new Set(entries.map((e) => e.name));
    const stack: VaultEntry[] = [...entries];
    while (stack.length) {
      const e = stack.pop()!;
      if (e.path === parentPath && e.type === "directory") {
        return new Set((e.children ?? []).map((c) => c.name));
      }
      if (e.children) stack.push(...e.children);
    }
    return new Set();
  }

  const createNoteAt = useCallback(
    async (parentPath: string) => {
      if (dirty && !window.confirm("Discard unsaved changes?")) return;
      const existing = existingNamesAt(parentPath);
      let fileName = "Untitled.md";
      let index = 2;
      while (existing.has(fileName)) {
        fileName = `Untitled ${index}.md`;
        index += 1;
      }
      const path = joinVaultPath(parentPath, fileName);
      const title = fileName.replace(/\.md$/i, "");
      setSaving(true);
      setVaultError(null);
      try {
        const file = await saveVaultFile(path, `# ${title}\n\n`);
        await loadTree();
        setActiveFile(file);
        setDraft(file.content);
        setDirty(false);
      } catch (error) {
        setVaultError(error instanceof Error ? error.message : "Could not create note");
      } finally {
        setSaving(false);
      }
    },
    [dirty, entries, loadTree],
  );

  const createFolderAt = useCallback(
    async (parentPath: string) => {
      const existing = existingNamesAt(parentPath);
      let name = "New Folder";
      let index = 2;
      while (existing.has(name)) {
        name = `New Folder ${index}`;
        index += 1;
      }
      try {
        await createVaultFolder(joinVaultPath(parentPath, name));
        await loadTree();
      } catch (error) {
        setVaultError(error instanceof Error ? error.message : "Could not create folder");
      }
    },
    [entries, loadTree],
  );

  const renameEntry = useCallback(
    async (entry: VaultEntry, newName: string) => {
      const parent = entry.path.includes("/") ? entry.path.slice(0, entry.path.lastIndexOf("/")) : "";
      const finalName = entry.type === "file" && !/\.md$/i.test(newName) ? `${newName}.md` : newName;
      const to = joinVaultPath(parent, finalName);
      if (to === entry.path) return;
      try {
        const result = await renameVaultEntry(entry.path, to);
        if (activeFile && (activeFile.path === entry.path || activeFile.path.startsWith(`${entry.path}/`))) {
          const newPath = activeFile.path.replace(entry.path, result.path);
          const file = await loadVaultFile(newPath);
          setActiveFile(file);
          setDraft(file.content);
          setDirty(false);
        }
        await loadTree();
      } catch (error) {
        setVaultError(error instanceof Error ? error.message : "Could not rename");
      }
    },
    [activeFile, loadTree],
  );

  const moveEntry = useCallback(
    async (from: string, toParent: string) => {
      const name = from.includes("/") ? from.slice(from.lastIndexOf("/") + 1) : from;
      const to = joinVaultPath(toParent, name);
      if (to === from) return;
      // prevent moving a folder into its own descendant
      if (to.startsWith(`${from}/`)) return;
      try {
        await renameVaultEntry(from, to);
        if (activeFile && (activeFile.path === from || activeFile.path.startsWith(`${from}/`))) {
          const newPath = activeFile.path.replace(from, to);
          const file = await loadVaultFile(newPath);
          setActiveFile(file);
          setDraft(file.content);
          setDirty(false);
        }
        await loadTree();
      } catch (error) {
        setVaultError(error instanceof Error ? error.message : "Could not move");
      }
    },
    [activeFile, loadTree],
  );

  const deleteEntry = useCallback(
    async (entry: VaultEntry) => {
      if (!window.confirm(`Delete ${entry.name}?`)) return;
      try {
        await deleteVaultEntry(entry.path);
        if (activeFile && (activeFile.path === entry.path || activeFile.path.startsWith(`${entry.path}/`))) {
          setActiveFile(null);
          setDraft("");
          setDirty(false);
        }
        await loadTree();
      } catch (error) {
        setVaultError(error instanceof Error ? error.message : "Could not delete");
      }
    },
    [activeFile, loadTree],
  );

  const openTaskNote = useCallback(
    async (path: string) => {
      await openFile(path);
      setActiveModuleId("notes");
    },
    [openFile],
  );

  useEffect(() => {
    if (authenticated) loadTree();
  }, [authenticated, loadTree]);

  async function handleLogin(password: string) {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const status = await login(password);
      setAuthState(status.authenticated ? "authenticated" : "locked");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not unlock Vishal.ai");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await logout().catch(() => undefined);
    setAuthState("locked");
    setEntries([]);
    setActiveFile(null);
    setDraft("");
    setDirty(false);
  }

  if (authState !== "authenticated") {
    return <AuthPanel error={authError} loading={authLoading || authState === "checking"} onLogin={handleLogin} />;
  }

  return (
    <main className={`atelier-shell ${activeModuleId === "notes" ? "with-context" : ""}`}>
      <Topbar
        activeModule={activeModule}
        activeModuleId={activeModuleId}
        onLogout={handleLogout}
        onRefresh={refreshHealth}
        onSelectModule={setActiveModuleId}
        onToggleTheme={() => setTheme(nextTheme)}
        refreshing={refreshing}
        theme={theme}
      />
      <div className="app-body">
        {activeModuleId === "notes" && (
          <VaultPane
            entries={entries}
            error={vaultError}
            loading={vaultLoading}
            onCreateNote={createNoteAt}
            onCreateFolder={createFolderAt}
            onOpenFile={openFile}
            onRename={renameEntry}
            onDelete={deleteEntry}
            onMove={moveEntry}
            selectedPath={activeFile?.path ?? null}
            statuses={statuses}
          />
        )}
        <section className="workbench">
          <div className="workspace-page">
            {activeModuleId === "home" && (
              <HomePanel
                noteCount={entries.filter((entry) => entry.type === "file").length}
                onSelectModule={setActiveModuleId}
                statuses={statuses}
              />
            )}
            {activeModuleId === "tasks" && <TasksPanel onOpenTask={openTaskNote} />}
            {activeModuleId === "health" && <HealthPanel />}
            {activeModuleId === "health-log" && <HealthLogPanel />}
            {activeModuleId === "fitness" && <FitnessPanel />}
            {activeModuleId === "shopping" && <ShoppingPanel />}
            {activeModuleId === "notes" && (
              <ManuscriptPanel
                dirty={dirty}
                file={activeFile}
                onChange={(content) => {
                  setDraft(content);
                  setDirty(true);
                }}
                onSave={saveFile}
                saving={saving}
                value={draft}
              />
            )}
            {activeModuleId === "terminal" && <TerminalPanel terminalUrl={terminalUrl} />}
            {activeModuleId === "system" && <LedgerPanel />}
            {activeModule.status === "planned" && <PlannedModulePanel module={activeModule} />}
          </div>
        </section>
      </div>
    </main>
  );
}
