import { useCallback, useEffect, useState, type FormEvent } from "react";
import { emptyBrainState, type BrainState } from "./brain-types";

type Props = {
  model: string;
  onModelChange: (model: string) => void;
  models: string[];
  ollamaModels: string[];
  onLoadModels: () => void;
  onLoadOllamaModels: () => void;
  onUseIdea: (text: string) => void;
  onNotice: (text: string) => void;
};
type KnowledgeDocument = { id: string; name: string; kind: string; importedAt: string; characters: number };
const localTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Just now"
    : date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};
const isLlamaModel = (id: string) => /llama/i.test(id);

export function BrainWorkspace({
  model,
  onModelChange,
  models,
  ollamaModels,
  onLoadModels,
  onLoadOllamaModels,
  onUseIdea,
  onNotice,
}: Props) {
  const [brain, setBrain] = useState<BrainState>(emptyBrainState);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalBody, setGoalBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [knowledge, setKnowledge] = useState<KnowledgeDocument[]>([]);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeHits, setKnowledgeHits] = useState<{ name: string; excerpt: string }[]>([]);
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/brain/state", { cache: "no-store" });
      if (!response.ok) throw new Error("Brain service unavailable");
      const state = (await response.json()) as BrainState;
      setBrain(state);
      setConnected(true);
      const library = await fetch("/api/knowledge", { cache: "no-store" });
      if (library.ok) setKnowledge(((await library.json()).documents ?? []) as KnowledgeDocument[]);
    } catch {
      setConnected(false);
    }
  }, []);

  const importKnowledge = async () => {
    setImporting(true);
    try {
      const response = await fetch("/api/knowledge/import", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not import files.");
      setKnowledge((body.documents ?? []) as KnowledgeDocument[]);
      const failures = (body.errors ?? []).map((entry: { name: string; error: string }) => `${entry.name}: ${entry.error}`);
      onNotice(body.canceled ? "File selection canceled." : `${(body.documents ?? []).length} business source${(body.documents ?? []).length === 1 ? "" : "s"} in the local Brain.${failures.length ? ` ${failures.join(" · ")}` : ""}`);
      await refresh();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "The desktop file importer is unavailable.");
    } finally { setImporting(false); }
  };
  const searchKnowledge = async (event: FormEvent) => {
    event.preventDefault();
    if (!knowledgeQuery.trim()) { setKnowledgeHits([]); return; }
    const response = await fetch("/api/knowledge/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: knowledgeQuery }) });
    if (response.ok) setKnowledgeHits((await response.json()).results ?? []);
  };
  const removeKnowledge = async (id: string) => {
    const response = await fetch("/api/knowledge/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (response.ok) setKnowledge(((await response.json()).documents ?? []) as KnowledgeDocument[]);
  };
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 6000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const openRouterModels = models.filter((id) => id !== "openrouter/free");
  const freeLlamaModels = openRouterModels.filter(isLlamaModel);
  const otherFreeModels = openRouterModels.filter((id) => !isLlamaModel(id));
  const localLlamaModels = ollamaModels.filter(isLlamaModel);
  const otherLocalModels = ollamaModels.filter((id) => !isLlamaModel(id));

  const save = async (next: BrainState, message?: string) => {
    setBrain(next);
    try {
      const response = await fetch("/api/brain/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error();
      const body = await response.json();
      setBrain(body.state as BrainState);
      setConnected(true);
      if (message) onNotice(message);
    } catch {
      setConnected(false);
      onNotice("Brain settings need the Robot Orchestra Windows desktop app.");
    }
  };

  const thinkNow = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/brain/think", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "manual" }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not start a planning pass.");
      onNotice(model.startsWith("ollama:")
        ? "Ollama is preparing local suggestions only. Nothing will be executed automatically."
        : "Hermes is preparing suggestions only. Nothing will be executed automatically.");
      await refresh();
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : "Could not reach the selected model. Check Hermes or local Ollama.",
      );
    } finally {
      setBusy(false);
    }
  };

  const addGoal = async (event: FormEvent) => {
    event.preventDefault();
    const title = goalTitle.trim();
    if (!title) return;
    const next: BrainState = {
      ...brain,
      goals: [
        ...brain.goals,
        {
          id: crypto.randomUUID(),
          title,
          body: goalBody.trim().slice(0, 1000),
          progress: 0,
          status: "active" as const,
          createdAt: new Date().toISOString(),
        },
      ].slice(-30),
    };
    setGoalTitle("");
    setGoalBody("");
    await save(next, "Goal added to the local Brain workspace.");
  };

  const updateGoal = async (
    goalId: string,
    update: Partial<BrainState["goals"][number]>,
  ) => {
    await save({
      ...brain,
      goals: brain.goals.map((goal) =>
        goal.id === goalId ? { ...goal, ...update } : goal,
      ),
    });
  };

  const updateIdea = async (ideaId: string, status: "queued" | "dismissed") => {
    await save({
      ...brain,
      ideas: brain.ideas.map((idea) =>
        idea.id === ideaId ? { ...idea, status } : idea,
      ),
    });
  };

  const updateSettings = async (settings: Partial<BrainState["settings"]>) => {
    await save({
      ...brain,
      settings: {
        ...brain.settings,
        ...settings,
        model: settings.model || model,
      },
    });
  };

  useEffect(() => {
    if (!connected || brain.settings.model === model) return;
    void save({ ...brain, settings: { ...brain.settings, model } });
  }, [connected, model, brain.settings.model]);

  return (
    <section className="brain-workspace" aria-label="Brain workspace">
      <header className="brain-hero">
        <div className="brain-hero-mark">
          <span>◈</span>
          <i />
        </div>
        <div className="brain-hero-copy">
          <div className="panel-kicker">
            THE BRAIN · PLANNING, MEMORY & ROUTING
          </div>
          <h2>Keep the next move in view.</h2>
          <p>
            Your selected model turns goals and recent work into reviewable suggestions.
            Planning is suggestions-only; nothing executes automatically.
          </p>
        </div>
        <button
          className="button primary brain-think-button"
          onClick={() => void thinkNow()}
          disabled={busy || brain.pulseStatus === "thinking"}
        >
          <span className="brain-pulse-glyph">✦</span>
          {busy || brain.pulseStatus === "thinking"
            ? "Thinking…"
            : "Think ahead"}
        </button>
      </header>

      <div className="brain-status-row">
        <span className={`brain-live ${connected ? "online" : "offline"}`}>
          <i />
          {connected ? "Desktop Brain connected" : "Waiting for desktop app"}
        </span>
        <span className="brain-status-sep">·</span>
        <span>
          {brain.lastPulseAt
            ? `Last planning pass ${localTime(brain.lastPulseAt)}`
            : "No planning pass yet"}
        </span>
        <span className="brain-status-sep">·</span>
        <span>
          {brain.goals.filter((goal) => goal.status === "active").length} active
          goals
        </span>
      </div>

      <section className="brain-panel knowledge-library">
        <div className="brain-panel-head"><div><div className="panel-kicker">LOCAL KNOWLEDGE</div><h3>Business source library <span className="brain-count">{knowledge.length}</span></h3></div><button className="button primary" onClick={() => void importKnowledge()} disabled={importing}>{importing ? "Reading…" : "+ Add files"}</button></div>
        <p className="knowledge-note">Selected documents are extracted and stored on this PC. Sources are only shared with Hermes when you explicitly enable Knowledge in chat.</p>
        <form className="knowledge-search" onSubmit={(event) => void searchKnowledge(event)}><input value={knowledgeQuery} onChange={(event) => setKnowledgeQuery(event.target.value)} placeholder="Search imported sources" aria-label="Search Knowledge library"/><button className="outline-button" type="submit">Search</button></form>
        {knowledgeHits.length > 0 && <div className="knowledge-results">{knowledgeHits.map((hit, index) => <article key={`${hit.name}-${index}`}><b>{hit.name}</b><p>{hit.excerpt}</p></article>)}</div>}
        <div className="knowledge-documents">{knowledge.map((doc) => <article key={doc.id}><span className="knowledge-file-icon">{doc.kind.toUpperCase().slice(0, 4)}</span><div><b>{doc.name}</b><small>{doc.characters.toLocaleString()} characters · added {localTime(doc.importedAt)}</small></div><button className="knowledge-remove" onClick={() => void removeKnowledge(doc.id)} aria-label={`Remove ${doc.name}`}>Remove</button></article>)}{!knowledge.length && <div className="brain-empty"><b>No documents yet</b><small>Add PDFs, Word files, spreadsheets or text documents to build a searchable local business library.</small></div>}</div>
      </section>

      <div className="brain-layout">
        <div className="brain-primary-column">
          <article className="brain-panel brain-next-panel">
            <div className="brain-panel-head">
              <div>
                <div className="panel-kicker">NEXT MOVE</div>
                <h3>
                  {brain.nextMove || "Add a goal to give Hermes direction."}
                </h3>
              </div>
              <span className="brain-spark">✦</span>
            </div>
            <div className="brain-next-foot">
              <span>
                <i
                  className={brain.pulseStatus === "thinking" ? "thinking" : ""}
                />
                Suggestion only · review before acting
              </span>
              <span>Updated {localTime(brain.updatedAt)}</span>
            </div>
          </article>

          <section className="brain-panel brain-ideas-panel">
            <div className="brain-panel-head">
              <div>
                <div className="panel-kicker">IDEA QUEUE</div>
                <h3>
                  Ideas to explore{" "}
                  <span className="brain-count">
                    {brain.ideas.filter((idea) => idea.status === "new").length}
                  </span>
                </h3>
              </div>
              <span className="brain-small-note">
                Choose one to turn it into a task
              </span>
            </div>
            {brain.ideas.filter(
              (idea) => idea.status === "new" || idea.status === "queued",
            ).length ? (
              <div className="brain-list">
                {brain.ideas
                  .filter(
                    (idea) => idea.status === "new" || idea.status === "queued",
                  )
                  .slice()
                  .reverse()
                  .slice(0, 8)
                  .map((idea) => (
                    <article className="brain-idea-card" key={idea.id}>
                      <span className="brain-idea-icon">✳</span>
                      <div className="brain-item-copy">
                        <b>{idea.title}</b>
                        {idea.body && <p>{idea.body}</p>}
                        <small>{localTime(idea.createdAt)}</small>
                      </div>
                      <button
                        className="brain-item-action"
                        onClick={() => {
                          onUseIdea(
                            `${idea.title}${idea.body ? `\n\n${idea.body}` : ""}`,
                          );
                          void updateIdea(idea.id, "queued");
                        }}
                      >
                        Use in chat ↗
                      </button>
                    </article>
                  ))}
              </div>
            ) : (
              <div className="brain-empty">
                <span>✧</span>
                <b>No ideas yet</b>
                <small>
                  Send a task or choose Think ahead to ask your selected model for ideas.
                </small>
              </div>
            )}
          </section>

          <section className="brain-panel brain-goals-panel">
            <div className="brain-panel-head">
              <div>
                <div className="panel-kicker">NORTH STARS</div>
                <h3>
                  Your goals{" "}
                  <span className="brain-count">
                    {
                      brain.goals.filter((goal) => goal.status === "active")
                        .length
                    }
                  </span>
                </h3>
              </div>
              <span className="brain-small-note">
                Brain proposes progress updates; you approve them
              </span>
            </div>
            {brain.goals.length ? (
              <div className="brain-goal-list">
                {brain.goals
                  .slice()
                  .reverse()
                  .map((goal) => (
                    <article
                      className={`brain-goal-card goal-${goal.status}`}
                      key={goal.id}
                    >
                      <div className="brain-goal-title">
                        <b>{goal.title}</b>
                        <select
                          aria-label={`Goal status for ${goal.title}`}
                          value={goal.status}
                          onChange={(event) =>
                            void updateGoal(goal.id, {
                              status: event.target.value as
                                | "active"
                                | "paused"
                                | "done",
                            })
                          }
                        >
                          <option value="active">Active</option>
                          <option value="paused">Paused</option>
                          <option value="done">Done</option>
                        </select>
                      </div>
                      {goal.body && <p>{goal.body}</p>}
                      <div className="brain-progress-meta">
                        <span>{goal.progress}% complete</span>
                        {goal.proposedProgress !== undefined && (
                          <span className="brain-proposed-label">
                            Suggestion: {goal.proposedProgress}%
                          </span>
                        )}
                      </div>
                      <div className="brain-progress">
                        <i style={{ width: `${goal.progress}%` }} />
                      </div>
                      {goal.proposedProgress !== undefined && (
                        <div className="brain-goal-proposal">
                          <span>
                            {goal.proposedReason ||
                              "Hermes suggests updating progress."}
                          </span>
                          <button
                            onClick={() =>
                              void updateGoal(goal.id, {
                                progress: goal.proposedProgress,
                                proposedProgress: undefined,
                                proposedReason: undefined,
                              })
                            }
                          >
                            Accept
                          </button>
                          <button
                            className="dismiss"
                            onClick={() =>
                              void updateGoal(goal.id, {
                                proposedProgress: undefined,
                                proposedReason: undefined,
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
              <div className="brain-empty compact">
                <span>◎</span>
                <b>No goals added</b>
                <small>
                  Add one below; the Brain uses goals as planning context.
                </small>
              </div>
            )}
            <form
              className="brain-goal-form"
              onSubmit={(event) => void addGoal(event)}
            >
              <input
                value={goalTitle}
                onChange={(event) => setGoalTitle(event.target.value)}
                placeholder="A goal worth moving toward…"
                aria-label="New goal title"
                maxLength={180}
                required
              />
              <input
                value={goalBody}
                onChange={(event) => setGoalBody(event.target.value)}
                placeholder="Optional details or definition of done"
                aria-label="Goal details"
                maxLength={1000}
              />
              <button type="submit" className="button quiet">
                ＋ Add goal
              </button>
            </form>
          </section>
        </div>

        <aside className="brain-side-column">
          <section className="brain-panel brain-model-panel">
            <div className="panel-kicker">THINKING ENGINE</div>
            <h3>Model & cadence</h3>
            <label className="brain-control-label">TASK & PLANNING MODEL</label>
            <div className="brain-model-row">
              <select
                value={model}
                onChange={(event) => {
                  onModelChange(event.target.value);
                  void updateSettings({ model: event.target.value });
                }}
              >
                <optgroup label="OpenRouter free · Hermes delegation">
                  <option value="openrouter/free">openrouter/free · automatic free routing</option>
                </optgroup>
                <optgroup label="Llama · OpenRouter zero-price">
                  {freeLlamaModels.length
                    ? freeLlamaModels.map((id) => <option key={id} value={id}>{id}</option>)
                    : <option disabled>No zero-price Llama currently listed</option>}
                </optgroup>
                <optgroup label="Other OpenRouter free models">
                  {otherFreeModels.map((id) => <option key={id} value={id}>{id}</option>)}
                </optgroup>
                <optgroup label="Local Llama · Ollama">
                  {localLlamaModels.length
                    ? localLlamaModels.map((id) => <option key={id} value={id}>{id}</option>)
                    : <option disabled>Install locally, then detect models</option>}
                </optgroup>
                <optgroup label="Other local Ollama models · direct">
                  {otherLocalModels.map((id) => <option key={id} value={id}>{id}</option>)}
                </optgroup>
                {!new Set(["openrouter/free", ...models, ...ollamaModels]).has(model) && (
                  <option value={model}>{model} · saved choice (refresh provider list)</option>
                )}
              </select>
              <button
                className="brain-icon-action"
                onClick={onLoadModels}
                title="Load free OpenRouter models"
                aria-label="Load free models"
              >
                ↻
              </button>
              <button
                className="brain-icon-action"
                onClick={onLoadOllamaModels}
                title="Detect installed Ollama models on this PC"
                aria-label="Detect local Ollama models"
              >
                ◉
              </button>
            </div>
            <p className="brain-control-hint">
              {model.startsWith("ollama:")
                ? "Runs directly through Ollama on this PC. No prompt is sent to Hermes, and Scout/Builder/Reviewer are not delegated."
                : `Sent to your local Hermes adapter for orchestration. OpenRouter free model availability and provider limits can vary.${freeLlamaModels.length ? " Zero-price Llama choices are listed above." : " No Llama model is currently listed at zero price; a detected Ollama Llama runs locally."}`}
            </p>
            <div className="brain-setting-divider" />
            <label className="brain-proactive-toggle">
              <span>
                <b>Proactive planning</b>
                <small>Suggest next moves while the app is open</small>
              </span>
              <input
                type="checkbox"
                checked={brain.settings.proactiveEnabled}
                onChange={(event) =>
                  void updateSettings({
                    proactiveEnabled: event.target.checked,
                  })
                }
              />
            </label>
            <label className="brain-control-label" htmlFor="brain-cadence">
              IDLE CHECK-IN
            </label>
            <select
              id="brain-cadence"
              className="brain-full-select"
              value={brain.settings.intervalMinutes}
              onChange={(event) =>
                void updateSettings({
                  intervalMinutes: Number(event.target.value) as 15 | 30 | 60,
                })
              }
            >
              <option value="15">Every 15 minutes</option>
              <option value="30">Every 30 minutes</option>
              <option value="60">Every hour</option>
            </select>
            <p className="brain-control-hint">
              Also reviews after task completions. Planning uses the latest feed
              and goals, sends no browser content, delegates no agents, and asks
              for suggestions only. Approve an idea before it becomes a task.
            </p>
          </section>

          <section className="brain-panel brain-feed-panel">
            <div className="brain-panel-head">
              <div>
                <div className="panel-kicker">WORK FEED</div>
                <h3>Recent signals</h3>
              </div>
              <span className="brain-count">{brain.feed.length}</span>
            </div>
            {brain.feed.length ? (
              <div className="brain-feed-list">
                {brain.feed
                  .slice()
                  .reverse()
                  .slice(0, 10)
                  .map((item) => (
                    <article
                      key={item.id}
                      className={`brain-feed-item feed-${item.kind}`}
                    >
                      <i />
                      <div>
                        <b>{item.title}</b>
                        <p>{item.body}</p>
                        <small>{localTime(item.createdAt)}</small>
                      </div>
                    </article>
                  ))}
              </div>
            ) : (
              <div className="brain-empty compact">
                <span>◷</span>
                <b>Quiet so far</b>
                <small>
                  Task outcomes, planning passes and scans appear here.
                </small>
              </div>
            )}
          </section>

          <section className="brain-panel brain-artifact-panel">
            <div className="brain-panel-head">
              <div>
                <div className="panel-kicker">OUTPUT SHELF</div>
                <h3>
                  Artifacts{" "}
                  <span className="brain-count">{brain.artifacts.length}</span>
                </h3>
              </div>
            </div>
            {brain.artifacts.length ? (
              <div className="brain-artifact-list">
                {brain.artifacts
                  .slice()
                  .reverse()
                  .slice(0, 8)
                  .map((artifact) => (
                    <article key={artifact.id}>
                      <span className="artifact-file-icon">▤</span>
                      <div>
                        <b>{artifact.name}</b>
                        <small>
                          {artifact.body ||
                            artifact.path ||
                            artifact.url ||
                            "Created by a delegated task"}
                        </small>
                      </div>
                      <time>{localTime(artifact.createdAt)}</time>
                    </article>
                  ))}
              </div>
            ) : (
              <div className="brain-empty compact">
                <span>▤</span>
                <b>No artifacts recorded</b>
                <small>
                  File or URL references returned by Hermes show up here.
                </small>
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
