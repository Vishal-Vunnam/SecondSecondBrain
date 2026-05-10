import { Brain, FolderTree, Network, ShieldCheck } from "lucide-react";

export function LedgerPanel() {
  return (
    <aside className="ledger-panel" id="ledger">
      <div className="panel-heading">
        <div>
          <p className="overline">Ledger</p>
          <h3>System Register</h3>
        </div>
        <ShieldCheck size={20} />
      </div>
      <dl className="register-list">
        <div>
          <dt>Vault path</dt>
          <dd>ops/brain-stack/vault</dd>
        </div>
        <div>
          <dt>Folder ID</dt>
          <dd>obsidian-vault</dd>
        </div>
        <div>
          <dt>Workspace rules</dt>
          <dd>AGENTS.md</dd>
        </div>
        <div>
          <dt>Terminal</dt>
          <dd>port 7681</dd>
        </div>
      </dl>
      <div className="context-stack">
        <div>
          <Network size={18} />
          <span>Tailscale-only surface</span>
        </div>
        <div>
          <FolderTree size={18} />
          <span>Bidirectional file sync</span>
        </div>
        <div>
          <Brain size={18} />
          <span>Tool-neutral workspace</span>
        </div>
      </div>
    </aside>
  );
}
