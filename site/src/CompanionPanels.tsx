import { useState, type FormEvent } from "react";
import type { BrainState } from "./brain-types";

export type CompanionSection =
  | "chat"
  | "tasks"
  | "feed"
  | "ideas"
  | "goals"
  | "artifacts";
type Props = {
  active: CompanionSection;
  onSelect: (section: CompanionSection) => void;
  brain: BrainState;
  onUseIdea: (text: string) => void;
  onSave: (state: BrainState) => Promise<void>;
};
const labels: { id: CompanionSection; label: string; icon: string }[] = [
  { id: "chat", label: "Chat", icon: "chat" },
  { id: "tasks", label: "Tasks", icon: "tasks" },
  { id: "feed", label: "Feed", icon: "feed" },
  { id: "ideas", label: "Ideas", icon: "ideas" },
  { id: "goals", label: "Goals", icon: "goals" },
  { id: "artifacts", label: "Artifacts", icon: "artifacts" },
];
function Glyph({ name }: { name: string }) {
  if (name === "chat")
    return (
      <>
        <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4.5 2 1.1-4A7.5 7.5 0 1 1 20 11.5Z" />
        <path d="M8 11h8M8 14h5" />
      </>
    );
  if (name === "feed")
    return (
      <>
        <path d="M8 5h11a2 2 0 0 1 2 2v12H8z" />
        <path d="M5 8H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12M11 10h6M11 14h6" />
      </>
    );
  if (name === "tasks")
    return (
      <>
        <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
        <path d="m7.5 8 1.2 1.2L11 7m2 1h3m-8.5 4 1.2 1.2L11 11m2 1h3m-8.5 4 1.2 1.2L11 15m2 1h3" />
      </>
    );
  if (name === "ideas")
    return (
      <>
        <path d="M9 18h6M10 21h4M8 15c-1.3-1.1-2-2.7-2-4.5a6 6 0 1 1 12 0c0 1.8-.7 3.4-2 4.5-.7.6-1 1.3-1 2H9c0-.7-.3-1.4-1-2Z" />
        <path d="M12 2V1M3 10H2m20 0h-1M4.9 3.9l-.7-.7m15.6 0-.7.7" />
      </>
    );
  if (name === "goals")
    return (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="m7.5 12.5 3 3 6.5-7" />
      </>
    );
  return (
    <>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
      <path d="M7 7h.01M17 7h.01M7 17h.01M17 17h.01" />
    </>
  );
}
const localTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Now"
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export function CompanionNav({
  active,
  onSelect,
  taskCount,
}: Pick<Props, "active" | "onSelect"> & { taskCount: number }) {
  return (
    <nav className="companion-tabbar" aria-label="Copilot workspace sections">
      {labels.map((item) => (
        <button
          key={item.id}
          className={active === item.id ? "active" : ""}
          onClick={() => onSelect(item.id)}
          aria-label={item.id === "tasks" && taskCount ? `${item.label}, ${taskCount} recent records` : item.label}
          aria-pressed={active === item.id}
          title={item.label}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
          <Glyph name={item.icon} />
          </svg>
          <span>{item.label}</span>
          {item.id === "tasks" && taskCount > 0 && (
            <i className="companion-tab-count">{Math.min(taskCount, 99)}</i>
          )}
        </button>
      ))}
    </nav>
  );
}

export function CompanionPanel({
  active,
  onSelect,
  brain,
  onUseIdea,
  onSave,
}: Props) {
  const [goalTitle, setGoalTitle] = useState("");
  const [goalBody, setGoalBody] = useState("");
  if (active === "chat") return null;
  if (active === "tasks") {
    const taskEvents = brain.feed
      .filter((item) => item.kind === "task")
      .slice()
      .reverse()
      .slice(0, 40);
    return (
      <section className="companion-work-panel" aria-label="Recent tasks">
        <header>
          <span className="panel-kicker">TASK HISTORY</span>
          <h2>
            Tasks <small>{taskEvents.length} recent records</small>
          </h2>
          <p>See what was sent and what came back. Continue drafts a message; it never reruns work by itself.</p>
        </header>
        {taskEvents.length ? (
          <div className="companion-panel-list">
            {taskEvents.map((item) => {
              const title = item.title.toLowerCase();
              const status = title.includes("failed")
                ? "FAILED"
                : title.includes("returned") || title.includes("response")
                  ? "RESULT"
                  : title.includes("sent")
                    ? "SENT"
                    : "UPDATE";
              return (
                <article className="companion-task-card" key={item.id}>
                  <span className={`companion-task-state state-${status.toLowerCase()}`}>{status}</span>
                  <div className="companion-task-copy">
                    <b>{item.title}</b>
                    <p>{item.body || "No task details were recorded."}</p>
                    <time>{localTime(item.createdAt)}</time>
                  </div>
                  <button
                    title="Draft a follow-up in chat; nothing is sent yet"
                    onClick={() => onUseIdea(`Continue from: ${item.title}${item.body ? `\n\n${item.body}` : ""}`)}
                  >
                    Continue ↗
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="companion-panel-empty">
            <span>☷</span>
            <b>No task history yet</b>
            <small>Tasks you send from chat or the browser appear here with their returned updates.</small>
            <button onClick={() => onSelect("chat")}>Start a task ↗</button>
          </div>
        )}
      </section>
    );
  }
  if (active === "feed")
    return (
      <section className="companion-work-panel" aria-label="Activity feed">
        <header>
          <span className="panel-kicker">LIVE SIGNALS</span>
          <h2>
            Feed <small>{brain.feed.length} events</small>
          </h2>
          <p>
            Tasks, scan results and planning updates from this local workspace.
          </p>
        </header>
        {brain.feed.length ? (
          <div className="companion-panel-list">
            {brain.feed
              .slice()
              .reverse()
              .slice(0, 30)
              .map((item) => (
                <article
                  className={`companion-feed-card kind-${item.kind}`}
                  key={item.id}
                >
                  <i />
                  <div>
                    <b>{item.title}</b>
                    <p>{item.body}</p>
                    <time>{localTime(item.createdAt)}</time>
                  </div>
                </article>
              ))}
          </div>
        ) : (
          <div className="companion-panel-empty">
            <span>◷</span>
            <b>Your feed is ready</b>
            <small>
              Task outcomes, crawl summaries and next-move proposals appear
              here.
            </small>
          </div>
        )}
      </section>
    );
  if (active === "ideas")
    return (
      <section className="companion-work-panel" aria-label="Next move ideas">
        <header>
          <span className="panel-kicker">SUGGESTIONS ONLY</span>
          <h2>
            Ideas{" "}
            <small>
              {brain.ideas.filter((idea) => idea.status === "new").length} new
            </small>
          </h2>
          <p>Pick an idea to put it in chat. Nothing runs until you send it.</p>
        </header>
        {brain.nextMove && (
          <article className="companion-next-card">
            <span>✦ NEXT MOVE</span>
            <p>{brain.nextMove}</p>
            <button
              onClick={() => {
                onUseIdea(brain.nextMove);
                onSelect("chat");
              }}
            >
              Use next move ↗
            </button>
          </article>
        )}
        {brain.ideas.filter(
          (idea) => idea.status === "new" || idea.status === "queued",
        ).length ? (
          <div className="companion-panel-list">
            {brain.ideas
              .filter(
                (idea) => idea.status === "new" || idea.status === "queued",
              )
              .slice()
              .reverse()
              .map((idea) => (
                <article className="companion-idea-card" key={idea.id}>
                  <span>✳</span>
                  <div>
                    <b>{idea.title}</b>
                    {idea.body && <p>{idea.body}</p>}
                    <small>
                      {idea.status === "queued"
                        ? "Ready in chat"
                        : localTime(idea.createdAt)}
                    </small>
                  </div>
                  <button
                    onClick={() => {
                      onUseIdea(
                        `${idea.title}${idea.body ? `\n\n${idea.body}` : ""}`,
                      );
                      onSelect("chat");
                      void onSave({
                        ...brain,
                        ideas: brain.ideas.map((entry) =>
                          entry.id === idea.id
                            ? { ...entry, status: "queued" }
                            : entry,
                        ),
                      });
                    }}
                  >
                    Use ↗
                  </button>
                </article>
              ))}
          </div>
        ) : (
          <div className="companion-panel-empty">
            <span>✧</span>
            <b>No ideas yet</b>
            <small>
              Ask the Brain to think ahead or complete a task to refresh the
              queue.
            </small>
          </div>
        )}
      </section>
    );
  if (active === "goals") {
    const addGoal = (event: FormEvent) => {
      event.preventDefault();
      const title = goalTitle.trim();
      if (!title) return;
      void onSave({
        ...brain,
        goals: [
          ...brain.goals,
          {
            id: crypto.randomUUID(),
            title,
            body: goalBody.trim(),
            status: "active" as const,
            progress: 0,
            createdAt: new Date().toISOString(),
          },
        ].slice(-30),
      });
      setGoalTitle("");
      setGoalBody("");
    };
    return (
      <section className="companion-work-panel" aria-label="Goals">
        <header>
          <span className="panel-kicker">NORTH STARS</span>
          <h2>
            Goals{" "}
            <small>
              {brain.goals.filter((goal) => goal.status === "active").length}{" "}
              active
            </small>
          </h2>
          <p>
            Your goals guide the Brain's planning. Proposed progress is yours to
            approve.
          </p>
        </header>
        <form className="companion-goal-form" onSubmit={addGoal}>
          <input
            value={goalTitle}
            onChange={(event) => setGoalTitle(event.target.value)}
            placeholder="What are you working toward?"
            aria-label="New goal"
            maxLength={180}
            required
          />
          <input
            value={goalBody}
            onChange={(event) => setGoalBody(event.target.value)}
            placeholder="Optional details"
            aria-label="Goal details"
            maxLength={1000}
          />
          <button type="submit">＋ Add goal</button>
        </form>
        {brain.goals.length ? (
          <div className="companion-panel-list">
            {brain.goals
              .slice()
              .reverse()
              .map((goal) => (
                <article className="companion-goal-card" key={goal.id}>
                  <div className="companion-goal-heading">
                    <b>{goal.title}</b>
                    <select
                      aria-label={`Status for ${goal.title}`}
                      value={goal.status}
                      onChange={(event) =>
                        void onSave({
                          ...brain,
                          goals: brain.goals.map((entry) =>
                            entry.id === goal.id
                              ? {
                                  ...entry,
                                  status: event.target.value as
                                    | "active"
                                    | "paused"
                                    | "done",
                                }
                              : entry,
                          ),
                        })
                      }
                    >
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                  {goal.body && <p>{goal.body}</p>}
                  <div className="brain-progress">
                    <i style={{ width: `${goal.progress}%` }} />
                  </div>
                  <small>
                    {goal.progress}% complete
                    {goal.proposedProgress !== undefined
                      ? ` · Brain suggests ${goal.proposedProgress}%`
                      : ""}
                  </small>
                  {goal.proposedProgress !== undefined && (
                    <div className="companion-approval">
                      <button
                        onClick={() =>
                          void onSave({
                            ...brain,
                            goals: brain.goals.map((entry) =>
                              entry.id === goal.id
                                ? {
                                    ...entry,
                                    progress: goal.proposedProgress!,
                                    proposedProgress: undefined,
                                    proposedReason: undefined,
                                  }
                                : entry,
                            ),
                          })
                        }
                      >
                        Accept update
                      </button>
                      <button
                        onClick={() =>
                          void onSave({
                            ...brain,
                            goals: brain.goals.map((entry) =>
                              entry.id === goal.id
                                ? {
                                    ...entry,
                                    proposedProgress: undefined,
                                    proposedReason: undefined,
                                  }
                                : entry,
                            ),
                          })
                        }
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </article>
              ))}
          </div>
        ) : (
          <div className="companion-panel-empty">
            <span>◎</span>
            <b>Set a direction</b>
            <small>
              Add one goal and the Brain can suggest a sensible next step.
            </small>
          </div>
        )}
      </section>
    );
  }
  return (
    <section className="companion-work-panel" aria-label="Artifacts">
      <header>
        <span className="panel-kicker">OUTPUT SHELF</span>
        <h2>
          Artifacts <small>{brain.artifacts.length} saved</small>
        </h2>
        <p>
          References returned after tasks. Items are listed, never
          opened automatically.
        </p>
      </header>
      {brain.artifacts.length ? (
        <div className="companion-panel-list">
          {brain.artifacts
            .slice()
            .reverse()
            .map((artifact) => (
              <article className="companion-artifact-card" key={artifact.id}>
                <span>▤</span>
                <div>
                  <b>{artifact.name}</b>
                  <p>{artifact.body || "Output returned by a task"}</p>
                  <small>
                    {artifact.path ||
                      artifact.url ||
                      localTime(artifact.createdAt)}
                  </small>
                </div>
              </article>
            ))}
        </div>
      ) : (
        <div className="companion-panel-empty">
          <span>▤</span>
          <b>Nothing on the shelf yet</b>
          <small>
            When a task returns artifact links or file references, they'll be
            tracked here.
          </small>
        </div>
      )}
    </section>
  );
}
