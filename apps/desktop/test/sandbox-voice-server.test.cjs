"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createSandboxHost, portsFor, liveViewUrlFor, startCommandFor } = require("../sandbox-host.cjs");
const { voiceServerConfig, voiceServerUrl, isLoopbackHost, healthResponse } = require("../voice-server.cjs");

test("sandbox host: deterministic ports per agent, no overlap", () => {
  assert.deepEqual(portsFor("agent-1"), { vncPort: 5901, novncPort: 6081 });
  assert.deepEqual(portsFor("agent-2"), { vncPort: 5902, novncPort: 6082 });
  assert.equal(liveViewUrlFor("agent-1"), "http://127.0.0.1:6081/vnc.html");
  assert.notEqual(liveViewUrlFor("agent-1"), liveViewUrlFor("agent-2"));
});

test("sandbox host: WSL2 command runs SPACE inside WSL2, not on main desktop", () => {
  const cmd = startCommandFor("agent-1", "do outreach");
  assert.equal(cmd.program, "wsl");
  assert.match(cmd.args.join(" "), /space-agent start/);
  assert.match(cmd.args.join(" "), /5901/);
});

test("sandbox host: stopping one agent leaves the other running", () => {
  const host = createSandboxHost({ spawn: () => ({ on: () => {}, kill: () => {} }) });
  host.start("agent-1", "outreach");
  host.start("agent-2", "research");
  host.stop("agent-2");
  assert.equal(host.get("agent-2").status, "stopped");
  assert.equal(host.get("agent-1").status, "running");
  host.stopAll();
  assert.ok(host.list().every((s) => s.status === "stopped"));
});

test("voice server: loopback only, non-loopback rejected", () => {
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("0.0.0.0"), false);
  assert.equal(voiceServerUrl({}), "http://127.0.0.1:8766");
  assert.throws(() => voiceServerConfig({ host: "example.com" }), /loopback only/);
  const h = healthResponse({}, {});
  assert.equal(h.micAutoStart, false);
  assert.equal(h.loopbackOnly, true);
});
