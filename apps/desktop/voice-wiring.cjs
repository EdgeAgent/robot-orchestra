"use strict";
/**
 * Robot Orchestra — voice wiring, v1.
 *
 * This is the bridge between voice-control.cjs (pure logic) and
 * main.cjs (Electron). It is the part Kevin asked to be "wired into main":
 * a spoken command now actually routes, creates a screen, or pauses for
 * approval — it does not just get logged.
 *
 * What it does:
 *  - Wake word -> head goes to `listening`, then `thinking` on a confirmed
 *    transcript, then `speaking` when it answers.
 *  - "Agent N, <job>" / "Show Agent N" / "Stop Agent N" / "Stop everything"
 *    are handled, not echoed.
 *  - Risky jobs (send / ship / pay / delete) stop at a pending approval.
 *    The head speaks the exact job back and waits for a voice "yes" or
 *    "no". Nothing risky runs on a misheard command.
 *  - Every routed job gets its own agent screen, so it can be watched live
 *    and stopped without touching other agents.
 *
 * What it does NOT do (yet, honestly):
 *  - It does not capture the mic itself. main.cjs must feed it transcripts
 *    from a local STT server (Moonshine / Faster-Whisper on loopback).
 *    Until that server runs, use the HTTP endpoints / IPC below with typed
 *    commands, or the existing Hugging Face Talk button.
 *  - It does not launch a real sandbox VM or noVNC stream. A screen's
 *    `liveViewUrl` stays null until the sandbox host sets it. An agent
 *    must not run a live browser job blind — that host step is next.
 *  - It does not call Hermes / Ollama directly. It routes and records;
 *    main.cjs's existing /api/companion/chat and /api/orchestra/tasks
 *    routes stay the model path, so no new model call is invented here.
 *
 * Testable without Electron: pass a fake onHeadState / onMessage and run
 * test/voice-wiring.test.cjs with node --test.
 */
const {
  configWith,
  containsWakeWord,
  routeCommand,
  isScreenCommand,
  needsApproval,
  headStateFor,
  confirmPrompt,
} = require("./voice-control.cjs");
const {
  createScreens,
  createScreen,
  getScreen,
  logToScreen,
  pauseScreen,
  stopScreen,
  resumeScreen,
  stopAllScreens,
  listScreens,
  summaryForVoice,
} = require("./agent-screens.cjs");

function createVoiceWiring(options) {
  const opts = options || {};
  const config = configWith(opts.config);
  const screens = createScreens();
  let headState = "idle";
  let voiceEnabled = false;
  let pendingApproval = null; // { job, agentId, command }
  let lastTranscript = null;

  function emitHead(event) {
    headState = headStateFor(event);
    if (typeof opts.onHeadState === "function") opts.onHeadState(headState, event);
    return headState;
  }
  function say(text) {
    if (typeof opts.onMessage === "function") opts.onMessage(String(text || ""));
  }

  function wake(transcript) {
    if (!containsWakeWord(transcript, config.wakeWord)) return { woke: false, headState };
    lastTranscript = String(transcript || "");
    emitHead("wake");
    return { woke: true, headState };
  }

  function handleCommand(rawCommand) {
    const command = String(rawCommand || "").trim().slice(0, 12000);
    if (!command) return { ok: false, error: "No command given.", headState };
    lastTranscript = command;

    // Answer a pending approval first — "yes" / "no" must never be routed
    // as a new job.
    if (pendingApproval) {
      const low = command.toLowerCase().trim();
      if (low === "yes" || low === "confirm" || low === "yes do it") {
        const approved = pendingApproval;
        pendingApproval = null;
        const screen = createScreen(screens, approved.agentId, approved.job);
        logToScreen(screens, approved.agentId, `Approved by voice: ${approved.job}`);
        emitHead("agent-working");
        say(`Approved. ${approved.agentId} is now working on: ${approved.job}`);
        return { ok: true, approved: true, screen: listScreens(screens).find((s) => s.id === approved.agentId), headState };
      }
      if (low === "no" || low === "cancel" || low === "stop") {
        const dropped = pendingApproval;
        pendingApproval = null;
        emitHead("idle");
        say(`Cancelled. I will not ${dropped.job}.`);
        return { ok: true, approved: false, cancelled: true, headState };
      }
      emitHead("blocked-needs-approval");
      return { ok: false, needsApproval: true, prompt: confirmPrompt(pendingApproval.job), headState };
    }

    const screenCmd = isScreenCommand(command);
    if (screenCmd) {
      if (screenCmd.type === "show-all") {
        emitHead("speaking");
        say(summaryForVoice(screens));
        return { ok: true, action: "show-all", screens: listScreens(screens), headState };
      }
      if (screenCmd.type === "show") {
        const target = screenCmd.target.replace("agent ", "agent-");
        const screen = getScreen(screens, target) || getScreen(screens, screenCmd.target);
        emitHead("speaking");
        if (!screen) { say(`No screen for ${screenCmd.target} yet.`); return { ok: false, error: `No screen for ${screenCmd.target}.`, headState }; }
        say(`${screen.id} is ${screen.status} on ${screen.job || "no job"}.`);
        return { ok: true, action: "show", screen: listScreens(screens).find((s) => s.id === screen.id), headState };
      }
      if (screenCmd.type === "pause") {
        const target = screenCmd.target.replace("agent ", "agent-");
        const screen = pauseScreen(screens, target);
        emitHead("idle");
        if (!screen) return { ok: false, error: `No screen for ${screenCmd.target}.`, headState };
        say(`${screen.id} paused.`);
        return { ok: true, action: "pause", screen: listScreens(screens).find((s) => s.id === target), headState };
      }
      if (screenCmd.type === "stop") {
        if (screenCmd.target === "everything") {
          stopAllScreens(screens);
          emitHead("stop");
          say("All agents stopped.");
          return { ok: true, action: "stop-all", screens: listScreens(screens), headState };
        }
        const target = screenCmd.target.replace("agent ", "agent-");
        const screen = stopScreen(screens, target);
        emitHead("stop");
        if (!screen) return { ok: false, error: `No screen for ${screenCmd.target}.`, headState };
        say(`${screen.id} stopped.`);
        return { ok: true, action: "stop", screen: listScreens(screens).find((s) => s.id === target), headState };
      }
      if (screenCmd.type === "continue") {
        // Resume the first paused screen, if any.
        const paused = listScreens(screens).find((s) => s.status === "paused");
        if (!paused) { say("Nothing is paused."); return { ok: false, error: "Nothing is paused.", headState }; }
        resumeScreen(screens, paused.id);
        emitHead("agent-working");
        say(`${paused.id} continuing.`);
        return { ok: true, action: "continue", screen: listScreens(screens).find((s) => s.id === paused.id), headState };
      }
    }

    const routed = routeCommand(command, config);
    emitHead("transcript-confirmed");
    if (needsApproval(routed.job)) {
      pendingApproval = { job: routed.job, agentId: routed.agentId, command };
      emitHead("blocked-needs-approval");
      const prompt = `That would ${routed.job} — say yes to approve, or no to cancel.`;
      say(prompt);
      return { ok: false, needsApproval: true, prompt, routed, headState };
    }

    const screen = createScreen(screens, routed.agentId, routed.job);
    logToScreen(screens, routed.agentId, `Voice job: ${routed.job}`);
    emitHead("agent-working");
    say(`${routed.agentId} is working on: ${routed.job}`);
    return { ok: true, routed, screen: listScreens(screens).find((s) => s.id === screen.id), headState };
  }

  return {
    config,
    screens,
    wake,
    handleCommand,
    get headState() { return headState; },
    get voiceEnabled() { return voiceEnabled; },
    setVoiceEnabled(v) { voiceEnabled = Boolean(v); return voiceEnabled; },
    get pendingApproval() { return pendingApproval; },
    get lastTranscript() { return lastTranscript; },
    listScreens: () => listScreens(screens),
    summaryForVoice: () => summaryForVoice(screens),
  };
}

module.exports = { createVoiceWiring };
