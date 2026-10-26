"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createVoiceWiring } = require("../voice-wiring.cjs");

function wiring() {
  const said = [];
  const states = [];
  const w = createVoiceWiring({ onMessage: (t) => said.push(t), onHeadState: (s) => states.push(s) });
  return { w, said, states };
}

test("wiring: wake word wakes, other speech does not", () => {
  const { w } = wiring();
  assert.equal(w.wake("hello there").woke, false);
  assert.equal(w.wake("hey robot, listen").woke, true);
  assert.equal(w.headState, "listening");
});

test("wiring: voice command routes and creates a screen", () => {
  const { w, said } = wiring();
  const r = w.handleCommand("Agent 1, do outreach for plumbers");
  assert.equal(r.ok, true);
  assert.equal(r.routed.agentId, "agent-1");
  assert.equal(w.listScreens().length, 1);
  assert.equal(w.listScreens()[0].status, "running");
  assert.match(said.join(" "), /agent-1 is working/);
});

test("wiring: risky job pauses for approval and only runs on yes", () => {
  const { w } = wiring();
  const blocked = w.handleCommand("Agent 1, send the batch");
  assert.equal(blocked.needsApproval, true);
  assert.equal(w.listScreens().length, 0, "nothing runs before approval");
  const approved = w.handleCommand("yes");
  assert.equal(approved.approved, true);
  assert.equal(w.listScreens().length, 1);
});

test("wiring: risky job is cancelled on no", () => {
  const { w } = wiring();
  w.handleCommand("Agent 1, send the batch");
  const cancelled = w.handleCommand("no");
  assert.equal(cancelled.cancelled, true);
  assert.equal(w.listScreens().length, 0);
});

test("wiring: stop one screen leaves the other running", () => {
  const { w } = wiring();
  w.handleCommand("Agent 1, do outreach");
  w.handleCommand("Agent 2, research competitors");
  const stopped = w.handleCommand("Stop Agent 2");
  assert.equal(stopped.ok, true);
  const list = w.listScreens();
  assert.equal(list.find((s) => s.id === "agent-2").status, "stopped");
  assert.equal(list.find((s) => s.id === "agent-1").status, "running");
  const all = w.handleCommand("Stop everything");
  assert.equal(all.action, "stop-all");
  assert.ok(w.listScreens().every((s) => s.status === "stopped"));
});
