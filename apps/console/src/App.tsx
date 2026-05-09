import { useCallback, useEffect, useMemo, useState } from "react";
import { LedgerPanel } from "./components/LedgerPanel";
import { ManuscriptPanel } from "./components/ManuscriptPanel";
import { Rail } from "./components/Rail";
import { TerminalPanel } from "./components/TerminalPanel";
import { Topbar } from "./components/Topbar";
import { VaultPane } from "./components/VaultPane";
import { getCheckingStatuses, probeServices } from "./lib/health";
import { buildTerminalUrl } from "./lib/terminal";
import { loadVaultDirectory, loadVaultFile, saveVaultFile } from "./lib/vault";
import type { ServiceKey, ServiceStatus, VaultEntry, VaultFile } from "./types";

function joinVaultPath(directoryPath: string, fileName: string) {
  return directoryPath ? `${directoryPath}/${fileName}` : fileName;
}

export function App() {
  const terminalUrl = useMemo(buildTerminalUrl, []);
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

  const refreshHealth = useCallback(async () => {
    setRefreshing(true);
    setStatuses(getCheckingStatuses());

    const nextStatuses = await probeServices();
    setStatuses(nextStatuses);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

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

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  return (
    <main className="atelier-shell">
      <Rail />
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
      <section className="workbench">
        <Topbar onRefresh={refreshHealth} refreshing={refreshing} />
        <div className="workspace-grid">
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
          <LedgerPanel />
          <TerminalPanel terminalUrl={terminalUrl} />
        </div>
      </section>
    </main>
  );
}
