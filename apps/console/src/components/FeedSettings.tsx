import { Plus, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import {
  createFeedSource,
  deleteFeedSource,
  loadFeedProfiles,
  loadFeedSources,
  updateFeedProfile,
  updateFeedSource,
} from "../lib/feed";
import type { FeedProfile, FeedSource, FeedSourceType } from "../types";

type FeedSettingsProps = {
  onClose: () => void;
  onSaved: () => void;
};

const SOURCE_TYPE_OPTIONS: { value: FeedSourceType; label: string }[] = [
  { value: "rss", label: "RSS / Atom" },
  { value: "hn", label: "Hacker News" },
  { value: "reddit", label: "Reddit" },
];

export function FeedSettings({ onClose, onSaved }: FeedSettingsProps) {
  const [profile, setProfile] = useState<FeedProfile | null>(null);
  const [sources, setSources] = useState<FeedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [includeDraft, setIncludeDraft] = useState("");
  const [excludeDraft, setExcludeDraft] = useState("");
  const [newSource, setNewSource] = useState<{ name: string; type: FeedSourceType; url: string; weight: string }>({
    name: "",
    type: "rss",
    url: "",
    weight: "1",
  });

  useEffect(() => {
    let active = true;
    Promise.all([loadFeedProfiles(), loadFeedSources()])
      .then(([profiles, srcs]) => {
        if (!active) return;
        setProfile(profiles.profiles[0] ?? null);
        setSources(srcs.sources);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load settings");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function addKeyword(target: "include" | "exclude", value: string) {
    if (!profile) return;
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return;
    const key = target === "include" ? "keywordInclude" : "keywordExclude";
    if (profile[key].includes(trimmed)) return;
    setProfile({ ...profile, [key]: [...profile[key], trimmed] });
    if (target === "include") setIncludeDraft("");
    else setExcludeDraft("");
  }

  function removeKeyword(target: "include" | "exclude", value: string) {
    if (!profile) return;
    const key = target === "include" ? "keywordInclude" : "keywordExclude";
    setProfile({ ...profile, [key]: profile[key].filter((kw) => kw !== value) });
  }

  async function handleSaveProfile() {
    if (!profile) return;
    setSaving(true);
    try {
      await updateFeedProfile(profile.id, {
        name: profile.name,
        description: profile.description,
        keywordInclude: profile.keywordInclude,
        keywordExclude: profile.keywordExclude,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSourceWeight(source: FeedSource, weight: number) {
    setSources((current) => current.map((s) => (s.id === source.id ? { ...s, weight } : s)));
    try {
      await updateFeedSource(source.id, { weight });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update source");
    }
  }

  async function handleSourceToggle(source: FeedSource) {
    const enabled = !source.enabled;
    setSources((current) => current.map((s) => (s.id === source.id ? { ...s, enabled } : s)));
    try {
      await updateFeedSource(source.id, { enabled });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update source");
    }
  }

  async function handleSourceDelete(source: FeedSource) {
    if (!window.confirm(`Remove ${source.name}?`)) return;
    setSources((current) => current.filter((s) => s.id !== source.id));
    try {
      await deleteFeedSource(source.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete source");
    }
  }

  async function handleAddSource(event: FormEvent) {
    event.preventDefault();
    if (!newSource.name.trim() || !newSource.url.trim()) return;
    const weight = Number(newSource.weight);
    try {
      const { source } = await createFeedSource({
        name: newSource.name.trim(),
        type: newSource.type,
        url: newSource.url.trim(),
        weight: Number.isFinite(weight) ? weight : 1,
      });
      setSources((current) => [...current, source]);
      setNewSource({ name: "", type: "rss", url: "", weight: "1" });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add source");
    }
  }

  return (
    <div aria-modal="true" className="feed-settings-backdrop" role="dialog" onClick={onClose}>
      <div className="feed-settings-modal" onClick={(event) => event.stopPropagation()}>
        <header className="feed-settings-header">
          <h3>Interests</h3>
          <button aria-label="Close" className="feed-settings-close" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </header>

        {error && <p className="feed-settings-error">{error}</p>}
        {loading && <p className="home-muted">Loading…</p>}

        {!loading && profile && (
          <div className="feed-settings-body">
            <section>
              <label className="feed-settings-label" htmlFor="profile-description">
                Motivation
              </label>
              <p className="feed-settings-hint">
                Describe what you want to learn and care about. Used today for context, later as the prompt for embedding-based ranking.
              </p>
              <textarea
                className="feed-settings-textarea"
                id="profile-description"
                onChange={(event) => setProfile({ ...profile, description: event.target.value })}
                placeholder="e.g. I want to go deep on inference-time compute, RL on LLMs, and systems programming."
                rows={3}
                value={profile.description}
              />
            </section>

            <section>
              <label className="feed-settings-label">Include keywords</label>
              <p className="feed-settings-hint">Boost items whose title or summary contains any of these.</p>
              <div className="feed-chip-row">
                {profile.keywordInclude.map((kw) => (
                  <button className="feed-chip" key={kw} onClick={() => removeKeyword("include", kw)} type="button">
                    {kw} <X size={11} />
                  </button>
                ))}
              </div>
              <input
                className="feed-settings-input"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addKeyword("include", includeDraft);
                  }
                }}
                onChange={(event) => setIncludeDraft(event.target.value)}
                placeholder="Add keyword and press Enter"
                value={includeDraft}
              />
            </section>

            <section>
              <label className="feed-settings-label">Exclude keywords</label>
              <p className="feed-settings-hint">Filter out items whose title or summary contains any of these.</p>
              <div className="feed-chip-row">
                {profile.keywordExclude.map((kw) => (
                  <button className="feed-chip exclude" key={kw} onClick={() => removeKeyword("exclude", kw)} type="button">
                    {kw} <X size={11} />
                  </button>
                ))}
              </div>
              <input
                className="feed-settings-input"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addKeyword("exclude", excludeDraft);
                  }
                }}
                onChange={(event) => setExcludeDraft(event.target.value)}
                placeholder="Add keyword and press Enter"
                value={excludeDraft}
              />
            </section>

            <section>
              <label className="feed-settings-label">Sources</label>
              <p className="feed-settings-hint">Weight boosts ranking. Toggle to mute without losing the feed.</p>
              <ul className="feed-source-list">
                {sources.map((source) => (
                  <li className="feed-source-row" key={source.id}>
                    <div>
                      <strong>{source.name}</strong>
                      <small>{source.type} · {source.url}</small>
                    </div>
                    <input
                      aria-label="Weight"
                      className="feed-source-weight"
                      max={5}
                      min={0}
                      onChange={(event) => handleSourceWeight(source, Number(event.target.value))}
                      step={0.5}
                      type="number"
                      value={source.weight}
                    />
                    <label className="feed-source-toggle">
                      <input
                        checked={source.enabled}
                        onChange={() => handleSourceToggle(source)}
                        type="checkbox"
                      />
                      <span>{source.enabled ? "On" : "Off"}</span>
                    </label>
                    <button
                      aria-label={`Remove ${source.name}`}
                      className="feed-source-delete"
                      onClick={() => handleSourceDelete(source)}
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>

              <form className="feed-source-add" onSubmit={handleAddSource}>
                <input
                  onChange={(event) => setNewSource({ ...newSource, name: event.target.value })}
                  placeholder="Name (e.g. ArXiv cs.CL)"
                  value={newSource.name}
                />
                <select
                  onChange={(event) => setNewSource({ ...newSource, type: event.target.value as FeedSourceType })}
                  value={newSource.type}
                >
                  {SOURCE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  onChange={(event) => setNewSource({ ...newSource, url: event.target.value })}
                  placeholder="Feed URL"
                  type="url"
                  value={newSource.url}
                />
                <input
                  aria-label="Weight"
                  max={5}
                  min={0}
                  onChange={(event) => setNewSource({ ...newSource, weight: event.target.value })}
                  step={0.5}
                  type="number"
                  value={newSource.weight}
                />
                <button type="submit">
                  <Plus size={14} /> Add
                </button>
              </form>
            </section>

            <footer className="feed-settings-footer">
              <button className="feed-settings-cancel" onClick={onClose} type="button">
                Close
              </button>
              <button className="feed-settings-save" disabled={saving} onClick={handleSaveProfile} type="button">
                {saving ? "Saving…" : "Save interests"}
              </button>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
