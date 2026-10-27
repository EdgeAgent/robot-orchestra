"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { narrowJob, splitJob, isMultiJob, runJobWithGuard } = require("../job-runner.cjs");
const { routeCommand } = require("../voice-control.cjs");

test("role names route first, Agent numbers still work as aliases", () => {
  assert.equal(routeCommand("Outreach, draft outreach", {}).agentId, "agent-1");
  assert.equal(routeCommand("Research, research competitors", {}).agentId, "agent-2");
  assert.equal(routeCommand("Builder, build a demo", {}).agentId, "agent-3");
  assert.equal(routeCommand("Agent 1, draft outreach", {}).agentId, "agent-1");
  assert.equal(routeCommand("Agent 2, research competitors", {}).agentId, "agent-2");
});

test("job guard: narrow, retry once, then escalate — never loop, never fake", async () => {
  assert.equal(narrowJob("research competitors and build a demo and send it"), "research competitors and build a demo and send it".split(/[.;\n]/)[0]);
  assert.equal(isMultiJob("research competitors and then build a demo"), true);
  assert.equal(isMultiJob("research competitors"), false);
  assert.equal(splitJob("research and then build").length, 2);
  let calls = 0;
  const failed = await runJobWithGuard(async () => { calls += 1; throw new Error("tool loop failed"); }, "do a big job");
  assert.equal(calls, 2, "one retry only");
  assert.equal(failed.escalated, true);
  assert.match(failed.message, /Escalating to Kevin/);
  const ok = await runJobWithGuard(async () => "done", "do a job");
  assert.equal(ok.ok, true);
  assert.equal(ok.attempts, 1);
});
