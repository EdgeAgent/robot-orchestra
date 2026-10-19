import "./orchestra.css";
import "./brain.css";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { RobotHead, type RobotHeadState } from "robot-heads";
import { BrainWorkspace } from "./BrainWorkspace";
import { CompanionVoice } from "./CompanionVoice";
import {
  CompanionNav,
  CompanionPanel,
  type CompanionSection,
} from "./CompanionPanels";
import { emptyBrainState, type BrainState } from "./brain-types";

declare global {
  interface Window {
    orchestraDesktop?: {
      showFloatingHead: () => void;
      openChat: () => void;
      openDashboard: () => void;
      beginCompanionDrag: (screenX: number, screenY: number) => void;
      moveCompanionDrag: (screenX: number, screenY: number) => void;
      endCompanionDrag: () => void;
      onCompanionState: (
        callback: (state: { expanded: boolean }) => void,
      ) => () => void;
    };
  }
}

type Agent = {
  id: string;
  name: string;
  role: string;
  state: RobotHeadState;
  color: string;
  trim: string;
  activity: string;
  model: string;
};
type Message = {
  who: string;
  text: string;
  time: string;
  kind?: "system" | "agent";
};
const initialAgents: Agent[] = [
  {
    id: "hermes",
    name: "Hermes",
    role: "Orchestrator",
    state: "thinking",
    color: "#394d98",
    trim: "#879ad4",
    activity: "Ready to coordinate",
    model: "Local coordinator",
  },
  {
    id: "scout",
    name: "Scout",
    role: "Research agent",
    state: "idle",
    color: "#247267",
    trim: "#74c8ad",
    activity: "Standing by",
    model: "OpenRouter · free",
  },
  {
    id: "builder",
    name: "Builder",
    role: "Code agent",
    state: "working",
    color: "#985f3d",
    trim: "#e4b18b",
    activity: "Watching workspace",
    model: "OpenRouter · free",
  },
  {
    id: "reviewer",
    name: "Reviewer",
    role: "Quality agent",
    state: "sleeping",
    color: "#71568b",
    trim: "#baa1d2",
    activity: "Standing by",
    model: "OpenRouter · free",
  },
];
const initialMessages: Message[] = [
  {
    who: "Orchestra",
    text: "Your desktop bridge is not connected yet. Set up the Hermes local adapter to enable task delegation.",
    time: "08:14",
    kind: "system",
  },
  {
    who: "Hermes",
    text: "I coordinate the team. Jev can help classify and route bounded decisions; a language model handles the open-ended work.",
    time: "08:15",
    kind: "agent",
  },
];
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    home: (
      <>
        <rect x="3.5" y="4" width="17" height="16" rx="3" />
        <path d="M3.5 9h17M8 4v5" />
      </>
    ),
    agents: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19v-1.2a5.5 5.5 0 0 1 11 0V19zM16 5.4a3 3 0 0 1 0 5.2M18 14a4 4 0 0 1 2.5 3.7V19h-3" />
      </>
    ),
    brain: (
      <>
        <path d="M9 4.5a3.5 3.5 0 0 0-5.5 3 3.3 3.3 0 0 0 .7 2 3.5 3.5 0 0 0 1 6.6 3.8 3.8 0 0 0 4 4.4h2V4.5z" />
        <path d="M15 4.5a3.5 3.5 0 0 1 5.5 3 3.3 3.3 0 0 1-.7 2 3.5 3.5 0 0 1-1 6.6 3.8 3.8 0 0 1-4 4.4h-2V4.5zM8 8h2m4 0h2M8 13h2m4 0h2" />
      </>
    ),
    plug: (
      <>
        <path d="M8 7V3m8 4V3M6 7h12v3a6 6 0 0 1-6 6v5m0-5a6 6 0 0 1-6-6z" />
      </>
    ),
    box: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4.4 7.7 12 12l7.6-4.3M12 12v9" />
      </>
    ),
    monitor: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8m-4-4v4" />
      </>
    ),
    github: (
      <>
        <path
          d="M9 19c-4.3 1.3-4.3-2.5-6-3m12 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.2-1.5 6.2-6.8a5.3 5.3 0 0 0-1.4-3.7 4.9 4.9 0 0 0-.1-3.7S17.6 1 14 3.4a13 13 0 0 0-7 0C3.4 1 2.2 1.3 2.2 1.3a4.9 4.9 0 0 0-.1 3.7A5.3 5.3 0 0 0 .7 8.7c0 5.3 3.2 6.5 6.2 6.8a3.4 3.4 0 0 0-.9 2.6V22"
          transform="translate(2 0) scale(.9)"
        />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="m19 14 2 2-2 3-3-1-2 1-1 3h-3l-1-3-2-1-3 1-2-3 2-2v-2l-2-2 2-3 3 1 2-1 1-3h3l1 3 2 1 3-1 2 3-2 2z" />
      </>
    ),
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.4" />
        <path d="m16 16 4.2 4.2" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </>
    ),
    send: (
      <>
        <path d="m21 3-7.1 18-3.8-7.1L3 10.1zM21 3 10.1 13.9" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.spark}
    </svg>
  );
}
const nav = [
  { name: "Overview", icon: "home" },
  { name: "Agents", icon: "agents" },
  { name: "Brain", icon: "brain" },
  { name: "Connections", icon: "plug" },
  { name: "Skills", icon: "box" },
  { name: "Computer", icon: "monitor" },
  { name: "GitHub", icon: "github" },
];
const formatTime = () =>
  new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
const isLlamaModel = (id: string) => /llama/i.test(id);
function DashboardApp() {
  const [active, setActive] = useState(() =>
    new URLSearchParams(window.location.search).get("section") === "brain"
      ? "Brain"
      : "Overview",
  );
  const [agents, setAgents] = useState(initialAgents);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState("hermes");
  const [endpoint, setEndpoint] = useState(
    () =>
      sessionStorage.getItem("orchestra-hermes-url") || "http://127.0.0.1:8787",
  );
  const [modelKey, setModelKey] = useState("");
  const [jevKey, setJevKey] = useState("");
  const [model, setModel] = useState(
    () => localStorage.getItem("orchestra-model") || "openrouter/free",
  );
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState(false);
  const [setup, setSetup] = useState(false);
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [browserContext, setBrowserContext] = useState<{
    title: string;
    url: string;
    selectedText: string;
  } | null>(null);
  const [jevMode, setJevMode] = useState(false);
  const [githubRepo, setGithubRepo] = useState("");
  useEffect(() => {
    localStorage.setItem("orchestra-model", model);
  }, [model]);
  useEffect(() => {
    const syncModel = (event: StorageEvent) => {
      if (event.key === "orchestra-model" && event.newValue) setModel(event.newValue);
    };
    window.addEventListener("storage", syncModel);
    return () => window.removeEventListener("storage", syncModel);
  }, []);
  const picked = agents.find((a) => a.id === selected) ?? agents[0];
  const filtered = useMemo(
    () =>
      agents.filter((a) =>
        `${a.name} ${a.role}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [agents, query],
  );
  const openRouterModels = models.filter((id) => id !== "openrouter/free");
  const freeLlamaModels = openRouterModels.filter(isLlamaModel);
  const otherFreeModels = openRouterModels.filter((id) => !isLlamaModel(id));
  const localLlamaModels = ollamaModels.filter(isLlamaModel);
  const otherLocalModels = ollamaModels.filter((id) => !isLlamaModel(id));
  const addMessage = (
    who: string,
    text: string,
    kind: Message["kind"] = "agent",
  ) => setMessages((m) => [...m, { who, text, time: formatTime(), kind }]);
  const updateAgent = (id: string, patch: Partial<Agent>) =>
    setAgents((xs) => xs.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const loadModels = async () => {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models");
      if (!response.ok) throw new Error();
      const data = await response.json();
      const free = (data.data ?? [])
        .filter(
          (m: { pricing?: { prompt?: string; completion?: string } }) =>
            Number(m.pricing?.prompt) === 0 &&
            Number(m.pricing?.completion) === 0,
        )
        .map((m: { id: string }) => m.id);
      setModels(free);
      const llamaCount = free.filter(isLlamaModel).length;
      setNotice(
        free.length
          ? `Loaded ${free.length} zero-price models.${llamaCount ? ` ${llamaCount} Llama option${llamaCount === 1 ? " is" : "s are"} currently listed.` : " No Llama model is currently listed at zero price; detect a local Ollama Llama if you have one installed."} Provider limits vary.`
          : "No zero-price models returned. No free Llama appears in the current list; a local Ollama Llama can be selected after detection.",
      );
    } catch {
      setNotice(
        "Could not load OpenRouter’s model catalogue. You can still select openrouter/free.",
      );
    }
  };
  const loadOllamaModels = async () => {
    try {
      const response = await fetch("/api/ollama/models", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ollama is not available.");
      const found = (data.models ?? []) as string[];
      setOllamaModels(found);
      setNotice(found.length
        ? `Found ${found.length} local Ollama model${found.length === 1 ? "" : "s"}. These run directly on this PC and do not delegate to Hermes.`
        : "Ollama is running, but no local models are installed yet.");
    } catch (error) {
      setOllamaModels([]);
      setNotice(error instanceof Error ? error.message : "Could not reach local Ollama at 127.0.0.1:11434.");
    }
  };
  const selectDashboardModel = async (value: string) => {
    setModel(value);
    try {
      const current = await fetch("/api/brain/state", { cache: "no-store" });
      if (!current.ok) return;
      const brain = await current.json();
      await fetch("/api/brain/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...brain, settings: { ...brain.settings, model: value } }),
      });
    } catch {}
  };
  const send = async () => {
    const text = draft.trim();
    if (!text || running) return;
    setDraft("");
    setRunning(true);
    addMessage("You", text, "system");
    updateAgent("hermes", {
      state: "thinking",
      activity: "Planning delegation",
    });
    try {
      let delegateTo = agents.filter((a) => a.id !== "hermes").map((a) => a.id);
      let routedModel = model;
      if (jevMode) {
        if (model.startsWith("ollama:"))
          throw new Error("Jev routing selects OpenRouter models only. Turn off Jev routing to use direct local Ollama.");
        if (!jevKey)
          throw new Error(
            "Jev routing is enabled but its API key is missing. Add it in Bridge setup.",
          );
        const decision = await fetch("/api/jev/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task: text,
            jevApiKey: jevKey,
            delegates: agents
              .filter((a) => a.id !== "hermes")
              .map((a) => ({ id: a.id, role: a.role })),
            models: [...new Set(["openrouter/free", ...models])].slice(0, 20),
          }),
        });
        const route = await decision.json();
        if (!decision.ok) throw new Error(route.error || "Jev routing failed.");
        delegateTo = [route.delegateId];
        routedModel = route.modelId;
        addMessage(
          "Jev",
          `Typed routing selected ${route.delegateId} and ${route.modelId}.`,
          "agent",
        );
      }
      const response = await fetch("/api/orchestra/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(modelKey ? { Authorization: `Bearer ${modelKey}` } : {}),
        },
        body: JSON.stringify({
          task: text,
          hermesUrl: endpoint,
          browserContext: browserContext || undefined,
          coordinator: "hermes",
          delegateTo,
          model: routedModel,
          routing: jevMode ? "jev-typed-decision" : "hermes-policy",
          githubRepo: githubRepo || undefined,
          source: "robot-heads-orchestra",
        }),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const localRoute = data.route === "ollama-local";
      addMessage(
        localRoute ? "Ollama · local" : "Hermes",
        data.message ??
          data.result ??
          (localRoute ? "Local model answered directly." : "Task accepted by your Hermes bridge. Delegates are working."),
        "agent",
      );
      updateAgent("hermes", {
        state: localRoute ? "idle" : "speaking",
        activity: localRoute ? "Local Ollama answered directly" : "Delegation started",
      });
      (localRoute ? [] : (data.delegates ?? [])).forEach((d: { id: string; status?: string }) =>
        updateAgent(d.id, {
          state: d.status === "done" ? "happy" : "working",
          activity:
            d.status === "done" ? "Completed" : "Working on delegated task",
        }),
      );
    } catch (error) {
      addMessage(
        jevMode ? "Routing or bridge error" : "Bridge not connected",
        error instanceof Error
          ? error.message
          : `Could not reach the desktop app or Hermes at ${endpoint}.`,
        "system",
      );
      updateAgent("hermes", { state: "error", activity: "Needs attention" });
    } finally {
      setRunning(false);
      setTimeout(
        () =>
          updateAgent("hermes", {
            state: "idle",
            activity: "Ready to coordinate",
          }),
        2800,
      );
    }
  };
  const testBridge = async () => {
    setNotice("Checking your local Hermes bridge…");
    try {
      const response = await fetch("/api/test-hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hermesUrl: endpoint }),
        signal: AbortSignal.timeout(4500),
      });
      if (!response.ok) throw new Error();
      sessionStorage.setItem("orchestra-hermes-url", endpoint);
      setNotice("Hermes bridge reachable on this computer.");
    } catch {
      setNotice(
        "Hermes bridge not reachable. Start its local adapter and retry.",
      );
    }
  };
  const importBrowserContext = async () => {
    try {
      const response = await fetch("/api/browser/context");
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!result.context) {
        setNotice(
          "No browser tab shared yet. Use the Robot Orchestra extension in Chrome or Edge first.",
        );
        return;
      }
      const c = result.context;
      setBrowserContext(c);
      setNotice(`Attached “${c.title || c.url}” to the next task.`);
    } catch {
      setNotice("Could not read browser context from the desktop app.");
    }
  };
  const invite = () => {
    const n = `Agent ${agents.length}`;
    const id = `agent-${Date.now()}`;
    setAgents((xs) => [
      ...xs,
      {
        id,
        name: n,
        role: "Specialist",
        state: "idle",
        color: "#486c82",
        trim: "#91c2d6",
        activity: "Configure a skill to begin",
        model: "OpenRouter · free",
      },
    ]);
    setSelected(id);
    setNotice(`${n} added to your orchestra.`);
  };
  const go = (name: string) => {
    setActive(name);
    if (name === "Connections" || name === "Computer") setSetup(true);
  };
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" onClick={() => go("Overview")}>
          <span className="brand-mark">
            <RobotHead
              size={37}
              state="happy"
              color="#4056a3"
              trimColor="#98a7d2"
              interactive={false}
            />
          </span>
          <span className="brand-name">
            orchestra<span className="brand-dot">.</span>
            <small>ROBOT HEADS</small>
          </span>
        </a>
        <div className="workspace">
          <div className="workspace-avatar">F</div>
          <div className="workspace-copy">
            <b>Personal workspace</b>
            <small>Local environment</small>
          </div>
          <span className="chevron">⌄</span>
        </div>
        <div className="side-label">WORKSPACE</div>
        <nav className="nav">
          {nav.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${active === item.name ? "active" : ""}`}
              onClick={() => go(item.name)}
            >
              <Icon name={item.icon} />
              <span>{item.name}</span>
              {item.name === "Agents" && (
                <span className="nav-count">{agents.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="side-section-head">
          <span className="side-label">YOUR ORCHESTRA</span>
          <button className="tiny-icon" title="Add agent" onClick={invite}>
            <Icon name="plus" size={16} />
          </button>
        </div>
        <input
          className="agent-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find an agent"
          aria-label="Find an agent"
        />
        <div className="side-agents">
          {filtered.map((a) => (
            <button
              key={a.id}
              className={`side-agent ${selected === a.id ? "selected" : ""}`}
              onClick={() => {
                setSelected(a.id);
                setActive("Agents");
              }}
            >
              <span className="mini-avatar" style={{ background: a.color }}>
                <RobotHead
                  size={34}
                  state={a.state}
                  color={a.color}
                  trimColor={a.trim}
                  interactive={false}
                  seed={agents.indexOf(a) / 10}
                />
              </span>
              <span className="side-agent-copy">
                <b>{a.name}</b>
                <small>{a.role}</small>
              </span>
              <i
                className={`presence ${a.state === "working" || a.state === "thinking" ? "busy" : ""}`}
              />
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="computer-pill">
            <span className="computer-light" />
            <span>
              <b>Desktop bridge</b>
              <small>Not connected</small>
            </span>
            <button
              className="connect-small"
              onClick={() => {
                setActive("Computer");
                setSetup(true);
              }}
            >
              Connect
            </button>
          </div>
          <button
            className="nav-item settings-item"
            onClick={() => go("Settings")}
          >
            <Icon name="settings" />
            <span>Settings</span>
          </button>
          <div className="profile">
            <div className="profile-avatar">F</div>
            <div>
              <b>Local operator</b>
              <small>Free model routing</small>
            </div>
            <Icon name="more" />
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <b>{active}</b>
          </div>
          <div className="top-actions">
            <div className="secure">
              <Icon name="shield" size={15} /> Local-first session
            </div>
            <button
              className="help-button float-companion-button"
              onClick={() => {
                if (window.orchestraDesktop) {
                  window.orchestraDesktop.showFloatingHead();
                } else {
                  setNotice(
                    "The floating copilot is available in the Windows desktop app.",
                  );
                }
              }}
              title="Minimize to floating robot head · Ctrl+1 opens chat"
            >
              <RobotHead
                size={18}
                state="happy"
                color="#394d98"
                trimColor="#879ad4"
                interactive={false}
              />
              <span>Float copilot</span>
            </button>
            <button className="help-button" onClick={() => setSetup(true)}>
              Bridge setup <Icon name="arrow" size={15} />
            </button>
          </div>
        </header>
        <div className="content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-dot" /> MULTI-AGENT WORKSPACE
              </div>
              <h1>
                {active === "Overview"
                  ? "Your work, in concert."
                  : active === "Agents"
                    ? "Meet your agents."
                    : `${active} workspace.`}
              </h1>
              <p>
                One coordinator. Focused specialists. Your desktop stays yours.
              </p>
            </div>
            <div className="welcome-actions">
              <button className="button quiet" onClick={invite}>
                <Icon name="plus" size={16} /> Add agent
              </button>
              <button className="button primary" onClick={() => setSetup(true)}>
                <Icon name="plug" size={16} /> Connect Hermes
              </button>
            </div>
          </section>
          {active === "Brain" ? (
            <BrainWorkspace
              model={model}
              onModelChange={setModel}
              models={models}
              ollamaModels={ollamaModels}
              onLoadModels={() => void loadModels()}
              onLoadOllamaModels={() => void loadOllamaModels()}
              onUseIdea={(idea) => {
                setDraft(idea);
                setActive("Overview");
                setNotice(
                  "Idea prepared in the task composer. Review it and send when ready.",
                );
              }}
              onNotice={setNotice}
            />
          ) : (
            <>
              <section className="metrics">
                <div className="metric">
                  <span>AGENTS IN ORCHESTRA</span>
                  <b>
                    {String(agents.length).padStart(2, "0")}
                    <small> ready to assign</small>
                  </b>
                  <span className="metric-note">
                    <span className="status-dot" /> Coordinator + specialists
                  </span>
                </div>
                <div className="metric">
                  <span>DESKTOP CONNECTION</span>
                  <b className="metric-offline">Not connected</b>
                  <span className="metric-note">
                    No desktop actions are enabled
                  </span>
                </div>
                <div className="metric">
                  <span>MODEL ROUTING</span>
                  <b className="model-badge">
                    <span className="router-mark">◈</span> OpenRouter{" "}
                    <small>free catalogue</small>
                  </b>
                  <span className="metric-note">Selected · {model}</span>
                </div>
                <div
                  className="metric metric-link"
                  onClick={() => go("Skills")}
                  role="button"
                  tabIndex={0}
                >
                  <span>SKILLS AVAILABLE</span>
                  <b>
                    04<small> configured</small>
                  </b>
                  <span className="metric-note">
                    Research · Code · Review · Desktop
                  </span>
                </div>
              </section>
              <div className="dashboard-grid">
                <section className="panel orchestra-panel">
                  <div className="panel-head">
                    <div>
                      <div className="panel-kicker">THE TEAM</div>
                      <h2>
                        Agent orchestra{" "}
                        <span className="count-pill">{agents.length}</span>
                      </h2>
                    </div>
                    <button
                      className="icon-button"
                      title="Add agent"
                      onClick={invite}
                    >
                      <Icon name="plus" />
                    </button>
                  </div>
                  <div className="agent-list">
                    {agents.map((a, i) => (
                      <button
                        key={a.id}
                        className={`agent-card ${selected === a.id ? "chosen" : ""}`}
                        onClick={() => setSelected(a.id)}
                      >
                        <div
                          className="robot-wrap"
                          style={{
                            background: `radial-gradient(ellipse at 50% 86%,${a.color}35,transparent 66%)`,
                          }}
                        >
                          <RobotHead
                            size={72}
                            state={a.state}
                            color={a.color}
                            trimColor={a.trim}
                            interactive
                            seed={i / 7}
                          />
                          <span
                            className={`robot-status ${a.state === "working" || a.state === "thinking" ? "status-active" : ""}`}
                          />
                        </div>
                        <div className="agent-meta">
                          <div className="agent-name">
                            {a.name}
                            {a.id === "hermes" && (
                              <span className="lead-tag">LEAD</span>
                            )}
                          </div>
                          <div className="agent-role">{a.role}</div>
                          <div className="agent-activity">
                            <span
                              className={`activity-dot ${a.state === "working" || a.state === "thinking" ? "pulse" : ""}`}
                            />
                            {a.activity}
                          </div>
                        </div>
                        <div className="agent-model">{a.model}</div>
                        <Icon name="more" size={17} />
                      </button>
                    ))}
                  </div>
                  <button className="add-agent-line" onClick={invite}>
                    <Icon name="plus" size={16} /> Add a specialist to the
                    orchestra
                  </button>
                </section>
                <section className="panel activity-panel">
                  <div className="panel-head">
                    <div>
                      <div className="panel-kicker">
                        LIVE FEED <span className="live-dot" />
                      </div>
                      <h2>Orchestra activity</h2>
                    </div>
                    <button
                      className="text-action"
                      onClick={() => setMessages(initialMessages)}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="activity-stream">
                    {messages.map((m, i) => (
                      <div
                        key={`${i}-${m.time}`}
                        className={`activity-item ${m.kind ?? ""}`}
                      >
                        <div
                          className={`activity-avatar ${m.who === "You" ? "user-avatar" : m.kind === "system" ? "system-avatar" : ""}`}
                        >
                          {m.who === "Hermes" ? (
                            <RobotHead
                              size={30}
                              state="speaking"
                              color="#394d98"
                              trimColor="#879ad4"
                              interactive={false}
                            />
                          ) : m.who === "You" ? (
                            "Y"
                          ) : m.who === "Orchestra" ? (
                            <Icon name="spark" size={14} />
                          ) : (
                            "!"
                          )}
                        </div>
                        <div className="activity-body">
                          <div className="activity-title">
                            <b>{m.who}</b>
                            <time>{m.time}</time>
                          </div>
                          <p>{m.text}</p>
                        </div>
                      </div>
                    ))}
                    {running && (
                      <div className="typing">
                        <span />
                        <span />
                        <span /> Hermes is routing this task
                      </div>
                    )}
                  </div>
                  <div className="chat-compose">
                    <div className="compose-hint">
                      <Icon name="spark" size={14} /> Assign a task to Hermes{" "}
                      {browserContext && (
                        <span
                          className="context-ready"
                          title={browserContext.url}
                        >
                          Tab ready
                        </span>
                      )}
                      <button
                        className="browser-context-button"
                        onClick={() => void importBrowserContext()}
                      >
                        ＋ Use current tab
                      </button>
                    </div>
                    {browserContext && (
                      <div className="browser-context-preview">
                        <span>
                          Tab attached ·{" "}
                          {browserContext.title || browserContext.url}
                        </span>
                        <button
                          onClick={() => setBrowserContext(null)}
                          aria-label="Remove attached browser tab"
                        >
                          ×
                        </button>
                      </div>
                    )}
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      placeholder="Describe what you want done on your desktop…"
                      rows={2}
                    />
                    <div className="compose-bottom">
                      <div className="route-picker">
                        <span className="router-mark">◈</span>
                        <span>Hermes</span>
                        <span className="compose-divider" />
                        <span>{model}</span>
                        <span className="chevron">⌄</span>
                      </div>
                      <button
                        className="send-button"
                        onClick={() => void send()}
                        disabled={!draft.trim() || running}
                        aria-label="Send task"
                      >
                        <Icon name="send" size={17} />
                      </button>
                    </div>
                  </div>
                </section>
              </div>
              <div className="lower-grid">
                <section className="panel connection-panel">
                  <div className="panel-head">
                    <div>
                      <div className="panel-kicker">INTEGRATIONS</div>
                      <h2>Connections</h2>
                    </div>
                    <button
                      className="text-action"
                      onClick={() => go("Connections")}
                    >
                      Manage <Icon name="arrow" size={14} />
                    </button>
                  </div>
                  <div className="connection-row">
                    <span className="connection-icon hermes-icon">
                      <RobotHead
                        size={30}
                        state="idle"
                        color="#394d98"
                        trimColor="#879ad4"
                        interactive={false}
                      />
                    </span>
                    <span className="connection-name">
                      <b>Hermes Agent</b>
                      <small>Local HTTP bridge · desktop delegate</small>
                    </span>
                    <span className="connection-state disconnected">
                      Not linked
                    </span>
                    <button
                      className="outline-button"
                      onClick={() => setSetup(true)}
                    >
                      Set up
                    </button>
                  </div>
                  <div className="connection-row">
                    <span className="connection-icon openrouter-icon">◈</span>
                    <span className="connection-name">
                      <b>OpenRouter</b>
                      <small>Free model discovery & routing</small>
                    </span>
                    <span className="connection-state ready">
                      <i /> Ready to configure
                    </span>
                    <button
                      className="outline-button"
                      onClick={() => setSetup(true)}
                    >
                      Connect
                    </button>
                  </div>
                  <div className="connection-row">
                    <span className="connection-icon github-icon">
                      <Icon name="github" size={19} />
                    </span>
                    <span className="connection-name">
                      <b>GitHub delegates</b>
                      <small>Repo context · Jev tools and skills</small>
                    </span>
                    <span className="connection-state ready">
                      <i /> Browse
                    </span>
                    <button
                      className="outline-button"
                      onClick={() => go("GitHub")}
                    >
                      Explore
                    </button>
                  </div>
                </section>
                <section className="panel skills-panel">
                  <div className="panel-head">
                    <div>
                      <div className="panel-kicker">CAPABILITIES</div>
                      <h2>Agent skills</h2>
                    </div>
                    <button
                      className="text-action"
                      onClick={() => go("Skills")}
                    >
                      Browse <Icon name="arrow" size={14} />
                    </button>
                  </div>
                  <div className="skill-chips">
                    <button
                      className="skill-chip"
                      onClick={() =>
                        setNotice("Research skill selected for delegation.")
                      }
                    >
                      <span>⌕</span>
                      <b>Research</b>
                      <small>Scout</small>
                    </button>
                    <button
                      className="skill-chip"
                      onClick={() =>
                        setNotice("Code skill selected for delegation.")
                      }
                    >
                      <span>⌘</span>
                      <b>Code</b>
                      <small>Builder</small>
                    </button>
                    <button
                      className="skill-chip"
                      onClick={() =>
                        setNotice("Review skill selected for delegation.")
                      }
                    >
                      <span>◉</span>
                      <b>Review</b>
                      <small>Reviewer</small>
                    </button>
                    <button
                      className="skill-chip"
                      onClick={() =>
                        setNotice("Desktop skill requires the Hermes bridge.")
                      }
                    >
                      <span>▣</span>
                      <b>Desktop</b>
                      <small>Hermes</small>
                    </button>
                  </div>
                  <div className="skill-foot">
                    <Icon name="shield" size={14} /> Specialist skills are
                    invoked through your bridge.
                  </div>
                </section>
              </div>
              <section className="panel jev-panel">
                <div className="jev-symbol">J</div>
                <div className="jev-copy">
                  <div className="panel-kicker">
                    TYPED DECISION ROUTER{" "}
                    <span className="beta-tag">OPTIONAL</span>
                  </div>
                  <h2>Jev helps choose the next step.</h2>
                  <p>
                    Use Jev for constrained classification or routing; keep
                    Hermes and language models responsible for planning and
                    free-form work.
                  </p>
                  <a
                    href="https://github.com/topics/jev-ai"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Explore Jev AI on GitHub <Icon name="arrow" size={14} />
                  </a>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={jevMode}
                    onChange={(e) => setJevMode(e.target.checked)}
                  />
                  <span />
                  <b>{jevMode ? "On" : "Off"}</b>
                </label>
              </section>
              <footer className="footer">
                <span>
                  ROBOT HEADS <span className="footer-sep">/</span> ORCHESTRA
                </span>
                <span>
                  <Icon name="shield" size={13} /> Actions run only through a
                  bridge you configure.
                </span>
                <a
                  href="https://github.com/EdgeAgent/robot-orchestra"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open-source project <Icon name="arrow" size={13} />
                </a>
              </footer>
            </>
          )}
        </div>
      </main>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
      {setup && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSetup(false);
          }}
        >
          <section className="setup-modal">
            <button className="modal-close" onClick={() => setSetup(false)}>
              ×
            </button>
            <div className="modal-brand">
              <RobotHead
                size={60}
                state="listening"
                color="#394d98"
                trimColor="#879ad4"
                interactive={false}
              />
            </div>
            <div className="eyebrow">
              <span className="eyebrow-dot" /> PRIVATE BY DESIGN
            </div>
            <h2>Connect your control room</h2>
            <p className="modal-intro">
              Connect the local Hermes adapter. The Chrome/Edge companion shares
              a tab only after you click its action.
            </p>
            <label className="field-label">HERMES BRIDGE URL</label>
            <div className="field-row">
              <input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="http://127.0.0.1:8787"
              />
              <button
                className="outline-button"
                onClick={() => void testBridge()}
              >
                Test
              </button>
            </div>
            <div className="field-help">
              Hermes URL must resolve to this computer. Desktop API:{" "}
              <code>GET /health</code>, <code>POST /v1/orchestra/tasks</code>.
            </div>
            <label className="field-label">
              OPENROUTER API KEY <span>optional</span>
            </label>
            <input
              type="password"
              value={modelKey}
              onChange={(e) => setModelKey(e.target.value)}
              placeholder="Paste key for this tab only"
              autoComplete="off"
            />
            <div className="field-help">
              Kept in tab memory only; not saved by this app. Free-model
              availability and provider limits can change.{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
              >
                OpenRouter keys
              </a>
              .
            </div>
            <label className="field-label">
              JEV API KEY{" "}
              <span>optional · needed only when Jev routing is on</span>
            </label>
            <input
              type="password"
              value={jevKey}
              onChange={(e) => setJevKey(e.target.value)}
              placeholder="sk_… · memory only"
              autoComplete="off"
            />
            <div className="field-help">
              Separate from OpenRouter. The task text and candidate names are
              sent to Jev for routing; page context is not. Create a key at{" "}
              <a
                href="https://thejevai.com/settings/apikeys"
                target="_blank"
                rel="noreferrer"
              >
                Jev AI
              </a>
              . English (en-US) is the default Jev guidance language.
            </div>
            <label className="field-label">TASK MODEL</label>
            <div className="field-row">
              <select value={model} onChange={(e) => void selectDashboardModel(e.target.value)}>
                <option value="openrouter/free">openrouter/free · automatic free routing</option>
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
                <optgroup label="Other local Ollama models">
                  {otherLocalModels.map((id) => <option key={id} value={id}>{id}</option>)}
                </optgroup>
                {!new Set(["openrouter/free", ...models, ...ollamaModels]).has(model) && (
                  <option value={model}>{model} · saved choice (refresh provider list)</option>
                )}
              </select>
              <button
                className="outline-button"
                onClick={() => void loadModels()}
              >
                Load OpenRouter free
              </button>
            </div>
            <div className="field-row">
              <button className="outline-button" onClick={() => void loadOllamaModels()}>
                Detect local Ollama
              </button>
            </div>
            <div className="field-help">
              Ollama choices run directly on this PC and do not delegate to Hermes. OpenRouter free choices use Hermes orchestration; provider availability and limits vary.
            </div>
            <label className="field-label">
              GITHUB REPOSITORY CONTEXT <span>optional</span>
            </label>
            <input
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="owner/repository"
            />
            <div className="field-help">
              Jev AI topic:{" "}
              <a
                href="https://github.com/topics/jev-ai"
                target="_blank"
                rel="noreferrer"
              >
                GitHub projects
              </a>{" "}
              · Jev is a typed-decision/routing layer, not a general-purpose
              language model.
            </div>
            <div className="modal-note">
              <Icon name="shield" size={16} />
              <span>
                Desktop API stays on loopback. Hermes must enforce approvals and
                tool permissions. Browser context is shared only on an explicit
                extension click. Do not expose the local service publicly.
              </span>
            </div>
            <button
              className="button primary modal-save"
              onClick={() => {
                sessionStorage.setItem("orchestra-hermes-url", endpoint);
                setSetup(false);
                setNotice(
                  "Settings saved in this tab. Test your local Hermes adapter before sending a task.",
                );
              }}
            >
              Save for this tab <Icon name="arrow" size={15} />
            </button>
          </section>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {picked.name} selected
      </span>
    </div>
  );
}

type CompanionDelegate = { id: string; status: string };
type CompanionMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  time: string;
  delegates?: CompanionDelegate[];
  source?: string;
};
type SharedBrowserTab = { title: string; url: string; selectedText: string };

function CompanionApp() {
  const [expanded, setExpanded] = useState(
    () => new URLSearchParams(window.location.search).get("chat") === "1",
  );
  const [section, setSection] = useState<CompanionSection>("chat");
  const [messages, setMessages] = useState<CompanionMessage[]>([]);
  const [brain, setBrain] = useState<BrainState>(emptyBrainState);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [includeTab, setIncludeTab] = useState(false);
  const [includeKnowledge, setIncludeKnowledge] = useState(false);
  const [knowledgeCount, setKnowledgeCount] = useState(0);
  const [freeModels, setFreeModels] = useState<string[]>([]);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [modelNotice, setModelNotice] = useState("");
  const [modelCatalogBusy, setModelCatalogBusy] = useState<"free" | "ollama" | null>(null);
  const [sharedTab, setSharedTab] = useState<SharedBrowserTab | null>(null);
  const [error, setError] = useState("");
  const openRouterModels = freeModels.filter((id) => id !== "openrouter/free");
  const freeLlamaModels = openRouterModels.filter(isLlamaModel);
  const otherFreeModels = openRouterModels.filter((id) => !isLlamaModel(id));
  const localLlamaModels = ollamaModels.filter(isLlamaModel);
  const otherLocalModels = ollamaModels.filter((id) => !isLlamaModel(id));
  const feedRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; screenX: number; screenY: number; moved: boolean; captureTarget: HTMLElement } | null>(null);
  const suppressDragClickRef = useRef(false);

  const beginCompanionDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest(".companion-window-actions")) return;
    const captureTarget = (target.closest("button") as HTMLElement | null) ?? event.currentTarget;
    dragRef.current = {
      pointerId: event.pointerId,
      screenX: event.screenX,
      screenY: event.screenY,
      moved: false,
      captureTarget,
    };
    try { captureTarget.setPointerCapture(event.pointerId); } catch {}
    window.orchestraDesktop?.beginCompanionDrag(event.screenX, event.screenY);
  };
  const moveCompanionDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.screenX - drag.screenX, event.screenY - drag.screenY) > 4)
      drag.moved = true;
    if (drag.moved)
      window.orchestraDesktop?.moveCompanionDrag(event.screenX, event.screenY);
  };
  const endCompanionDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    try { drag.captureTarget.releasePointerCapture(event.pointerId); } catch {}
    window.orchestraDesktop?.endCompanionDrag();
    dragRef.current = null;
    if (drag.moved) {
      suppressDragClickRef.current = true;
      window.setTimeout(() => { suppressDragClickRef.current = false; }, 250);
    }
  };

  useEffect(() => {
    document.documentElement.classList.add("companion-window-mode");
    return () =>
      document.documentElement.classList.remove("companion-window-mode");
  }, []);

  const refresh = async () => {
    try {
      const [chat, tab, brainResponse, knowledgeResponse] = await Promise.all([
        fetch("/api/companion/messages"),
        fetch("/api/browser/context"),
        fetch("/api/brain/state", { cache: "no-store" }),
        fetch("/api/knowledge", { cache: "no-store" }),
      ]);
      if (chat.ok) {
        const body = await chat.json();
        setMessages(body.messages ?? []);
      }
      if (tab.ok) {
        const body = await tab.json();
        setSharedTab(body.context ?? null);
      }
      if (brainResponse.ok)
        setBrain((await brainResponse.json()) as BrainState);
      if (knowledgeResponse.ok) setKnowledgeCount(((await knowledgeResponse.json()).documents ?? []).length);
    } catch {
      setError("The desktop bridge is starting. Try again in a moment.");
    }
  };

  useEffect(() => {
    const unsubscribe = window.orchestraDesktop?.onCompanionState((state) => {
      setExpanded(Boolean(state.expanded));
    });
    void refresh();
    const poll = window.setInterval(() => void refresh(), 1400);
    return () => {
      window.clearInterval(poll);
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (expanded && feedRef.current)
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [expanded, messages, busy]);

  const openChat = () => {
    setExpanded(true);
    window.orchestraDesktop?.openChat();
  };
  const collapseToHead = () => {
    setExpanded(false);
    window.orchestraDesktop?.showFloatingHead();
  };
  const openDashboard = () => window.orchestraDesktop?.openDashboard();
  const saveBrain = async (next: BrainState) => {
    setBrain(next);
    try {
      const response = await fetch("/api/brain/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (response.ok)
        setBrain(((await response.json()).state as BrainState) ?? next);
      else setError("The Brain state could not be saved.");
    } catch {
      setError("The desktop Brain service is unavailable.");
    }
  };
  const useBrainIdea = (idea: string) => {
    setDraft(idea);
    setSection("chat");
  };
  const refreshFreeModels = async () => {
    setModelCatalogBusy("free");
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models");
      if (!response.ok) throw new Error("OpenRouter's model catalogue is unavailable.");
      const data = await response.json();
      const found = (data.data ?? [])
        .filter((entry: { pricing?: { prompt?: string; completion?: string } }) => Number(entry.pricing?.prompt) === 0 && Number(entry.pricing?.completion) === 0)
        .map((entry: { id: string }) => entry.id);
      setFreeModels(found);
      const llamaCount = found.filter(isLlamaModel).length;
      setModelNotice(`Loaded ${found.length} zero-price OpenRouter model IDs.${llamaCount ? ` ${llamaCount} Llama choice${llamaCount === 1 ? " is" : "s are"} available.` : " No Llama model is currently listed at zero price; use a detected local Ollama Llama instead."} Provider limits vary.`);
    } catch (reason) {
      setModelNotice(reason instanceof Error ? reason.message : "Could not load OpenRouter free models.");
    } finally { setModelCatalogBusy(null); }
  };
  const refreshOllamaModels = async () => {
    setModelCatalogBusy("ollama");
    try {
      const response = await fetch("/api/ollama/models", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ollama is unavailable.");
      const found = (data.models ?? []) as string[];
      setOllamaModels(found);
      setModelNotice(found.length
        ? `Found ${found.length} local Ollama model${found.length === 1 ? "" : "s"}. Local tasks are not delegated to Hermes.`
        : "Ollama is running, but there are no installed local models yet.");
    } catch (reason) {
      setOllamaModels([]);
      setModelNotice(reason instanceof Error ? reason.message : "Could not reach Ollama at 127.0.0.1:11434.");
    } finally { setModelCatalogBusy(null); }
  };
  const changeSelectedModel = (value: string) => {
    localStorage.setItem("orchestra-model", value);
    void saveBrain({ ...brain, settings: { ...brain.settings, model: value } });
  };

  const sendTask = async () => {
    const task = draft.trim();
    if (!task || busy) return;
    setDraft("");
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/companion/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, includeBrowserContext: includeTab, includeKnowledge }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "The task could not be sent.");
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : brain.settings.model.startsWith("ollama:")
            ? "Could not reach local Ollama."
            : "Could not reach the selected model service.",
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const sendVoiceTask = async (task: string): Promise<string> => {
    const spokenTask = task.trim().slice(0, 8000);
    if (!spokenTask || busy) throw new Error("There is no new voice task to send.");
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/companion/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: spokenTask,
          includeBrowserContext: includeTab,
          includeKnowledge,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The selected model could not accept the spoken task.");
      await refresh();
      return String(body.message?.text || "The selected model returned a response.").slice(0, 5000);
    } catch (reason) {
      const message = reason instanceof Error
        ? reason.message
        : brain.settings.model.startsWith("ollama:")
          ? "Could not reach local Ollama."
          : "Could not reach the selected model service.";
      setError(message);
      await refresh();
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  };
  const saveSharedTab = async () => {
    if (!sharedTab) return;
    try {
      const response = await fetch("/api/knowledge/save-shared-tab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sharedTab, explicitConsent: true }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save this page.");
      setKnowledgeCount((body.documents ?? []).length);
      setError("Shared page saved to local Knowledge on this PC.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the shared page."); }
  };

  if (!expanded) {
    return (
      <main className="companion-shell companion-collapsed">
        <button
          className="companion-orb"
          onPointerDown={beginCompanionDrag}
          onPointerMove={moveCompanionDrag}
          onPointerUp={endCompanionDrag}
          onPointerCancel={endCompanionDrag}
          onClick={() => {
            if (suppressDragClickRef.current) {
              suppressDragClickRef.current = false;
              return;
            }
            openChat();
          }}
          aria-label="Open Robot Orchestra copilot chat"
          title="Drag to move · click or Ctrl+1 to chat"
        >
          <RobotHead
            size={82}
            state={busy ? "thinking" : "idle"}
            color="#394d98"
            trimColor="#a99fff"
            interactive
            seed={0.17}
          />
          <span className="companion-orb-halo" />
          <span className="companion-orb-light" />
          {brain.ideas.filter((idea) => idea.status === "new").length > 0 && (
            <span
              className="companion-orb-count"
              aria-label={`${brain.ideas.filter((idea) => idea.status === "new").length} new ideas`}
            >
              {Math.min(
                9,
                brain.ideas.filter((idea) => idea.status === "new").length,
              )}
            </span>
          )}
        </button>
      </main>
    );
  }

  return (
    <main className="companion-shell companion-expanded">
      <section
        className="companion-window"
        aria-label="Robot Orchestra copilot chat"
      >
        <header
          className="companion-titlebar"
          onPointerDown={beginCompanionDrag}
          onPointerMove={moveCompanionDrag}
          onPointerUp={endCompanionDrag}
          onPointerCancel={endCompanionDrag}
          title="Drag to move the copilot"
        >
          <button
            className="companion-brand"
            onClick={collapseToHead}
            title="Minimize to floating robot head"
          >
            <RobotHead
              size={38}
              state={busy ? "thinking" : "listening"}
              color="#394d98"
              trimColor="#a99fff"
              interactive={false}
            />
            <span>
              <b>ORCHESTRA</b>
              <small>
                {brain.settings.model.startsWith("ollama:") ? "Local Ollama · direct" : "Hermes copilot · agents"} <i /> Ctrl+1
              </small>
            </span>
          </button>
          <div className="companion-window-actions">
            <button
              onClick={collapseToHead}
              title="Minimize to robot head"
              aria-label="Minimize to robot head"
            >
              −
            </button>
            <button
              onClick={openDashboard}
              title="Open full dashboard"
              aria-label="Open full dashboard"
            >
              ↗
            </button>
          </div>
        </header>

        <div className="companion-teamline">
          <span className={`companion-status-dot ${busy ? "is-busy" : ""}`} />
          {brain.settings.model.startsWith("ollama:") ? (
            <><span>OLLAMA · LOCAL</span><b>direct response · no delegates</b></>
          ) : (
            <><span>HERMES</span><b>coordinates</b><span className="companion-team-sep">·</span><span>SCOUT</span><span>BUILDER</span><span>REVIEWER</span></>
          )}
        </div>
        <CompanionNav
          active={section}
          onSelect={setSection}
          taskCount={brain.feed.filter((item) => item.kind === "task").length}
        />
        {section === "chat" ? (
          <>
            <div className="companion-model-control">
              <label>
                <span>MODEL</span>
                <select value={brain.settings.model} onChange={(event) => changeSelectedModel(event.target.value)} aria-label="Select task model">
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
                  {!new Set(["openrouter/free", ...freeModels, ...ollamaModels]).has(brain.settings.model) && (
                    <option value={brain.settings.model}>{brain.settings.model} · saved choice (refresh list)</option>
                  )}
                </select>
              </label>
              <button type="button" onClick={() => void refreshFreeModels()} disabled={modelCatalogBusy !== null} title="Load zero-price OpenRouter model IDs" aria-label="Load free OpenRouter models">{modelCatalogBusy === "free" ? "…" : "Free"}</button>
              <button type="button" onClick={() => void refreshOllamaModels()} disabled={modelCatalogBusy !== null} title="Find installed Ollama models on this PC" aria-label="Find local Ollama models">{modelCatalogBusy === "ollama" ? "…" : "Local"}</button>
            </div>
            <div className="companion-model-route-note">
              {brain.settings.model.startsWith("ollama:")
                ? "Direct local inference. Prompts stay on this PC; Hermes sub-agents are not used."
                : `Hermes will coordinate tasks using ${brain.settings.model || "openrouter/free"}. Free provider limits vary.`}
            </div>
            {modelNotice && <div className="companion-model-notice" role="status">{modelNotice}</div>}
            {brain.nextMove && <button className="companion-inline-next" onClick={() => setDraft(brain.nextMove)}><span>NEXT MOVE</span><b>{brain.nextMove}</b><small>Tap to use in chat · suggestion only</small></button>}
            <div className="companion-feed" ref={feedRef} aria-live="polite">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`companion-message message-${message.role}`}
                >
                  <div className="companion-message-label">
                    <b>
                      {message.role === "user"
                        ? "YOU"
                        : message.role === "system"
                          ? "ORCHESTRA"
                          : message.source === "ollama" ? "OLLAMA · LOCAL" : "HERMES"}
                    </b>
                    <time>
                      {new Date(message.time).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <p>{message.text}</p>
                  {message.delegates?.length ? (
                    <div className="companion-delegates">
                      {message.delegates.map((delegate) => (
                        <span
                          key={delegate.id}
                          className={
                            delegate.status === "done" ? "delegate-done" : ""
                          }
                        >
                          <i /> {delegate.id} · {delegate.status}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
              {busy && (
                <div className="companion-thinking">
                  <i />
                  <i />
                  <i /> {brain.settings.model.startsWith("ollama:") ? "Local Ollama is thinking…" : "Hermes is handing this to your specialists…"}
                </div>
              )}
            </div>

            {(sharedTab || knowledgeCount > 0) && (
              <div className="companion-context-toggles">
              {sharedTab && <label className="companion-context-toggle">
                <input
                  type="checkbox"
                  checked={includeTab}
                  onChange={(event) => setIncludeTab(event.target.checked)}
                />
                <span>Include shared tab</span>
                <small title={sharedTab.url}>
                  {sharedTab.title || new URL(sharedTab.url).hostname}
                </small>
              </label>}
              {sharedTab && <button type="button" className="companion-save-page" onClick={() => void saveSharedTab()}>Save shared page to Brain</button>}
              {knowledgeCount > 0 && <label className="companion-context-toggle"><input type="checkbox" checked={includeKnowledge} onChange={(event) => setIncludeKnowledge(event.target.checked)} /><span>Use local Knowledge</span><small>{knowledgeCount} source{knowledgeCount === 1 ? "" : "s"} · on this PC</small></label>}
              </div>
            )}

            {error && (
              <div className="companion-error" role="status">
                {error}
              </div>
            )}

            <CompanionVoice
              onSendTask={sendVoiceTask}
              model={brain.settings.model}
              busy={busy}
              includeBrowserContext={includeTab}
              includeKnowledge={includeKnowledge}
            />

            <form
              className="companion-compose"
              onSubmit={(event) => {
                event.preventDefault();
                void sendTask();
              }}
            >
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendTask();
                  }
                }}
                placeholder={brain.settings.model.startsWith("ollama:") ? "Ask your local Ollama model…" : "Ask Hermes to coordinate a task…"}
                aria-label="Message the selected task model"
                rows={2}
              />
              <div className="companion-compose-bottom">
                <span>
                  <Icon name="shield" size={13} />
                  {brain.settings.model.startsWith("ollama:")
                    ? "Direct on this PC · no agents"
                    : "Runs through your local Hermes bridge"}
                </span>
                <button
                  type="submit"
                  disabled={!draft.trim() || busy}
                  aria-label="Send task to selected model"
                >
                  <Icon name="send" size={16} />
                </button>
              </div>
            </form>

            <footer className="companion-foot">
              <span>
                {brain.settings.model.startsWith("ollama:")
                  ? "Local-first · direct model on this PC"
                  : "Local-first · agent actions follow Hermes permissions"}
              </span>
              <button onClick={openDashboard}>Open dashboard</button>
            </footer>
          </>
        ) : (
          <>
            <CompanionPanel
              active={section}
              onSelect={setSection}
              brain={brain}
              onUseIdea={useBrainIdea}
              onSave={saveBrain}
            />
            <footer className="companion-foot">
              <span>Suggestions only · you choose what runs</span>
              <button onClick={openDashboard}>Open dashboard</button>
            </footer>
          </>
        )}
      </section>
    </main>
  );
}

export default function OrchestraApp() {
  const isCompanion =
    new URLSearchParams(window.location.search).get("companion") === "1";
  return isCompanion ? <CompanionApp /> : <DashboardApp />;
}
