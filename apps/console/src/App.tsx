import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { HomePanel } from "./components/HomePanel";
import { LedgerPanel } from "./components/LedgerPanel";
import { ManuscriptPanel } from "./components/ManuscriptPanel";
import { PlannedModulePanel } from "./components/PlannedModulePanel";
import { TasksPanel } from "./components/TasksPanel";
import { TerminalPanel } from "./components/TerminalPanel";
import { Topbar } from "./components/Topbar";
import { VaultPane } from "./components/VaultPane";
import { getAppModule } from "./config/modules";
import { loadAuthStatus, login, logout } from "./lib/auth";
import { getCheckingStatuses, probeServices } from "./lib/health";
import { buildTerminalUrl } from "./lib/terminal";
import { loadVaultDirectory, loadVaultFile, saveVaultFile } from "./lib/vault";
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
  const [currentDirectory, setCurrentDirectory] = useState("");
  const [parentDirectory, setParentDirectory] = useState<string | null>(null);
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

  const loadDirectory = useCallback(async (path = "") => {
    setVaultLoading(true);
    setVaultError(null);
    try {
      const directory = await loadVaultDirectory(path);
      setEntries(directory.entries);
      setCurrentDirectory(directory.path);
      setParentDirectory(directory.parentPath);
    } catch (error) {
      setVaultError(error instanceof Error ? error.message : "Could not load vault directory");
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

  const openEntry = useCallback(
    async (entry: VaultEntry) => {
      if (entry.type === "directory") {
        await loadDirectory(entry.path);
        return;
      }
      await openFile(entry.path);
    },
    [loadDirectory, openFile],
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
      await loadDirectory(currentDirectory);
    } catch (error) {
      setVaultError(error instanceof Error ? error.message : "Could not save file");
    } finally {
      setSaving(false);
    }
  }, [activeFile, currentDirectory, draft, loadDirectory]);

  const createNote = useCallback(async () => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;

    const existingNames = new Set(entries.map((entry) => entry.name));
    let fileName = "Untitled.md";
    let index = 2;
    while (existingNames.has(fileName)) {
      fileName = `Untitled ${index}.md`;
      index += 1;
    }

    const path = joinVaultPath(currentDirectory, fileName);
    const title = fileName.replace(/\.md$/i, "");
    setSaving(true);
    setVaultError(null);
    try {
      const file = await saveVaultFile(path, `# ${title}\n\n`);
      await loadDirectory(currentDirectory);
      setActiveFile(file);
      setDraft(file.content);
      setDirty(false);
    } catch (error) {
      setVaultError(error instanceof Error ? error.message : "Could not create note");
    } finally {
      setSaving(false);
    }
  }, [currentDirectory, dirty, entries, loadDirectory]);

  const openTaskNote = useCallback(
    async (path: string) => {
      await openFile(path);
      setActiveModuleId("notes");
    },
    [openFile],
  );

  useEffect(() => {
    if (authenticated) loadDirectory();
  }, [authenticated, loadDirectory]);

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
            currentPath={currentDirectory}
            entries={entries}
            error={vaultError}
            loading={vaultLoading}
            onCreateNote={createNote}
            onOpenEntry={openEntry}
            onOpenParent={parentDirectory === null ? undefined : () => loadDirectory(parentDirectory)}
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
