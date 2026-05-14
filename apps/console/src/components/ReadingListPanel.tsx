import { Check, ExternalLink, Loader2, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createReadingItem,
  deleteReadingItem,
  loadReadingCategories,
  loadReadingItems,
  updateReadingItem,
} from "../lib/readingList";
import type { ReadingItem, ReadingPriority, ReadingStatus } from "../types";

const statusOrder: ReadingStatus[] = ["reading", "queued", "done"];
const statusLabel: Record<ReadingStatus, string> = {
  reading: "Reading now",
  queued: "Queue",
  done: "Finished",
};
const priorityOrder: ReadingPriority[] = ["next", "soon", "someday"];
const priorityLabel: Record<ReadingPriority, string> = {
  next: "Next",
  soon: "Soon",
  someday: "Someday",
};

type Draft = {
  title: string;
  url: string;
  note: string;
  category: string;
  priority: ReadingPriority;
};

const emptyDraft: Draft = { title: "", url: "", note: "", category: "", priority: "soon" };

function formatReadingDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function ReadingListPanel() {
  const [items, setItems] = useState<ReadingItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, categoryList] = await Promise.all([loadReadingItems(), loadReadingCategories()]);
      setItems(list.items);
      setCategories(categoryList.categories);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load reading list");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const grouped = useMemo(
    () =>
      statusOrder.map((status) => ({
        status,
        items: items.filter((item) => item.status === status),
      })),
    [items],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title || busy) return;

    setBusy(true);
    setError(null);
    try {
      await createReadingItem({
        title,
        url: draft.url.trim() || undefined,
        note: draft.note.trim() || undefined,
        category: draft.category.trim() || undefined,
        priority: draft.priority,
      });
      setDraft(emptyDraft);
      await refresh();
      titleRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add reading item");
    } finally {
      setBusy(false);
    }
  }

  async function patchItem(
    item: ReadingItem,
    patch: Partial<{
      title: string;
      url: string | null;
      note: string | null;
      category: string | null;
      priority: ReadingPriority;
      status: ReadingStatus;
    }>,
  ) {
    try {
      await updateReadingItem(item.id, patch);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update reading item");
    }
  }

  async function remove(item: ReadingItem) {
    if (!window.confirm(`Remove "${item.title}"?`)) return;
    try {
      await deleteReadingItem(item.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove reading item");
    }
  }

  return (
    <section className="reading-panel" aria-label="Reading list">
      <header className="reading-heading">
        <div>
          <span>Knowledge</span>
          <h3>Reading List</h3>
        </div>
        <p className="reading-sub">Books, essays, papers, and links worth keeping in rotation.</p>
      </header>

      <form className="reading-form" onSubmit={submit}>
        <div className="reading-form-row">
          <input
            ref={titleRef}
            className="reading-title-input"
            placeholder="Title"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            disabled={busy}
            autoFocus
          />
          <button className="reading-add" type="submit" disabled={!draft.title.trim() || busy} aria-label="Add reading item">
            {busy ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
          </button>
        </div>
        <div className="reading-form-meta">
          <input
            className="reading-meta-input"
            placeholder="URL"
            value={draft.url}
            onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            disabled={busy}
            inputMode="url"
          />
          <input
            className="reading-meta-input"
            placeholder="Category"
            value={draft.category}
            onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            list="reading-categories"
            disabled={busy}
          />
          <datalist id="reading-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
          <select
            className="reading-meta-input"
            value={draft.priority}
            onChange={(event) => setDraft({ ...draft, priority: event.target.value as ReadingPriority })}
            disabled={busy}
            aria-label="Priority"
          >
            {priorityOrder.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabel[priority]}
              </option>
            ))}
          </select>
        </div>
        <textarea
          className="reading-note-input"
          placeholder="Notes"
          value={draft.note}
          onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          disabled={busy}
        />
      </form>

      {error && <p className="reading-error">{error}</p>}

      {loading ? (
        <div className="reading-loading">
          <Loader2 className="spin" size={18} />
        </div>
      ) : (
        <div className="reading-groups">
          {grouped.map(({ status, items: groupItems }) => {
            if (!groupItems.length) return null;
            return (
              <section key={status} className={`reading-group reading-group-${status}`} aria-label={statusLabel[status]}>
                <header>
                  <span className="reading-group-pip" />
                  <h4>{statusLabel[status]}</h4>
                  <span className="reading-group-count">{groupItems.length}</span>
                </header>
                <ul>
                  {groupItems.map((item) => (
                    <ReadingRow
                      key={item.id}
                      item={item}
                      categories={categories}
                      editing={editingId === item.id}
                      onSetEditing={(open) => setEditingId(open ? item.id : null)}
                      onPatch={(patch) => patchItem(item, patch)}
                      onRemove={() => remove(item)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}

          {items.length === 0 && <p className="reading-empty">Nothing saved yet.</p>}
        </div>
      )}
    </section>
  );
}

function ReadingRow({
  item,
  categories,
  editing,
  onSetEditing,
  onPatch,
  onRemove,
}: {
  item: ReadingItem;
  categories: string[];
  editing: boolean;
  onSetEditing: (open: boolean) => void;
  onPatch: (
    patch: Partial<{
      title: string;
      url: string | null;
      note: string | null;
      category: string | null;
      priority: ReadingPriority;
      status: ReadingStatus;
    }>,
  ) => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [url, setUrl] = useState(item.url ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const [category, setCategory] = useState(item.category ?? "");

  useEffect(() => {
    if (editing) {
      setTitle(item.title);
      setUrl(item.url ?? "");
      setNote(item.note ?? "");
      setCategory(item.category ?? "");
    }
  }, [editing, item]);

  return (
    <li className={`reading-item reading-item-${item.status}`}>
      <button
        className="reading-check"
        type="button"
        aria-label={item.status === "done" ? "Move back to queue" : "Mark finished"}
        onClick={() => onPatch({ status: item.status === "done" ? "queued" : "done" })}
      >
        {item.status === "done" ? <Check size={13} /> : null}
      </button>

      <div className="reading-body">
        {editing ? (
          <div className="reading-edit">
            <input className="reading-meta-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" />
            <input className="reading-meta-input" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="URL" />
            <input
              className="reading-meta-input"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="Category"
              list="reading-categories"
            />
            <textarea className="reading-note-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Notes" />
            <div className="reading-edit-actions">
              <button
                className="reading-action"
                type="button"
                onClick={() => {
                  onPatch({
                    title: title.trim() || item.title,
                    url: url.trim() ? url.trim() : null,
                    note: note.trim() ? note.trim() : null,
                    category: category.trim() ? category.trim() : null,
                  });
                  onSetEditing(false);
                }}
              >
                <Check size={13} /> Save
              </button>
              <button className="reading-action ghost" type="button" onClick={() => onSetEditing(false)}>
                <X size={13} /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="reading-title" type="button" onClick={() => onSetEditing(true)}>
            <span className="reading-title-main">{item.title}</span>
            <span className="reading-meta-line">
              {item.category && <span>{item.category}</span>}
              <span>{priorityLabel[item.priority]}</span>
              <span>{formatReadingDate(item.updatedAt)}</span>
            </span>
            {item.note && <span className="reading-note">{item.note}</span>}
          </button>
        )}
      </div>

      {!editing && (
        <div className="reading-row-controls">
          <select
            className="reading-control-select"
            value={item.status}
            onChange={(event) => onPatch({ status: event.target.value as ReadingStatus })}
            aria-label="Status"
          >
            {statusOrder.map((status) => (
              <option key={status} value={status}>
                {statusLabel[status]}
              </option>
            ))}
          </select>
          <select
            className="reading-control-select"
            value={item.priority}
            onChange={(event) => onPatch({ priority: event.target.value as ReadingPriority })}
            aria-label="Priority"
          >
            {priorityOrder.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabel[priority]}
              </option>
            ))}
          </select>
        </div>
      )}

      {item.url && !editing && (
        <a className="reading-link" href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${item.title}`}>
          <ExternalLink size={13} />
        </a>
      )}
      <button className="reading-remove" type="button" onClick={onRemove} aria-label="Remove">
        <Trash2 size={13} />
      </button>
    </li>
  );
}
