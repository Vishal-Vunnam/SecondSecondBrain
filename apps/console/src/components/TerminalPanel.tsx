import { ExternalLink, Sparkles } from "lucide-react";

type TerminalPanelProps = {
  terminalUrl: string;
};

export function TerminalPanel({ terminalUrl }: TerminalPanelProps) {
  return (
    <section className="terminal-panel" id="terminal" aria-label="vishalbot agent">
      <header className="terminal-heading">
        <div>
          <Sparkles size={15} />
          <h3>vishalbot</h3>
          <span className="terminal-subtitle">Claude Code · vault session</span>
        </div>
        <a href={terminalUrl} target="_blank" rel="noreferrer" className="terminal-link">
          <ExternalLink size={15} />
          Open
        </a>
      </header>
      <div className="terminal-frame">
        <iframe title="vishalbot terminal" src={terminalUrl} />
      </div>
    </section>
  );
}
