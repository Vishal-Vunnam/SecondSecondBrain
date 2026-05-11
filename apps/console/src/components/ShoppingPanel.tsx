import { Check, ChevronDown, ExternalLink, Loader2, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createShoppingItem,
  deleteShoppingItem,
  loadShoppingItems,
  loadShoppingTypes,
  updateShoppingItem,
} from "../lib/shopping";
import type { ShoppingItem, ShoppingNecessity } from "../types";

const necessityOrder: ShoppingNecessity[] = ["essential", "important", "nice"];
const necessityLabel: Record<ShoppingNecessity, string> = {
  essential: "Essential",
  important: "Important",
  nice: "Nice to have",
};

type Draft = {
  title: string;
  reasoning: string;
  type: string;
  necessity: ShoppingNecessity;
  link: string;
};

const emptyDraft: Draft = { title: "", reasoning: "", type: "", necessity: "important", link: "" };

export function ShoppingPanel() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, typeList] = await Promise.all([loadShoppingItems(), loadShoppingTypes()]);
      setItems(list.items);
      setTypes(typeList.types);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load shopping list");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const grouped = useMemo(() => {
    const open = items.filter((i) => !i.gotIt);
    const done = items.filter((i) => i.gotIt);
    const byNecessity: Record<ShoppingNecessity, ShoppingItem[]> = { essential: [], important: [], nice: [] };
    for (const item of open) byNecessity[item.necessity].push(item);
    return { byNecessity, done };
  }, [items]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createShoppingItem({
        title,
        reasoning: draft.reasoning.trim() || undefined,
        type: draft.type.trim() || undefined,
        necessity: draft.necessity,
        link: draft.link.trim() || undefined,
      });
      setDraft(emptyDraft);
      await refresh();
      titleRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add item");
    } finally {
      setBusy(false);
    }
  }

  async function toggleGot(item: ShoppingItem) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, gotIt: !i.gotIt } : i)));
    try {
      await updateShoppingItem(item.id, { gotIt: !item.gotIt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update item");
      await refresh();
    }
  }

  async function changeNecessity(item: ShoppingItem, necessity: ShoppingNecessity) {
    try {
      await updateShoppingItem(item.id, { necessity });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    }
  }

  async function remove(item: ShoppingItem) {
    if (!window.confirm(`Remove "${item.title}"?`)) return;
    try {
      await deleteShoppingItem(item.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <section className="shopping-panel" aria-label="Shopping list">
      <header className="shopping-heading">
        <div>
          <span>Money</span>
          <h3>Shopping</h3>
        </div>
        <p className="shopping-sub">Group by necessity. Check off as you get them.</p>
      </header>

      <form className="shopping-form" onSubmit={submit}>
        <div className="shopping-form-row">
          <input
            ref={titleRef}
            className="shopping-input"
            placeholder="What do you need?"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            disabled={busy}
            autoFocus
          />
          <button className="shopping-add" type="submit" disabled={!draft.title.trim() || busy}>
            {busy ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
          </button>
        </div>
        <div className="shopping-form-meta">
          <input
            className="shopping-meta-input"
            placeholder="Why? (optional)"
            value={draft.reasoning}
            onChange={(e) => setDraft({ ...draft, reasoning: e.target.value })}
            disabled={busy}
          />
          <input
            className="shopping-meta-input"
            placeholder="Type (e.g. Groceries)"
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value })}
            list="shopping-types"
            disabled={busy}
          />
          <datalist id="shopping-types">
            {types.map((t) => <option key={t} value={t} />)}
          </datalist>
          <select
            className="shopping-meta-input"
            value={draft.necessity}
            onChange={(e) => setDraft({ ...draft, necessity: e.target.value as ShoppingNecessity })}
            disabled={busy}
          >
            {necessityOrder.map((n) => (
              <option key={n} value={n}>{necessityLabel[n]}</option>
            ))}
          </select>
        </div>
        <input
          className="shopping-meta-input"
          placeholder="Link (optional, e.g. amazon.com/…)"
          value={draft.link}
          onChange={(e) => setDraft({ ...draft, link: e.target.value })}
          disabled={busy}
          inputMode="url"
        />
      </form>

      {error && <p className="shopping-error">{error}</p>}

      {loading ? (
        <div className="shopping-loading"><Loader2 className="spin" size={18} /></div>
      ) : (
        <div className="shopping-groups">
          {necessityOrder.map((n) => {
            const list = grouped.byNecessity[n];
            if (!list.length) return null;
            return (
              <section key={n} className={`shopping-group shopping-group-${n}`} aria-label={necessityLabel[n]}>
                <header>
                  <span className="shopping-group-pip" />
                  <h4>{necessityLabel[n]}</h4>
                  <span className="shopping-group-count">{list.length}</span>
                </header>
                <ul>
                  {list.map((item) => (
                    <ShoppingRow
                      key={item.id}
                      item={item}
                      types={types}
                      onToggle={() => toggleGot(item)}
                      onChangeNecessity={(value) => changeNecessity(item, value)}
                      onRemove={() => remove(item)}
                      editing={editingId === item.id}
                      onSetEditing={(open) => setEditingId(open ? item.id : null)}
                      onSave={async (patch) => {
                        try {
                          await updateShoppingItem(item.id, patch);
                          await refresh();
                          setEditingId(null);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Could not save");
                        }
                      }}
                    />
                  ))}
                </ul>
              </section>
            );
          })}

          {grouped.done.length > 0 && (
            <section className="shopping-group shopping-group-done">
              <header>
                <span className="shopping-group-pip" />
                <h4>Got it</h4>
                <span className="shopping-group-count">{grouped.done.length}</span>
              </header>
              <ul>
                {grouped.done.map((item) => (
                  <ShoppingRow
                    key={item.id}
                    item={item}
                    types={types}
                    onToggle={() => toggleGot(item)}
                    onChangeNecessity={(value) => changeNecessity(item, value)}
                    onRemove={() => remove(item)}
                    editing={false}
                    onSetEditing={() => {}}
                    onSave={async () => {}}
                  />
                ))}
              </ul>
            </section>
          )}

          {items.length === 0 && (
            <p className="shopping-empty">Nothing on the list. Add something above.</p>
          )}
        </div>
      )}
    </section>
  );
}

function ShoppingRow({
  item,
  types,
  onToggle,
  onChangeNecessity,
  onRemove,
  editing,
  onSetEditing,
  onSave,
}: {
  item: ShoppingItem;
  types: string[];
  onToggle: () => void;
  onChangeNecessity: (value: ShoppingNecessity) => void;
  onRemove: () => void;
  editing: boolean;
  onSetEditing: (open: boolean) => void;
  onSave: (patch: { title?: string; reasoning?: string | null; type?: string | null; link?: string | null }) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [reasoning, setReasoning] = useState(item.reasoning ?? "");
  const [type, setType] = useState(item.type ?? "");
  const [link, setLink] = useState(item.link ?? "");

  useEffect(() => {
    if (editing) {
      setTitle(item.title);
      setReasoning(item.reasoning ?? "");
      setType(item.type ?? "");
      setLink(item.link ?? "");
    }
  }, [editing, item]);

  return (
    <li className={`shopping-item${item.gotIt ? " is-done" : ""}`}>
      <button
        type="button"
        className="shopping-check"
        aria-label={item.gotIt ? "Mark as not got" : "Mark as got"}
        onClick={onToggle}
      >
        {item.gotIt ? <Check size={13} /> : null}
      </button>
      <div className="shopping-body">
        {editing ? (
          <div className="shopping-edit">
            <input
              className="shopping-meta-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
            />
            <input
              className="shopping-meta-input"
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              placeholder="Why? (optional)"
            />
            <input
              className="shopping-meta-input"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Type"
              list="shopping-types"
            />
            <input
              className="shopping-meta-input"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Link (optional)"
              inputMode="url"
            />
            <div className="shopping-edit-actions">
              <button
                type="button"
                className="shopping-action"
                onClick={() =>
                  onSave({
                    title: title.trim() || item.title,
                    reasoning: reasoning.trim() ? reasoning.trim() : null,
                    type: type.trim() ? type.trim() : null,
                    link: link.trim() ? link.trim() : null,
                  })
                }
              >
                <Check size={13} /> Save
              </button>
              <button type="button" className="shopping-action ghost" onClick={() => onSetEditing(false)}>
                <X size={13} /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="shopping-title" onClick={() => onSetEditing(true)}>
            <span className="shopping-title-main">{item.title}</span>
            {item.reasoning && <span className="shopping-reasoning">{item.reasoning}</span>}
            {item.type && <span className="shopping-type-chip">{item.type}</span>}
          </button>
        )}
      </div>
      {item.link && !editing && (
        <a
          className="shopping-link"
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open link for ${item.title}`}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={13} />
        </a>
      )}
      {!item.gotIt && !editing && (
        <label className="shopping-necessity-select">
          <select
            value={item.necessity}
            onChange={(e) => onChangeNecessity(e.target.value as ShoppingNecessity)}
            aria-label="Necessity"
          >
            {necessityOrder.map((n) => (
              <option key={n} value={n}>{necessityLabel[n]}</option>
            ))}
          </select>
          <ChevronDown size={12} />
        </label>
      )}
      <button type="button" className="shopping-remove" onClick={onRemove} aria-label="Remove">
        <Trash2 size={13} />
      </button>
    </li>
  );
}

