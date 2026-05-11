import { Eye, PanelsTopLeft, Pencil, Save } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { VaultFile } from "../types";

type ManuscriptPanelProps = {
  dirty: boolean;
  file: VaultFile | null;
  onChange: (content: string) => void;
  onSave: () => void;
  saving: boolean;
  value: string;
};

type ViewMode = "edit" | "split" | "preview";

export function ManuscriptPanel({ dirty, file, onChange, onSave, saving, value }: ManuscriptPanelProps) {
  const [mode, setMode] = useState<ViewMode>("split");

  return (
    <section className="manuscript-panel" id="manuscript" aria-label="Active note">
      <div className="folio-bar">
        <div className="folio-bar-meta">
          <strong>{file ? file.name.replace(/\.md$/i, "") : "No file selected"}</strong>
          {file && <span>{file.path}</span>}
        </div>
        <div className="folio-bar-controls">
          <div className="view-toggle" role="tablist" aria-label="View mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "edit"}
              className={mode === "edit" ? "is-active" : ""}
              onClick={() => setMode("edit")}
              title="Edit only"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "split"}
              className={mode === "split" ? "is-active" : ""}
              onClick={() => setMode("split")}
              title="Split"
            >
              <PanelsTopLeft size={13} />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "preview"}
              className={mode === "preview" ? "is-active" : ""}
              onClick={() => setMode("preview")}
              title="Preview only"
            >
              <Eye size={13} />
            </button>
          </div>
          <button className="save-btn" disabled={!file || !dirty || saving} onClick={onSave} type="button">
            <Save size={13} />
            {saving ? "Saving" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>
      <article className={`folio-page mode-${mode}`}>
        {file ? (
          <>
            {(mode === "edit" || mode === "split") && (
              <textarea
                aria-label={`Editing ${file.path}`}
                className="note-editor"
                onChange={(event) => onChange(event.target.value)}
                spellCheck="true"
                value={value}
              />
            )}
            {(mode === "preview" || mode === "split") && (
              <div className="note-preview" aria-label="Markdown preview">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{value || "*Nothing to preview yet.*"}</ReactMarkdown>
              </div>
            )}
          </>
        ) : (
          <div className="editor-empty">
            <h3>Open a note from the vault.</h3>
            <p>Pick a file on the left, or create a new one with the + buttons.</p>
          </div>
        )}
      </article>
    </section>
  );
}
