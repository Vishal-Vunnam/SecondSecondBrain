import { CalendarDays, Check, ChevronLeft, ChevronRight, ExternalLink, Plus, RotateCcw } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createTask, loadTasks, updateTaskStatus } from "../lib/tasks";
import type { TaskItem, TaskPriority, TaskStatus } from "../types";

type TasksPanelProps = {
  onOpenTask: (path: string) => void;
};

function nextStatus(status: TaskStatus): TaskStatus {
  return status === "done" ? "todo" : "done";
}

function formatDate(value: string | null) {
  if (!value) return "No due date";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function formatDateGroup(value: string | null) {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  const today = toIsoDate(new Date());
  const tomorrow = toIsoDate(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1));
  if (value === today) return "Today";
  if (value === tomorrow) return "Tomorrow";

  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(date);
}

function splitLinks(value: string) {
  return value
    .split(",")
    .map((link) => link.trim())
    .filter(Boolean);
}

export function TasksPanel({ onOpenTask }: TasksPanelProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [project, setProject] = useState("");
  const [links, setLinks] = useState("");
  const [context, setContext] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));

  const openTasks = useMemo(() => tasks.filter((task) => task.status !== "done"), [tasks]);
  const doneTasks = useMemo(() => tasks.filter((task) => task.status === "done"), [tasks]);
  const filteredOpenTasks = useMemo(
    () => (selectedDate ? openTasks.filter((task) => task.due === selectedDate) : openTasks),
    [openTasks, selectedDate],
  );
  const filteredDoneTasks = useMemo(
    () => (selectedDate ? doneTasks.filter((task) => task.due === selectedDate) : doneTasks),
    [doneTasks, selectedDate],
  );
  const taskCountsByDate = useMemo(() => {
    return openTasks.reduce<Record<string, number>>((counts, task) => {
      if (!task.due) return counts;
      counts[task.due] = (counts[task.due] ?? 0) + 1;
      return counts;
    }, {});
  }, [openTasks]);
  const dateGroups = useMemo(() => {
    const groups = filteredOpenTasks.reduce<Map<string, TaskItem[]>>((next, task) => {
      const key = task.due ?? "none";
      next.set(key, [...(next.get(key) ?? []), task]);
      return next;
    }, new Map<string, TaskItem[]>());

    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "none") return 1;
      if (b === "none") return -1;
      return a.localeCompare(b);
    });
  }, [filteredOpenTasks]);
  const calendarDays = useMemo(() => {
    const first = startOfMonth(calendarMonth);
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const leadingBlanks = first.getDay();
    return [
      ...Array.from({ length: leadingBlanks }, () => null),
      ...Array.from({ length: daysInMonth }, (_value, index) => new Date(first.getFullYear(), first.getMonth(), index + 1)),
    ];
  }, [calendarMonth]);
  const calendarLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(calendarMonth);

  async function refreshTasks() {
    setLoading(true);
    setError(null);
    try {
      const response = await loadTasks();
      setTasks(response.tasks);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshTasks();
  }, []);

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const response = await createTask({
        title,
        due,
        priority,
        project,
        links: splitLinks(links),
        context,
      });
      setTasks((current) => [response.task, ...current]);
      setTitle("");
      setDue(selectedDate);
      setPriority("medium");
      setProject("");
      setLinks("");
      setContext("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create task");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTask(task: TaskItem) {
    const status = nextStatus(task.status);
    setTasks((current) => current.map((item) => (item.path === task.path ? { ...item, status } : item)));
    try {
      const response = await updateTaskStatus(task.path, status);
      setTasks((current) => current.map((item) => (item.path === task.path ? response.task : item)));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not update task");
      setTasks((current) => current.map((item) => (item.path === task.path ? task : item)));
    }
  }

  function renderTask(task: TaskItem) {
    const isDone = task.status === "done";
    return (
      <div className={`task-row ${isDone ? "done" : ""}`} key={task.path}>
        <button className="task-check" onClick={() => toggleTask(task)} type="button" aria-label={isDone ? "Mark todo" : "Mark done"}>
          {isDone ? <Check size={15} /> : null}
        </button>
        <div className="task-main">
          <strong>{task.title}</strong>
          <div className="task-meta">
            <span>{task.priority}</span>
            <span>{formatDate(task.due)}</span>
            {task.project ? <span>{task.project}</span> : null}
          </div>
          {task.links.length ? (
            <div className="task-links">
              {task.links.map((link) => (
                <span key={link}>{link}</span>
              ))}
            </div>
          ) : null}
        </div>
        <button className="task-open" onClick={() => onOpenTask(task.path)} type="button" aria-label={`Open ${task.title}`}>
          <ExternalLink size={15} />
        </button>
      </div>
    );
  }

  return (
    <section className="tasks-panel" aria-label="Tasks">
      <div className="tasks-shell">
        <header className="tasks-heading">
          <div>
            <span>Markdown actions</span>
            <h3>Tasks</h3>
          </div>
          <button onClick={refreshTasks} type="button" disabled={loading}>
            <RotateCcw size={14} />
            Refresh
          </button>
        </header>

        <div className="tasks-layout">
          <aside className="task-sidebar">
            <div className="mini-calendar" aria-label="Task calendar">
              <div className="mini-calendar-heading">
                <div>
                  <CalendarDays size={15} />
                  <span>{calendarLabel}</span>
                </div>
                <div>
                  <button onClick={() => setCalendarMonth((current) => addMonths(current, -1))} type="button" aria-label="Previous month">
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => setCalendarMonth((current) => addMonths(current, 1))} type="button" aria-label="Next month">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
              <div className="mini-calendar-weekdays" aria-hidden="true">
                {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                  <span key={`${day}-${index}`}>{day}</span>
                ))}
              </div>
              <div className="mini-calendar-grid">
                {calendarDays.map((day, index) => {
                  if (!day) return <span className="mini-calendar-empty" key={`blank-${index}`} />;
                  const iso = toIsoDate(day);
                  const count = taskCountsByDate[iso] ?? 0;
                  const isToday = iso === toIsoDate(new Date());
                  return (
                    <button
                      className={`${selectedDate === iso ? "selected" : ""} ${isToday ? "today" : ""}`}
                      key={iso}
                      onClick={() => {
                        setSelectedDate(iso);
                        setDue(iso);
                      }}
                      type="button"
                    >
                      <span>{day.getDate()}</span>
                      {count ? <small>{count}</small> : null}
                    </button>
                  );
                })}
              </div>
              <div className="mini-calendar-actions">
                <button
                  onClick={() => {
                    setSelectedDate("");
                  }}
                  type="button"
                >
                  All dates
                </button>
                <button
                  onClick={() => {
                    const today = toIsoDate(new Date());
                    setSelectedDate(today);
                    setDue(today);
                    setCalendarMonth(startOfMonth(new Date()));
                  }}
                  type="button"
                >
                  Today
                </button>
              </div>
            </div>

            <form className="task-form" onSubmit={submitTask}>
              <label>
                <span>Task</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Read consensus paper" />
              </label>
              <div className="task-form-row">
                <label>
                  <span>Due</span>
                  <input type="date" value={due} onChange={(event) => setDue(event.target.value)} />
                </label>
                <label>
                  <span>Priority</span>
                  <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>
              <label>
                <span>Project</span>
                <input value={project} onChange={(event) => setProject(event.target.value)} placeholder="distributed-systems" />
              </label>
              <label>
                <span>Linked notes</span>
                <input value={links} onChange={(event) => setLinks(event.target.value)} placeholder="[[Paper Scans/Consensus Notes]]" />
              </label>
              <label>
                <span>Context</span>
                <textarea value={context} onChange={(event) => setContext(event.target.value)} placeholder="Why this matters, where it came from, or what to compare it against." />
              </label>
              <button className="task-submit" disabled={saving || !title.trim()} type="submit">
                <Plus size={15} />
                Add task
              </button>
            </form>
          </aside>

          <div className="task-list-panel">
            {error ? <p className="task-error">{error}</p> : null}
            {loading ? <p className="task-empty">Loading tasks</p> : null}
            {!loading && !tasks.length ? <p className="task-empty">No task notes yet. Add one here or create markdown in tasks/.</p> : null}
            {!loading && selectedDate && !filteredOpenTasks.length && !filteredDoneTasks.length ? (
              <p className="task-empty">No tasks for {formatDateGroup(selectedDate)}.</p>
            ) : null}
            {dateGroups.map(([dateKey, groupTasks]) => (
              <div className="task-section" key={dateKey}>
                <span>{formatDateGroup(dateKey === "none" ? null : dateKey)}</span>
                {groupTasks.map(renderTask)}
              </div>
            ))}
            {filteredDoneTasks.length ? (
              <div className="task-section muted">
                <span>Done</span>
                {filteredDoneTasks.map(renderTask)}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
