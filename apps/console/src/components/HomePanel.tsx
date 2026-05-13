import { ArrowUpRight, Bookmark, BookmarkCheck, CalendarDays, Check, EyeOff, RefreshCw, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadFeed, recordFeedInteraction, refreshFeed } from "../lib/feed";
import { loadTasks, updateTaskStatus } from "../lib/tasks";
import type { AppModuleId, FeedItem, FeedResponse, TaskItem } from "../types";
import { FeedSettings } from "./FeedSettings";

type HomePanelProps = {
  onSelectModule: (module: AppModuleId) => void;
};

function formatRelative(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function formatTaskDue(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function HomePanel({ onSelectModule }: HomePanelProps) {
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const now = useMemo(() => new Date(), []);
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now);
  const yearLabel = new Intl.DateTimeFormat(undefined, { year: "numeric" }).format(now);

  const fetchFeed = useCallback(async () => {
    try {
      const response = await loadFeed();
      setFeed(response);
      setFeedError(null);
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : "Feed unavailable");
    } finally {
      setFeedLoading(false);
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const response = await loadTasks();
      setTasks(response.tasks);
      setTasksError(null);
    } catch (error) {
      setTasksError(error instanceof Error ? error.message : "Tasks unavailable");
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    fetchTasks();
  }, [fetchFeed, fetchTasks]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshFeed();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await fetchFeed();
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, [fetchFeed]);

  const handleOpen = useCallback((item: FeedItem) => {
    recordFeedInteraction(item.id, "opened", feed?.profile.id).catch(() => undefined);
  }, [feed?.profile.id]);

  const handleSave = useCallback((item: FeedItem) => {
    recordFeedInteraction(item.id, "saved", feed?.profile.id).catch(() => undefined);
    setFeed((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((existing) =>
          existing.id === item.id ? { ...existing, interaction: "saved" } : existing,
        ),
      };
    });
  }, [feed?.profile.id]);

  const handleDismiss = useCallback((item: FeedItem) => {
    setHidden((current) => new Set(current).add(item.id));
    recordFeedInteraction(item.id, "dismissed", feed?.profile.id).catch(() => undefined);
  }, [feed?.profile.id]);

  const toggleTask = useCallback(async (task: TaskItem) => {
    const next = task.status === "done" ? "todo" : "done";
    try {
      await updateTaskStatus(task.path, next);
      setTasks((current) => current.map((t) => (t.path === task.path ? { ...t, status: next } : t)));
    } catch (error) {
      setTasksError(error instanceof Error ? error.message : "Could not update task");
    }
  }, []);

  const openTasks = tasks.filter((task) => task.status !== "done").slice(0, 12);
  const visibleItems = (feed?.items ?? []).filter((item) => !hidden.has(item.id));

  return (
    <section className="feed-panel" aria-label="Home">
      <header className="feed-hero">
        <div>
          <span>{yearLabel}</span>
          <h3>{dateLabel}</h3>
        </div>
        <div className="date-card" aria-label="Today">
          <CalendarDays size={18} />
          <strong>{now.getDate()}</strong>
          <span>{now.toLocaleString(undefined, { month: "short" })}</span>
        </div>
      </header>

      <div className="feed-layout">
        <main className="feed-main">
          <div className="feed-main-heading">
            <div>
              <h4>Feed</h4>
              <small>
                {feed?.lastPolledAt ? `Updated ${formatRelative(feed.lastPolledAt)}` : "Loading"}
                {feed?.profile?.name ? ` · ${feed.profile.name}` : ""}
              </small>
            </div>
            <div className="feed-main-actions">
              <button
                aria-label="Edit interests"
                className="feed-refresh"
                onClick={() => setSettingsOpen(true)}
                type="button"
              >
                <Settings size={14} />
                <span>Interests</span>
              </button>
              <button className="feed-refresh" disabled={refreshing} onClick={handleRefresh} type="button">
                <RefreshCw className={refreshing ? "spin" : ""} size={14} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {feedError && <p className="home-muted">{feedError}</p>}
          {!feedError && feedLoading && <p className="home-muted">Loading feed</p>}
          {!feedError && !feedLoading && visibleItems.length === 0 && (
            <p className="home-muted">No items yet — try a refresh in a minute while feeds load.</p>
          )}

          <ul className="feed-list">
            {visibleItems.map((item) => (
              <li className="feed-item" key={item.id}>
                <a href={item.url} onClick={() => handleOpen(item)} rel="noreferrer" target="_blank">
                  <div className="feed-item-meta">
                    <span className="feed-source-chip">{item.sourceName}</span>
                    <small>{formatRelative(item.publishedAt ?? item.fetchedAt)}</small>
                  </div>
                  <h5>{item.title}</h5>
                  <ArrowUpRight aria-hidden className="feed-item-arrow" size={14} />
                </a>
                <div className="feed-item-actions">
                  <button
                    aria-label={item.interaction === "saved" ? "Saved" : "Save for later"}
                    className={item.interaction === "saved" ? "active" : ""}
                    onClick={() => handleSave(item)}
                    type="button"
                  >
                    {item.interaction === "saved" ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                  </button>
                  <button aria-label="Dismiss" onClick={() => handleDismiss(item)} type="button">
                    <EyeOff size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </main>

        <aside className="feed-rail">
          <div className="feed-rail-heading">
            <h4>Tasks</h4>
            <button onClick={() => onSelectModule("tasks")} type="button">
              Open
            </button>
          </div>
          {tasksError && <p className="home-muted">{tasksError}</p>}
          {!tasksError && openTasks.length === 0 && <p className="home-muted">Nothing open. Quiet day.</p>}
          <ul className="feed-tasks">
            {openTasks.map((task) => {
              const due = formatTaskDue(task.due);
              return (
                <li className="feed-task" key={task.path}>
                  <button
                    aria-label={task.status === "done" ? "Mark todo" : "Mark done"}
                    className={`feed-task-check ${task.status}`}
                    onClick={() => toggleTask(task)}
                    type="button"
                  >
                    {task.status === "done" ? <Check size={12} /> : null}
                  </button>
                  <div>
                    <span>{task.title}</span>
                    {due && <small>{due}</small>}
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      {settingsOpen && (
        <FeedSettings
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            fetchFeed();
          }}
        />
      )}
    </section>
  );
}
