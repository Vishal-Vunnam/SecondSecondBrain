import { ExternalLink, Terminal } from "lucide-react";

type TerminalPanelProps = {
  terminalUrl: string;
};

export function TerminalPanel({ terminalUrl }: TerminalPanelProps) {
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
      <div className="terminal-frame">
        <iframe title="Vishal.ai terminal" src={terminalUrl} />
      </div>
    </section>
  );
}
