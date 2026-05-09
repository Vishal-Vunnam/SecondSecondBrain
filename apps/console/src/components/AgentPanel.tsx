import { Bot, Copy, ExternalLink, Sparkles } from "lucide-react";
import { useState } from "react";
import { agentCommands } from "../config/workspace";

type AgentPanelProps = {
  terminalUrl: string;
};

export function AgentPanel({ terminalUrl }: AgentPanelProps) {
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
    <section className="agent-panel" aria-label="Agent launcher">
      <header className="agent-heading">
        <div>
          <Bot size={18} />
          <span>Agent desk</span>
        </div>
        <a href={terminalUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={14} />
          Open shell
        </a>
      </header>

      <div className="agent-body">
        <div className="agent-copy">
          <Sparkles size={18} />
          <h3>Choose the agent, then work in the vault.</h3>
          <p>
            These commands are launchers only. The terminal is a separate page; this desk is for choosing the tool and
            keeping the workflow clear.
          </p>
        </div>

        <div className="agent-command-grid">
          {agentCommands.map((item) => (
            <button
              className={copied === item.command ? "copied" : ""}
              key={item.command}
              onClick={() => copyCommand(item.command)}
              type="button"
            >
              <span>{item.label}</span>
              <code>{item.command}</code>
              <Copy size={14} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
