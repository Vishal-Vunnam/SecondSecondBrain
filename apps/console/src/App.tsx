import { useCallback, useEffect, useMemo, useState } from "react";
import { LedgerPanel } from "./components/LedgerPanel";
import { ManuscriptPanel } from "./components/ManuscriptPanel";
import { Rail } from "./components/Rail";
import { TerminalPanel } from "./components/TerminalPanel";
import { Topbar } from "./components/Topbar";
import { VaultPane } from "./components/VaultPane";
import { getCheckingStatuses, probeServices } from "./lib/health";
import { buildTerminalUrl } from "./lib/terminal";
import type { ServiceKey, ServiceStatus } from "./types";

export function App() {
  const terminalUrl = useMemo(buildTerminalUrl, []);
  const [refreshing, setRefreshing] = useState(false);
  const [statuses, setStatuses] = useState<Record<ServiceKey, ServiceStatus>>(getCheckingStatuses);

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

  return (
    <main className="atelier-shell">
      <Rail />
      <VaultPane statuses={statuses} />
      <section className="workbench">
        <Topbar onRefresh={refreshHealth} refreshing={refreshing} />
        <div className="workspace-grid">
          <ManuscriptPanel />
          <LedgerPanel />
          <TerminalPanel terminalUrl={terminalUrl} />
        </div>
      </section>
    </main>
  );
}
