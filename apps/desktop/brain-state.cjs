const crypto = require("node:crypto");

const ALLOWED_INTERVALS = new Set([15, 30, 60]);
const MAX_FEED = 80;
const MAX_IDEAS = 30;
const MAX_GOALS = 30;
const MAX_ARTIFACTS = 50;

function text(value, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function id() {
  return crypto.randomUUID();
}
function defaultBrainState() {
  return {
    version: 1,
    settings: {
      proactiveEnabled: true,
      intervalMinutes: 30,
      model: "openrouter/free",
    },
    nextMove: "Set a goal or send a task to your selected model to start the planning feed.",
    lastPulseAt: null,
    pulseStatus: "idle",
    feed: [],
    ideas: [],
    goals: [],
    artifacts: [],
    updatedAt: new Date().toISOString(),
  };
}
function normalizeBrainState(input) {
  const defaults = defaultBrainState();
  const value = input && typeof input === "object" ? input : {};
  const settings =
    value.settings && typeof value.settings === "object" ? value.settings : {};
  const interval = Number(settings.intervalMinutes);
  const state = {
    version: 1,
    settings: {
      proactiveEnabled: settings.proactiveEnabled !== false,
      intervalMinutes: ALLOWED_INTERVALS.has(interval)
        ? interval
        : defaults.settings.intervalMinutes,
      model: /^[a-z0-9._:/@-]{1,180}$/i.test(text(settings.model, 180))
        ? text(settings.model, 180)
        : defaults.settings.model,
    },
    nextMove: text(value.nextMove, 1000),
    lastPulseAt:
      typeof value.lastPulseAt === "string"
        ? value.lastPulseAt.slice(0, 40)
        : null,
    pulseStatus: ["idle", "thinking", "error"].includes(value.pulseStatus)
      ? value.pulseStatus
      : "idle",
    feed: [],
    ideas: [],
    goals: [],
    artifacts: [],
    updatedAt: new Date().toISOString(),
  };
  state.nextMove ||= defaults.nextMove;

  if (Array.isArray(value.feed)) {
    state.feed = value.feed.slice(-MAX_FEED).map((item) => ({
      id: text(item?.id, 80) || id(),
      kind: ["task", "plan", "system", "scan", "artifact"].includes(item?.kind)
        ? item.kind
        : "system",
      title: text(item?.title, 160) || "Activity",
      body: text(item?.body, 1200),
      createdAt:
        typeof item?.createdAt === "string"
          ? item.createdAt.slice(0, 40)
          : new Date().toISOString(),
    }));
  }
  if (Array.isArray(value.ideas)) {
    state.ideas = value.ideas.slice(-MAX_IDEAS).map((item) => ({
      id: text(item?.id, 80) || id(),
      title: text(item?.title, 180) || "Idea",
      body: text(item?.body, 1000),
      status: ["new", "queued", "dismissed", "done"].includes(item?.status)
        ? item.status
        : "new",
      createdAt:
        typeof item?.createdAt === "string"
          ? item.createdAt.slice(0, 40)
          : new Date().toISOString(),
    }));
  }
  if (Array.isArray(value.goals)) {
    state.goals = value.goals.slice(-MAX_GOALS).map((item) => {
      const goal = {
        id: text(item?.id, 80) || id(),
        title: text(item?.title, 180) || "Untitled goal",
        body: text(item?.body, 1000),
        status: ["active", "paused", "done"].includes(item?.status)
          ? item.status
          : "active",
        progress: Math.max(
          0,
          Math.min(
            100,
            Number.isFinite(Number(item?.progress)) ? Number(item.progress) : 0,
          ),
        ),
        createdAt:
          typeof item?.createdAt === "string"
            ? item.createdAt.slice(0, 40)
            : new Date().toISOString(),
      };
      if (Number.isFinite(Number(item?.proposedProgress))) {
        goal.proposedProgress = Math.max(
          0,
          Math.min(100, Number(item.proposedProgress)),
        );
        goal.proposedReason = text(item?.proposedReason, 500);
      }
      return goal;
    });
  }
  if (Array.isArray(value.artifacts)) {
    state.artifacts = value.artifacts.slice(-MAX_ARTIFACTS).map((item) => {
      let url;
      try {
        const candidate = new URL(item?.url);
        if (["http:", "https:"].includes(candidate.protocol))
          url = candidate.href.slice(0, 2000);
      } catch {}
      return {
        id: text(item?.id, 80) || id(),
        name: text(item?.name, 180) || "Artifact",
        body: text(item?.body, 600),
        ...(url ? { url } : {}),
        ...(text(item?.path, 400) ? { path: text(item.path, 400) } : {}),
        createdAt:
          typeof item?.createdAt === "string"
            ? item.createdAt.slice(0, 40)
            : new Date().toISOString(),
      };
    });
  }
  return state;
}
function appendFeed(state, kind, title, body = "") {
  state.feed.push({
    id: id(),
    kind,
    title: text(title, 160) || "Activity",
    body: text(body, 1200),
    createdAt: new Date().toISOString(),
  });
  if (state.feed.length > MAX_FEED)
    state.feed.splice(0, state.feed.length - MAX_FEED);
  state.updatedAt = new Date().toISOString();
}
function parseStructured(payload) {
  for (const candidate of [
    payload?.plan,
    payload?.result,
    payload?.output,
    payload?.message,
  ]) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate))
      return candidate;
    if (typeof candidate === "string") {
      const raw = candidate
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
      try {
        return JSON.parse(raw);
      } catch {}
      const first = raw.indexOf("{");
      const last = raw.lastIndexOf("}");
      if (first >= 0 && last > first) {
        try {
          return JSON.parse(raw.slice(first, last + 1));
        } catch {}
      }
    }
  }
  return null;
}
function applyPlan(state, payload) {
  const plan = parseStructured(payload);
  if (!plan) {
    const summary = text(
      payload?.message || payload?.result || payload?.output,
      1000,
    );
    if (summary) {
      state.nextMove = summary;
      appendFeed(state, "plan", "Brain updated its next move", summary);
    }
    return { structured: false, ideasAdded: 0, proposals: 0 };
  }
  const nextMove = text(plan.nextMove || plan.next_move || plan.summary, 1000);
  if (nextMove) state.nextMove = nextMove;
  let ideasAdded = 0;
  if (Array.isArray(plan.ideas)) {
    for (const entry of plan.ideas.slice(0, 5)) {
      const title = text(typeof entry === "string" ? entry : entry?.title, 180);
      if (!title) continue;
      state.ideas.push({
        id: id(),
        title,
        body: text(
          typeof entry === "string" ? "" : entry?.body || entry?.summary,
          1000,
        ),
        status: "new",
        createdAt: new Date().toISOString(),
      });
      ideasAdded++;
    }
  }
  let proposals = 0;
  if (Array.isArray(plan.goalUpdates)) {
    for (const update of plan.goalUpdates.slice(0, 8)) {
      const goal = state.goals.find(
        (item) => item.id === text(update?.goalId || update?.id, 80),
      );
      if (!goal || !Number.isFinite(Number(update?.progress))) continue;
      goal.proposedProgress = Math.max(
        0,
        Math.min(100, Number(update.progress)),
      );
      goal.proposedReason = text(update.reason, 500);
      proposals++;
    }
  }
  appendFeed(
    state,
    "plan",
    "Brain proposed the next move",
    nextMove || "New ideas are ready to review.",
  );
  if (state.ideas.length > MAX_IDEAS)
    state.ideas.splice(0, state.ideas.length - MAX_IDEAS);
  state.updatedAt = new Date().toISOString();
  return { structured: true, ideasAdded, proposals };
}
function addArtifacts(state, payload) {
  const candidates =
    [
      payload?.artifacts,
      payload?.result?.artifacts,
      payload?.output?.artifacts,
    ].find(Array.isArray) || [];
  let count = 0;
  for (const item of candidates.slice(0, 12)) {
    const name = text(
      typeof item === "string" ? item : item?.name || item?.title,
      180,
    );
    if (!name) continue;
    const normalized = normalizeBrainState({
      artifacts: [{ ...((typeof item === "object" && item) || {}), name }],
    }).artifacts[0];
    state.artifacts.push(normalized);
    count++;
  }
  if (state.artifacts.length > MAX_ARTIFACTS)
    state.artifacts.splice(0, state.artifacts.length - MAX_ARTIFACTS);
  return count;
}
function planningPrompt(state) {
  const recent = state.feed
    .slice(-12)
    .map(({ kind, title, body, createdAt }) => ({
      kind,
      title,
      body,
      createdAt,
    }));
  const goals = state.goals
    .filter((goal) => goal.status === "active")
    .slice(0, 20)
    .map(({ id, title, body, progress }) => ({ id, title, body, progress }));
  const ideas = state.ideas
    .filter((idea) => idea.status === "new" || idea.status === "queued")
    .slice(-8)
    .map(({ title, body }) => ({ title, body }));
  const artifacts = state.artifacts
    .slice(-12)
    .map(({ name, body, url, path, createdAt }) => ({
      name,
      body,
      url,
      path,
      createdAt,
    }));
  return [
    "PLANNING-ONLY REQUEST. Do not execute tasks, call tools, browse, read files, delegate, change goals, publish, or create artifacts. Return suggestions only; a human must approve any next task.",
    "Review only the supplied summaries. Never claim an artifact exists unless it is in the supplied artifact list. Do not expose private chain-of-thought; return brief user-facing reasons.",
    'Return one JSON object and no markdown with this shape: {"summary": string, "nextMove": string, "ideas": [{"title": string, "body": string}], "goalUpdates": [{"goalId": string, "progress": number, "reason": string}]}. Keep at most 3 ideas. Do not invent goal IDs. If there is not enough information, set nextMove to a short question for the user.',
    JSON.stringify({
      goals,
      recentActivity: recent,
      existingIdeas: ideas,
      knownArtifacts: artifacts,
    }).slice(0, 16000),
  ].join("\n\n");
}

module.exports = {
  defaultBrainState,
  normalizeBrainState,
  appendFeed,
  parseStructured,
  applyPlan,
  addArtifacts,
  planningPrompt,
};
