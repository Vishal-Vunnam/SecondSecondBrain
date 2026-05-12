import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { AgentPanel } from "./AgentPanel";

function FaceWithGlasses({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="8.5" cy="11" r="2" />
      <circle cx="15.5" cy="11" r="2" />
      <line x1="10.5" y1="11" x2="13.5" y2="11" />
      <path d="M9 15.5c.9 1 2 1.5 3 1.5s2.1-.5 3-1.5" />
    </svg>
  );
}

export function AgentDock() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`agent-dock-launcher${open ? " open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close vishalbot" : "Open vishalbot"}
        title="vishalbot"
      >
        {open ? <X size={18} /> : <FaceWithGlasses size={22} />}
      </button>

      <div className={`agent-dock${open ? " open" : ""}`} aria-hidden={!open}>
        <AgentPanel />
      </div>
    </>
  );
}
