"use strict";
/**
 * Robot Orchestra — agent screens, v1.
 *
 * One screen per agent, inside Orchestra's own desktop environment.
 * Each screen = one sandbox desktop: its own browser, its own terminal,
 * its own log, its own live view. The main Windows desktop stays clean.
 *
 * Rules:
 *  - One sandbox per agent. No shared filesystem between agents unless the
 *    Boss explicitly passes a result.
 *  - Stopping / pausing / resetting one screen never touches another screen.
 *  - A screen's live view is a noVNC stream from its sandbox host
 *    (WSL2 / Hyper-V VM on Windows, SPACE inside that Linux host).
 *    If the stream fails, the agent pauses — it does not run blind.
 *  - Live view URLs default to loopback. Never expose a sandbox screen
 *    publicly without an explicit, per-screen decision by Kevin.
 *  - Approvals are per screen, per job: Agent 1's approval does not cover
 *    Agent 2.
 *
 * Pure logic again, no Electron, testable with node --test.
 */

function createScreens() {
  return new Map();
}

function createScreen(screens, id, job) {
  const screen = {
    id,
    job: String(job || ""),
    status: "running", // running | paused | stopped | done | failed
    liveViewUrl: null, // set by the sandbox host when the stream is ready
    log: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  screens.set(id, screen);
  return screen;
}

function getScreen(screens, id) {
  return screens.get(id) || null;
}

function logToScreen(screens, id, line) {
  const screen = getScreen(screens, id);
  if (!screen) return null;
  screen.log.push({ time: new Date().toISOString(), text: String(line || "") });
  if (screen.log.length > 200) screen.log.splice(0, screen.log.length - 200);
  screen.updatedAt = new Date().toISOString();
  return screen;
}

function setScreenStatus(screens, id, status) {
  const screen = getScreen(screens, id);
  if (!screen) return null;
  screen.status = status;
  screen.updatedAt = new Date().toISOString();
  return screen;
}

function pauseScreen(screens, id) { return setScreenStatus(screens, id, "paused"); }
function stopScreen(screens, id) { return setScreenStatus(screens, id, "stopped"); }
function resumeScreen(screens, id) { return setScreenStatus(screens, id, "running"); }

function stopAllScreens(screens) {
  for (const screen of screens.values()) {
    screen.status = "stopped";
    screen.updatedAt = new Date().toISOString();
  }
  return [...screens.values()];
}

function listScreens(screens) {
  return [...screens.values()].map((s) => ({
    id: s.id,
    job: s.job,
    status: s.status,
    lastLog: s.log.length ? s.log.at(-1).text : "",
  }));
}

function summaryForVoice(screens) {
  const list = listScreens(screens);
  if (!list.length) return "No agents are running right now.";
  return list.map((s) => `${s.id} is ${s.status} on ${s.job || "no job"}.`).join(" ");
}

module.exports = {
  createScreens,
  createScreen,
  getScreen,
  logToScreen,
  setScreenStatus,
  pauseScreen,
  stopScreen,
  resumeScreen,
  stopAllScreens,
  listScreens,
  summaryForVoice,
};
