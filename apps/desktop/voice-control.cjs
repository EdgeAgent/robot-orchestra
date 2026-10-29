"use strict";
/**
 * Robot Orchestra — voice control layer, v1.
 *
 * This is the missing layer Kevin asked for, built on top of what already
 * exists: the floating RobotHead, the Brain, direct Ollama, and Hermes /
 * OpenRouter delegation. It does NOT replace the Hugging Face live-voice
 * panel — that stays as the manual Talk-button fallback until this layer
 * passes its tests.
 *
 * Design rules, from the reference pack:
 *  - Voice controls EVERYTHING. Screens are for watching, voice is for
 *    controlling. If a feature cannot be done by talking to the head, it
 *    is not done.
 *  - Main chat head = main agent (Boss). It delegates, it does not just chat.
 *  - The Orchestra app = its own desktop environment. Agents open browsers
 *    and apps inside their own sandbox desktops, not on the main Windows
 *    desktop.
 *  - Mouth movement is amplitude bobbing, NOT phoneme lip-sync. The head
 *    state `speaking` + a moving mouth is explicitly good enough.
 *  - Approvals are immutable: send / ship / pay / delete / touch a main
 *    account always pause and ask, by voice, exact action named. No learned
 *    rule, no agent, no model can skip that gate.
 *  - No keys, passwords, or wallet data are ever spoken, logged, or stored
 *    by this module. STT / TTS endpoints default to loopback only.
 *
 * This module is pure logic on purpose: no Electron, no mic, no network.
 * The Electron main process wires it to a mic (Moonshine / Faster-Whisper),
 * a TTS voice (Piper), and the RobotHead state. That keeps it testable with
 * plain `node --test`, which is how it is tested in test/voice-control.test.cjs.
 */

const DEFAULT_CONFIG = Object.freeze({
  // Any word Kevin wants. Change this one line, no rebuild, no retraining
  // for the transcription-trigger method (see containsWakeWord).
  wakeWord: "robot",
  // Placeholder for both. "openrouter" = Hermes delegation, free models.
  // "ollama" = direct local inference. Swap in config, nothing else changes.
  modelGateway: "openrouter",
  // Agent names are config, not hard-coded. Role names route cleaner than
  // numbers once there are more than three screens, but numbers work too.
  agents: Object.freeze([
    // Role names first, numbers as aliases. "Outreach, do it" and
    // "Agent 1, do it" route to the same screen, role name wins in speech.
    Object.freeze({ id: "agent-1", names: ["outreach", "agent 1", "agent one"] }),
    Object.freeze({ id: "agent-2", names: ["research", "agent 2", "agent two"] }),
    Object.freeze({ id: "agent-3", names: ["builder", "agent 3", "agent three"] }),
  ]),
  // Local-only voice endpoints. Never point these at a remote wss:// you
  // do not trust, and never start the mic on launch.
  sttEndpoint: "http://127.0.0.1:8766/stt", // 8766, not 8765 (HF realtime)
  ttsEndpoint: "http://127.0.0.1:8766/tts",
  voiceEnabled: false,
});

const RISKY_VERBS = [
  "send",
  "ship",
  "publish",
  "pay",
  "delete",
  "remove",
  "buy",
  "charge",
  "transfer",
];

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function configWith(overrides) {
  const next = { ...DEFAULT_CONFIG, ...(overrides || {}) };
  if (overrides && overrides.agents) next.agents = overrides.agents;
  return next;
}

/**
 * Instant any-word wake detection, no training.
 * Run a tiny STT continuously and trigger when the transcript contains the
 * configured wake word. Trade-off: slightly more CPU than a trained
 * openWakeWord model, but any word works immediately, no samples needed.
 * The trained-model path (openWakeWord) is the later, lower-CPU option.
 */
function containsWakeWord(transcript, wakeWord) {
  const haystack = normalizeText(transcript);
  const needle = normalizeText(wakeWord || DEFAULT_CONFIG.wakeWord);
  if (!haystack || !needle) return false;
  return haystack.split(" ").join(" ").includes(needle);
}

/**
 * Route a spoken command to an agent, or to the Boss.
 * Name-first = direct. No name = Boss picks by job keyword.
 * Returns { agentId, job, raw } where agentId is "boss" when unnamed.
 */
function routeCommand(command, config) {
  const cfg = configWith(config);
  const raw = String(command || "");
  const text = normalizeText(raw);

  for (const agent of cfg.agents) {
    for (const name of agent.names) {
      const needle = normalizeText(name);
      if (text.startsWith(needle + " ") || text === needle) {
        const job = raw.replace(new RegExp(`^\\s*${name}`, "i"), "").trim().replace(/^[,:\-]\s*/, "");
        return { agentId: agent.id, agentName: name, job, raw };
      }
    }
  }

  // Boss picks by job type when no agent is named.
  if (/\b(outreach|email|leads?|dm)\b/.test(text)) return { agentId: "agent-1", agentName: "outreach", job: raw, raw };
  if (/\b(research|competitor|market|compare)\b/.test(text)) return { agentId: "agent-2", agentName: "research", job: raw, raw };
  if (/\b(build|demo|site|code|page)\b/.test(text)) return { agentId: "agent-3", agentName: "builder", job: raw, raw };
  return { agentId: "boss", agentName: "boss", job: raw, raw };
}

function isScreenCommand(command) {
  const text = normalizeText(command);
  if (/^show all agents/.test(text)) return { type: "show-all" };
  const show = text.match(/^show (agent \d+|outreach|research|builder)/);
  if (show) return { type: "show", target: show[1] };
  const stop = text.match(/^stop (agent \d+|outreach|research|builder|everything)/);
  if (stop) return { type: "stop", target: stop[1] };
  if (/^pause (agent \d+|outreach|research|builder)/.test(text)) {
    return { type: "pause", target: text.match(/^pause (agent \d+|outreach|research|builder)/)[1] };
  }
  if (/^continue/.test(text)) return { type: "continue" };
  if (/^stop everything/.test(text)) return { type: "stop", target: "everything" };
  return null;
}

/**
 * Approval gate. Returns true only when the job MUST pause and ask Kevin,
 * by voice, with the exact action named, before it runs.
 */
function needsApproval(job) {
  const text = normalizeText(job);
  if (/\b(send|ship|publish|pay|delete|buy)\b/.test(text)) return true;
  return RISKY_VERBS.some((verb) => new RegExp(`\\b${verb}\\b`).test(text));
}

/**
 * Head state machine. Wire these states straight onto RobotHead's existing
 * states — do not invent a new head.
 * idle -> listening -> thinking -> speaking -> idle, with working/searching
 * while an agent runs, happy on success, error on failure, sleeping when idle.
 */
function headStateFor(event) {
  const map = {
    "wake": "listening",
    "listening": "listening",
    "transcript-confirmed": "thinking",
    "routing": "thinking",
    "agent-working": "working",
    "agent-searching": "searching",
    "speaking": "speaking",
    "job-done": "happy",
    "job-failed": "error",
    "blocked-needs-approval": "thinking",
    "idle-timeout": "sleeping",
    "stop": "idle",
  };
  return map[event] || "idle";
}

/**
 * Speaking animation: amplitude bobbing, not lip-sync.
 * `level` is 0..1 audio amplitude. Returns a mouth openness 0..1 that the
 * renderer can drive every frame. No phoneme model, no lip matching — that
 * is explicitly out of scope, per Kevin.
 */
function mouthOpennessForAmplitude(level) {
  const v = Math.max(0, Math.min(1, Number(level) || 0));
  // Simple ease so quiet speech still visibly moves the mouth.
  return Math.round((0.25 + 0.75 * v) * 100) / 100;
}

function confirmPrompt(command) {
  return `You said: ${String(command || "").trim()} — correct?`;
}

module.exports = {
  DEFAULT_CONFIG,
  configWith,
  containsWakeWord,
  routeCommand,
  isScreenCommand,
  needsApproval,
  headStateFor,
  mouthOpennessForAmplitude,
  confirmPrompt,
  normalizeText,
};
