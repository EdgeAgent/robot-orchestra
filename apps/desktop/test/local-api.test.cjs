const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const port = 43877;
const hermesPort = 43878;
const userData = path.join(os.tmpdir(), `robot-orchestra-test-${process.pid}`);
fs.rmSync(userData, { recursive: true, force: true });
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(path.join(userData, "knowledge-store.json"), JSON.stringify({ version: 1, documents: [{ id: "knowledge-test", name: "Operations handbook", kind: "txt", sourceLabel: "Operations handbook", importedAt: new Date().toISOString(), text: "A qualified pipeline uses scout review before the quarterly launch." }] }));
process.env.ORCHESTRA_PORT = String(port);
let selectedJevDelegate = "builder";
let selectedJevModel = "openrouter/free";
const hermesTasks = [];
const jevRequests = [];
const ollamaRequests = [];

const hermes = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end('{"ok":true}');
  }
  if (req.method === "POST" && req.url === "/v1/orchestra/tasks") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    hermesTasks.push({
      body,
      authorization: req.headers.authorization,
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    if (body.source === "robot-heads-brain-pulse") {
      return res.end(
        JSON.stringify({
          result: {
            nextMove: "Review the proposed milestone with the user.",
            ideas: [
              {
                title: "Draft a milestone checklist",
                body: "Break the goal into three reviewable steps.",
              },
            ],
            goalUpdates: [
              {
                goalId: "goal-test",
                progress: 40,
                reason: "The latest feed shows initial research is complete.",
              },
            ],
          },
        }),
      );
    }
    return res.end(
      JSON.stringify({
        message: "Mock Hermes accepted task",
        delegates: [{ id: "builder", status: "working" }],
        artifacts: [
          { name: "review-notes.md", path: "C:/workspace/review-notes.md" },
        ],
      }),
    );
  }
  res.writeHead(404).end();
});

const app = Object.assign(new EventEmitter(), {
  isPackaged: false,
  getVersion: () => "0.1.0-test",
  getPath: () => userData,
  whenReady: () => Promise.resolve(),
});
class MockWindow {
  static instances = [];
  constructor(options = {}) {
    this.options = options;
    this.bounds = { x: options.x || 0, y: options.y || 0, width: options.width || 0, height: options.height || 0 };
    this.visible = options.show !== false;
    this.destroyed = false;
    this.webContents = Object.assign(new EventEmitter(), {
      setWindowOpenHandler() {},
      send() {},
    });
    MockWindow.instances.push(this);
  }
  loadURL(url) {
    this.url = url;
  }
  isDestroyed() {
    return this.destroyed;
  }
  isVisible() {
    return this.visible;
  }
  show() {
    this.visible = true;
  }
  showInactive() {
    this.visible = true;
  }
  hide() {
    this.visible = false;
  }
  focus() {}
  setBounds(bounds) {
    this.bounds = bounds;
  }
  getBounds() {
    return this.bounds;
  }
  setAlwaysOnTop() {}
  setVisibleOnAllWorkspaces() {}
  close() {
    this.destroyed = true;
    this.emit("closed");
  }
  on(event, listener) {
    if (!this.listeners) this.listeners = new EventEmitter();
    this.listeners.on(event, listener);
    return this;
  }
  emit(event, ...args) {
    return this.listeners?.emit(event, ...args) ?? false;
  }
  static getAllWindows() {
    return MockWindow.instances.filter((window) => !window.destroyed);
  }
}
class MockTray extends EventEmitter {
  constructor(icon) {
    super();
    this.icon = icon;
  }
  setToolTip() {}
  setContextMenu(menu) {
    this.menu = menu;
  }
}
const hotkeys = new Map();
let mediaPermissionCheckHandler;
let mediaPermissionRequestHandler;
const mockElectron = {
  app,
  BrowserWindow: MockWindow,
  Tray: MockTray,
  Menu: { buildFromTemplate: (items) => items },
  globalShortcut: {
    register: (accelerator, callback) => {
      hotkeys.set(accelerator, callback);
      return true;
    },
    unregisterAll: () => hotkeys.clear(),
  },
  nativeImage: {
    createFromPath: (file) => ({ file }),
    createEmpty: () => ({}),
  },
  screen: {
    getPrimaryDisplay: () => ({
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
    }),
    getDisplayMatching: () => ({
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
    }),
  },
  ipcMain: new EventEmitter(),
  session: {
    defaultSession: {
      setPermissionCheckHandler: (handler) => { mediaPermissionCheckHandler = handler; },
      setPermissionRequestHandler: (handler) => { mediaPermissionRequestHandler = handler; },
    },
  },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  shell: { openExternal() {} },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return mockElectron;
  return originalLoad.call(this, request, parent, isMain);
};
const originalFetch = global.fetch;
global.fetch = async (input, init) => {
  const target = String(input);
  if (target === "http://127.0.0.1:11434/api/tags")
    return new Response(JSON.stringify({ models: [
      { name: "qwen2.5:7b" },
      { name: "llama3.2:3b" },
    ] }), { status: 200, headers: { "Content-Type": "application/json" } });
  if (target === "http://127.0.0.1:11434/api/chat") {
    const body = JSON.parse(init.body);
    ollamaRequests.push({ url: target, body });
    const isPlan = body.messages.some((message) => message.content.includes("PLANNING-ONLY REQUEST"));
    const content = isPlan
      ? JSON.stringify({ nextMove: "Review the locally drafted next step.", ideas: [{ title: "Check the local model plan" }], goalUpdates: [] })
      : "Mock local Ollama answer";
    return new Response(JSON.stringify({ message: { role: "assistant", content } }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (target.startsWith("https://thejevai.com/v1/systemone")) {
    jevRequests.push({
      body: JSON.parse(init.body),
      authorization: init.headers.Authorization,
    });
    return new Response(
      JSON.stringify({
        code: 0,
        data: {
          result: {
            model: "typesafe/jev-1.13",
            answers: {
              delegate: {
                type: "choice",
                choice: selectedJevDelegate,
                probabilities: { [selectedJevDelegate]: 0.9 },
              },
              model: {
                type: "choice",
                choice: selectedJevModel,
                probabilities: { [selectedJevModel]: 0.9 },
              },
            },
          },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  return originalFetch(input, init);
};

require(path.resolve(__dirname, "../main.cjs"));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const response = await originalFetch(
        `http://127.0.0.1:${port}/api/health`,
      );
      if (response.ok) return;
    } catch {}
    await sleep(50);
  }
  throw new Error("Desktop API did not start.");
}
async function request(urlPath, body, headers = {}) {
  const response = await originalFetch(`http://127.0.0.1:${port}${urlPath}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? headers
        : { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: response.status, json, text };
}

(async () => {
  await new Promise((resolve) =>
    hermes.listen(hermesPort, "127.0.0.1", resolve),
  );
  try {
    await waitForServer();
    const health = await request("/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.json.version, "0.1.0-test");
    const appWindow = MockWindow.instances.find((window) => window.url === `http://127.0.0.1:${port}/`);
    assert.ok(appWindow);
    assert.equal(mediaPermissionCheckHandler(appWindow.webContents, "media", `http://127.0.0.1:${port}`, { mediaType: "audio" }), true);
    assert.equal(mediaPermissionCheckHandler(appWindow.webContents, "media", `http://127.0.0.1:${port}`, { mediaType: "video" }), false);
    assert.equal(mediaPermissionCheckHandler(appWindow.webContents, "media", "https://untrusted.example", { mediaType: "audio" }), false);
    let microphoneGranted = null;
    mediaPermissionRequestHandler(appWindow.webContents, "media", (granted) => { microphoneGranted = granted; }, { mediaTypes: ["audio"], securityOrigin: `http://127.0.0.1:${port}` });
    assert.equal(microphoneGranted, true);
    let cameraGranted = null;
    mediaPermissionRequestHandler(appWindow.webContents, "media", (granted) => { cameraGranted = granted; }, { mediaTypes: ["audio", "video"], securityOrigin: `http://127.0.0.1:${port}` });
    assert.equal(cameraGranted, false);
    const knowledge = await request("/api/knowledge");
    assert.equal(knowledge.status, 200);
    assert.equal(knowledge.json.documents[0].name, "Operations handbook");
    const knowledgeSearch = await request("/api/knowledge/search", { query: "qualified pipeline" });
    assert.match(knowledgeSearch.json.results[0].excerpt, /qualified pipeline/);
    const canceledImport = await request("/api/knowledge/import", {});
    assert.equal(canceledImport.json.canceled, true);
    const savedSharedPage = await request("/api/knowledge/save-shared-tab", {
      title: "Shared launch brief",
      url: "https://example.org/launch",
      selectedText: "The launch plan sets a 30-lead target.",
      explicitConsent: true,
    });
    assert.equal(savedSharedPage.status, 200);
    assert.ok(savedSharedPage.json.documents.some((doc) => doc.kind === "web"));
    const refusedPassiveSave = await request("/api/knowledge/save-shared-tab", {
      title: "No consent", url: "https://example.org", selectedText: "No passive save.",
    });
    assert.equal(refusedPassiveSave.status, 400);
    assert.ok(
      hotkeys.has("Control+1"),
      "Ctrl+1 must be registered as a global copilot shortcut.",
    );
    const dashboard = MockWindow.instances[0];
    hotkeys.get("Control+1")();
    await sleep(20);
    const floating = MockWindow.instances.find(
      (window) => window.options.title === "Robot Orchestra Copilot",
    );
    assert.ok(
      floating,
      "The hotkey should create the floating copilot window.",
    );
    assert.equal(floating.options.transparent, true);
    assert.equal(floating.options.alwaysOnTop, true);
    assert.equal(floating.visible, true);
    assert.equal(
      dashboard.visible,
      false,
      "Opening the floating copilot should hide the full dashboard.",
    );
    assert.ok(
      floating.bounds.width > 100,
      "Ctrl+1 should open the chat bubble.",
    );
    hotkeys.get("Control+1")();
    assert.equal(
      floating.bounds.width,
      104,
      "Ctrl+1 should collapse the chat back to the robot head.",
    );
    const dragEvent = {
      sender: floating.webContents,
      senderFrame: { url: floating.url },
    };
    mockElectron.ipcMain.emit("companion:drag-start", dragEvent, { screenX: 100, screenY: 100 });
    mockElectron.ipcMain.emit("companion:drag-move", dragEvent, { screenX: -1000, screenY: 1000 });
    mockElectron.ipcMain.emit("companion:drag-end", dragEvent);
    assert.equal(floating.bounds.x, 0, "The draggable head should clamp to the left work-area edge.");
    assert.equal(floating.bounds.y, 796, "The collapsed head should remain fully visible at the bottom edge.");
    hotkeys.get("Control+1")();
    assert.equal(floating.bounds.x, 0, "The chat should remain on the same display after expanding.");
    assert.equal(floating.bounds.y, 240, "The expanded chat should move upward to fit the work area.");
    assert.equal(floating.bounds.height, 660);
    const home = await originalFetch(`http://127.0.0.1:${port}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /<title>Robot Orchestra<\/title>/);

    const badOrigin = await request("/api/health", undefined, {
      Origin: "https://untrusted.example",
    });
    assert.equal(badOrigin.status, 403);
    const externalHermes = await request("/api/test-hermes", {
      hermesUrl: "https://example.com",
    });
    assert.equal(externalHermes.status, 403);
    const unconfigured = await request("/api/browser/submit", {
      task: "Ask about this tab",
    });
    assert.equal(unconfigured.status, 409);
    const unconfiguredCompanion = await request("/api/companion/chat", {
      task: "Help me plan this",
    });
    assert.equal(
      unconfiguredCompanion.status,
      409,
      "The companion must not send tasks before Hermes is connected.",
    );

    const bridge = await request("/api/test-hermes", {
      hermesUrl: `http://127.0.0.1:${hermesPort}`,
    });
    assert.equal(bridge.status, 200);
    assert.equal(bridge.json.ok, true);
    assert.ok(fs.existsSync(path.join(userData, "desktop-config.json")));

    const initialBrain = await request("/api/brain/state");
    assert.equal(initialBrain.status, 200);
    assert.equal(initialBrain.json.settings.proactiveEnabled, true);
    assert.equal(initialBrain.json.settings.intervalMinutes, 30);
    const savedBrain = {
      ...initialBrain.json,
      goals: [
        {
          id: "goal-test",
          title: "Ship the reviewable milestone",
          body: "Keep the next action in front of the user.",
          status: "active",
          progress: 15,
        },
      ],
    };
    const brainSaved = await request("/api/brain/state", savedBrain);
    assert.equal(brainSaved.status, 200);
    const brainThink = await request("/api/brain/think", { source: "manual" });
    assert.equal(brainThink.status, 200);
    assert.equal(hermesTasks.at(-1).body.source, "robot-heads-brain-pulse");
    assert.deepEqual(hermesTasks.at(-1).body.delegateTo, []);
    assert.equal(hermesTasks.at(-1).body.planningOnly, true);
    assert.equal(hermesTasks.at(-1).body.allowTools, false);
    assert.equal(hermesTasks.at(-1).body.browserContext, undefined);
    assert.match(hermesTasks.at(-1).body.task, /PLANNING-ONLY REQUEST/);
    assert.equal(
      brainThink.json.state.nextMove,
      "Review the proposed milestone with the user.",
    );
    assert.equal(
      brainThink.json.state.ideas[0].title,
      "Draft a milestone checklist",
    );
    assert.equal(brainThink.json.state.goals[0].progress, 15);
    assert.equal(brainThink.json.state.goals[0].proposedProgress, 40);

    await request("/api/browser/context", {
      title: "Shared tab",
      url: "https://example.org/shared",
      selectedText: "Explicitly shared by the user.",
    });
    const companionTask = await request("/api/companion/chat", {
      task: "Ask Hermes to break this into specialist work",
      includeBrowserContext: false,
    });
    assert.equal(companionTask.status, 200);
    assert.equal(companionTask.json.message.text, "Mock Hermes accepted task");
    assert.equal(
      hermesTasks.at(-1).body.source,
      "robot-heads-floating-copilot",
    );
    assert.deepEqual(hermesTasks.at(-1).body.delegateTo, [
      "scout",
      "builder",
      "reviewer",
    ]);
    assert.equal(
      hermesTasks.at(-1).body.browserContext,
      undefined,
      "Shared page context stays excluded unless the companion toggle is selected.",
    );

    const companionWithTab = await request("/api/companion/chat", {
      task: "Summarize the explicitly attached tab",
      includeBrowserContext: true,
      includeKnowledge: true,
    });
    assert.equal(companionWithTab.status, 200);
    assert.equal(
      hermesTasks.at(-1).body.browserContext.selectedText,
      "Explicitly shared by the user.",
    );
    assert.match(hermesTasks.at(-1).body.knowledgeContext, /Operations handbook/);
    const transcript = await request("/api/companion/messages");
    assert.equal(transcript.status, 200);
    assert.ok(
      transcript.json.messages.some(
        (message) =>
          message.text === "Ask Hermes to break this into specialist work",
      ),
    );
    assert.ok(
      transcript.json.messages.some(
        (message) =>
          message.role === "assistant" &&
          message.delegates?.some((delegate) => delegate.id === "builder"),
      ),
    );

    const noContext = await request(
      "/api/orchestra/tasks",
      {
        task: "Plain task",
        hermesUrl: `http://127.0.0.1:${hermesPort}`,
        delegateTo: ["builder"],
        model: "openrouter/free",
      },
      { Authorization: "Bearer openrouter-test" },
    );
    assert.equal(noContext.status, 200);
    assert.equal(
      hermesTasks.at(-1).body.browserContext,
      undefined,
      "A prior shared tab must not be implicitly attached.",
    );
    assert.equal(hermesTasks.at(-1).authorization, "Bearer openrouter-test");
    assert.equal(
      hermesTasks.at(-1).body.hermesUrl,
      undefined,
      "Local Hermes URL must not be forwarded upstream.",
    );

    const jev = await request("/api/jev/route", {
      task: "Implement the browser sidebar",
      jevApiKey: "sk_test_value",
      delegates: [
        { id: "builder", role: "Code agent" },
        { id: "scout", role: "Research agent" },
      ],
      models: ["openrouter/free", "vendor/model-free"],
    });
    assert.equal(jev.status, 200);
    assert.equal(jev.json.delegateId, "builder");
    assert.equal(jev.json.modelId, "openrouter/free");
    assert.equal(jevRequests.at(-1).authorization, "Bearer sk_test_value");

    selectedJevDelegate = "unlisted-agent";
    const invalidJev = await request("/api/jev/route", {
      task: "Do not execute",
      jevApiKey: "sk_test_value",
      delegates: [{ id: "builder", role: "Code agent" }],
      models: ["openrouter/free"],
    });
    assert.equal(
      invalidJev.status,
      502,
      "Jev decisions outside the app allowlist must fail closed.",
    );

    const sidePanel = await request("/api/browser/submit", {
      task: "Summarize the crawled site pages",
      browserContext: {
        title: "Site page scan · 2 pages",
        url: "https://example.org/article",
        selectedText: "USER-INITIATED SAME-ORIGIN WEBSITE SCAN\n## Page A\nExample extracted text.",
        pageCount: 2,
      },
    });
    assert.equal(sidePanel.status, 200);
    assert.equal(
      hermesTasks.at(-1).body.source,
      "robot-heads-browser-sidepanel",
    );
    assert.equal(
      hermesTasks.at(-1).body.browserContext.selectedText,
      "USER-INITIATED SAME-ORIGIN WEBSITE SCAN\n## Page A\nExample extracted text.",
    );
    const brainAfterScan = await request("/api/brain/state");
    assert.ok(
      brainAfterScan.json.feed.some(
        (entry) => entry.title === "Site scan sent to Hermes",
      ),
      "The completed site scan is added to the shared Brain feed.",
    );
    assert.ok(
      brainAfterScan.json.artifacts.some(
        (artifact) => artifact.name === "review-notes.md",
      ),
      "Hermes artifact references are added to the shared artifact shelf.",
    );
    const ollamaModels = await request("/api/ollama/models");
    assert.equal(ollamaModels.status, 200);
    assert.deepEqual(ollamaModels.json.models, ["ollama:qwen2.5:7b", "ollama:llama3.2:3b"]);
    const beforeOllamaHermes = hermesTasks.length;
    const localBrain = {
      ...brainAfterScan.json,
      settings: { ...brainAfterScan.json.settings, model: "ollama:qwen2.5:7b", proactiveEnabled: false },
    };
    const savedLocalBrain = await request("/api/brain/state", localBrain);
    assert.equal(savedLocalBrain.status, 200);
    const localChat = await request("/api/companion/chat", {
      task: "Answer from the local model",
      includeBrowserContext: false,
      includeKnowledge: true,
    });
    assert.equal(localChat.status, 200);
    assert.equal(localChat.json.route, "ollama-local");
    assert.equal(localChat.json.message.source, "ollama");
    assert.equal(localChat.json.message.text, "Mock local Ollama answer");
    assert.equal(hermesTasks.length, beforeOllamaHermes, "Direct Ollama chat must not call Hermes.");
    assert.equal(ollamaRequests.at(-1).body.model, "qwen2.5:7b");
    assert.equal(ollamaRequests.at(-1).body.stream, false);
    assert.match(ollamaRequests.at(-1).body.messages.at(-1).content, /Operations handbook/);
    assert.doesNotMatch(ollamaRequests.at(-1).body.messages.at(-1).content, /Explicitly shared by the user/);
    const localPlan = await request("/api/brain/think", { source: "manual" });
    assert.equal(localPlan.status, 200);
    assert.equal(localPlan.json.state.nextMove, "Review the locally drafted next step.");
    assert.equal(hermesTasks.length, beforeOllamaHermes, "Local Brain planning must not call Hermes.");
    assert.ok(ollamaRequests.at(-1).body.messages.some((message) => message.content.includes("PLANNING-ONLY REQUEST")));
    const localSidePanel = await request("/api/browser/submit", {
      task: "Summarize this explicitly shared local scan",
      browserContext: { title: "Page scan · 1 page", url: "https://example.org/local", selectedText: "User-shared scan text." },
    });
    assert.equal(localSidePanel.status, 200);
    assert.equal(localSidePanel.json.route, "ollama-local");
    assert.equal(hermesTasks.length, beforeOllamaHermes, "Local browser tasks must not call Hermes.");
    assert.match(ollamaRequests.at(-1).body.messages.at(-1).content, /User-shared scan text/);
    const localDashboardTask = await request("/api/orchestra/tasks", {
      task: "Use the selected local model",
      hermesUrl: "https://example.com/should-not-be-called",
      model: "ollama:qwen2.5:7b",
    });
    assert.equal(localDashboardTask.status, 200);
    assert.equal(localDashboardTask.json.route, "ollama-local");
    assert.equal(hermesTasks.length, beforeOllamaHermes, "Direct dashboard Ollama tasks must not call Hermes.");
    const unavailableModel = await request("/api/companion/chat", {
      task: "Do not call an uninstalled model",
      model: "ollama:not-installed",
    });
    assert.equal(unavailableModel.status, 200, "Companion chat uses the Brain-selected model, not a request override.");
    assert.equal(hermesTasks.length, beforeOllamaHermes);
    console.log(
      "PASS: local UI/health, CORS, loopback-only Hermes and Ollama, local model discovery, direct Ollama chat/planning/browser routing, audio-only microphone permission, Ctrl+1, draggable display-clamped window, Hermes sub-agent routing, context sharing, Jev allowlist.",
    );
  } finally {
    app.emit("before-quit");
    await new Promise((resolve) => hermes.close(resolve));
    await sleep(50);
    fs.rmSync(userData, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  app.emit("before-quit");
  hermes.close();
  process.exitCode = 1;
});
