import { Copy, ExternalLink, Terminal } from "lucide-react";
import { useState } from "react";
import { agentCommands } from "../config/workspace";

type TerminalPanelProps = {
  terminalUrl: string;
};

export function TerminalPanel({ terminalUrl }: TerminalPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
    } finally {
      setCopied(command);
      window.setTimeout(() => setCopied(null), 900);
    }
  }

  return (
    <section className="terminal-panel" id="terminal" aria-label="Vault terminal">
      <header className="terminal-heading">
        <div>
          <Terminal size={15} />
          <h3>Vault shell</h3>
        </div>
        <a href={terminalUrl} target="_blank" rel="noreferrer" className="terminal-link">
          <ExternalLink size={15} />
          Open
        </a>
      </header>
      <div className="command-row" aria-label="Agent command shortcuts">
        {agentCommands.map((item) => (
          <button
            className={copied === item.command ? "copied" : ""}
            key={item.command}
            onClick={() => copyCommand(item.command)}
            type="button"
            title={`Copy ${item.command}`}
          >
            <Copy size={14} />
            <span>{item.label}</span>
            <code>{item.command}</code>
          </button>
        ))}
      </div>
      <div className="terminal-frame">
        <iframe title="Second Brain terminal" src={terminalUrl} />
      </div>
    </section>
  );
}
