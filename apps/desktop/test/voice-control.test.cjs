"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  containsWakeWord,
  routeCommand,
  isScreenCommand,
  needsApproval,
  headStateFor,
  mouthOpennessForAmplitude,
  confirmPrompt,
} = require("../voice-control.cjs");
const {
  createScreens,
  createScreen,
  pauseScreen,
  stopScreen,
  stopAllScreens,
  listScreens,
  summaryForVoice,
} = require("../agent-screens.cjs");

test("wake word: any configured word triggers, other speech does not", () => {
  assert.equal(containsWakeWord("hey robot do outreach", "robot"), true);
  assert.equal(containsWakeWord("hello there", "robot"), false);
  assert.equal(containsWakeWord("hey buddy do it", "buddy"), true);
});

test("routing: name-first goes direct, no name lets Boss pick by job", () => {
  assert.equal(routeCommand("Agent 1, do outreach for plumbers", {}).agentId, "agent-1");
  assert.equal(routeCommand("Agent 2, research competitor markets", {}).agentId, "agent-2");
  assert.equal(routeCommand("Agent 3, build a demo site", {}).agentId, "agent-3");
  assert.equal(routeCommand("do outreach for plumbers", {}).agentId, "agent-1");
  assert.equal(routeCommand("research competitor markets", {}).agentId, "agent-2");
  assert.equal(routeCommand("what are you working on?", {}).agentId, "boss");
});

test("screen commands: show, pause, stop one, stop everything", () => {
  assert.deepEqual(isScreenCommand("Show Agent 2"), { type: "show", target: "agent 2" });
  assert.deepEqual(isScreenCommand("Show all agents"), { type: "show-all" });
  assert.deepEqual(isScreenCommand("Stop Agent 2"), { type: "stop", target: "agent 2" });
  assert.deepEqual(isScreenCommand("Stop everything"), { type: "stop", target: "everything" });
  assert.equal(isScreenCommand("build a demo"), null);
});

test("approval gate: send / ship / pay / delete must ask, reads do not", () => {
  assert.equal(needsApproval("send the batch"), true);
  assert.equal(needsApproval("ship it to production"), true);
  assert.equal(needsApproval("pay the invoice"), true);
  assert.equal(needsApproval("research competitor markets"), false);
  assert.equal(needsApproval("build a demo site"), false);
});

test("head states: voice events map to existing RobotHead states", () => {
  assert.equal(headStateFor("wake"), "listening");
  assert.equal(headStateFor("transcript-confirmed"), "thinking");
  assert.equal(headStateFor("speaking"), "speaking");
  assert.equal(headStateFor("job-done"), "happy");
  assert.equal(headStateFor("job-failed"), "error");
});

test("mouth: amplitude bobbing, not lip-sync, always moves on speech", () => {
  assert.ok(mouthOpennessForAmplitude(0) >= 0.25);
  assert.ok(mouthOpennessForAmplitude(1) <= 1);
  assert.ok(mouthOpennessForAmplitude(0.5) > mouthOpennessForAmplitude(0));
  assert.match(confirmPrompt("build a demo"), /You said:/);
});

test("screens: stopping one screen never touches another", () => {
  const screens = createScreens();
  createScreen(screens, "agent-1", "outreach");
  createScreen(screens, "agent-2", "research");
  stopScreen(screens, "agent-2");
  assert.equal(listScreens(screens).find((s) => s.id === "agent-2").status, "stopped");
  assert.equal(listScreens(screens).find((s) => s.id === "agent-1").status, "running");
  pauseScreen(screens, "agent-1");
  assert.match(summaryForVoice(screens), /agent-1 is paused/);
  stopAllScreens(screens);
  assert.ok(listScreens(screens).every((s) => s.status === "stopped"));
});
