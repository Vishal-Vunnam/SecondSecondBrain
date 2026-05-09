import { Save } from "lucide-react";
import type { VaultFile } from "../types";

type ManuscriptPanelProps = {
  dirty: boolean;
  file: VaultFile | null;
  onChange: (content: string) => void;
  onSave: () => void;
  saving: boolean;
  value: string;
};

export function ManuscriptPanel({ dirty, file, onChange, onSave, saving, value }: ManuscriptPanelProps) {
  return (
    <section className="manuscript-panel" id="manuscript" aria-label="Active note">
      <div className="folio-bar">
        <div>
          <strong>{file?.name ?? "No file selected"}</strong>
          {file && <span>{file.path}</span>}
        </div>
        <button disabled={!file || !dirty || saving} onClick={onSave} type="button">
          <Save size={13} />
          {saving ? "Saving" : dirty ? "Save" : "Saved"}
        </button>
      </div>
      <article className="folio-page">
        {file ? (
          <textarea
            aria-label={`Editing ${file.path}`}
            className="note-editor"
            onChange={(event) => onChange(event.target.value)}
            spellCheck="true"
            value={value}
          />
        ) : (
          <div className="editor-empty">
            <h3>Open a note from the vault.</h3>
            <p>The file tree is backed by the synced server vault at /vault. Opening and saving here writes Markdown.</p>
          </div>
        )}
      </article>
    </section>
  );
}
