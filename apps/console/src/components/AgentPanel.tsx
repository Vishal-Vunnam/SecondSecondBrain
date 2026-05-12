import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Loader2, Square, Wrench } from "lucide-react";

function FaceWithGlasses({ size = 15 }: { size?: number }) {
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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MODEL_KEYS = ["flash-lite", "flash", "gemini-pro"] as const;
type ModelKey = (typeof MODEL_KEYS)[number];

const MODEL_LABELS: Record<ModelKey, string> = {
  "flash-lite": "Gemini Flash-Lite",
  flash: "Gemini Flash",
  "gemini-pro": "Gemini Pro",
};

const STORAGE_KEY = "vishalbot.model";

function isModelKey(value: string): value is ModelKey {
  return (MODEL_KEYS as readonly string[]).includes(value);
}

export function AgentPanel() {
  const [model, setModel] = useState<ModelKey>(() => {
    if (typeof window === "undefined") return "flash-lite";
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && isModelKey(stored) ? stored : "flash-lite";
  });
  const modelRef = useRef(model);
  modelRef.current = model;

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, model);
  }, [model]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent/chat",
        credentials: "same-origin",
        body: () => ({ model: modelRef.current }),
      }),
    [],
  );

  const { messages, sendMessage, status, stop, error, setMessages } = useChat({ transport });

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const submit = useCallback(
    (event?: React.FormEvent) => {
      event?.preventDefault();
      const trimmed = input.trim();
      if (!trimmed) return;

      const slash = trimmed.match(/^\/model\s+(\S+)\s*$/i);
      if (slash) {
        const target = slash[1].toLowerCase();
        if (isModelKey(target)) {
          setModel(target);
          setInput("");
          return;
        }
        return;
      }

      if (trimmed === "/clear") {
        setMessages([]);
        setInput("");
        return;
      }

      sendMessage({ text: trimmed });
      setInput("");
    },
    [input, sendMessage, setMessages],
  );

  const busy = status === "streaming" || status === "submitted";

  return (
    <section className="agent-panel" id="agent" aria-label="vishalbot agent">
      <header className="agent-heading">
        <div className="agent-heading-left">
          <FaceWithGlasses size={15} />
          <h3>vishalbot</h3>
          <span className="agent-subtitle">{MODEL_LABELS[model]}</span>
        </div>
        <div className="agent-model-picker" role="group" aria-label="Model">
          {MODEL_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={`agent-model-chip${key === model ? " active" : ""}`}
              onClick={() => setModel(key)}
              title={MODEL_LABELS[key]}
            >
              {key}
            </button>
          ))}
        </div>
      </header>

      <div className="agent-thread" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="agent-empty">
            <p>Ask vishalbot anything about your vault, tasks, health, or shopping.</p>
            <p className="agent-empty-hint">
              Type <code>/model haiku</code> to swap models. <code>/clear</code> to reset.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`agent-msg agent-msg-${message.role}`}>
            <div className="agent-msg-role">{message.role === "user" ? "You" : "vishalbot"}</div>
            <div className="agent-msg-body">
              {message.parts.map((part, index) => {
                if (part.type === "text") {
                  return (
                    <div key={index} className="agent-msg-text">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
                    </div>
                  );
                }
                if (part.type.startsWith("tool-")) {
                  const toolName = part.type.slice("tool-".length);
                  const state = (part as { state?: string }).state ?? "running";
                  return (
                    <div key={index} className={`agent-tool agent-tool-${state}`}>
                      <Wrench size={12} />
                      <code>{toolName}</code>
                      <span className="agent-tool-state">{state}</span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {status === "submitted" && (
          <div className="agent-msg agent-msg-assistant agent-thinking">
            <Loader2 size={14} className="agent-spinner" />
            <span>thinking…</span>
          </div>
        )}

        {error && <div className="agent-error">{error.message}</div>}
      </div>

      <form className="agent-input" onSubmit={submit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={`Message vishalbot · ${MODEL_LABELS[model]}`}
          rows={1}
        />
        {busy ? (
          <button type="button" className="agent-send" onClick={() => stop()} aria-label="Stop">
            <Square size={14} />
          </button>
        ) : (
          <button type="submit" className="agent-send" disabled={!input.trim()} aria-label="Send">
            <ArrowUp size={16} />
          </button>
        )}
      </form>
    </section>
  );
}
