"use strict";
/**
 * Robot Orchestra — sandbox host, v1.
 *
 * How it runs on Kevin's Windows machine, as a dev would set it up there:
 *  - Host = WSL2 (or Hyper-V) on Windows. SPACE / the agent desktop runs
 *    INSIDE that Linux host, not on the main Windows desktop.
 *  - One sandbox per agent. Agent 1, Agent 2, Agent 3 each get their own
 *    desktop, their own browser, their own noVNC stream.
 *  - Live view = noVNC, loopback only. Port per agent, deterministic:
 *    Agent 1 -> VNC 5901 / noVNC 6081, Agent 2 -> 5902 / 6082, and so on.
 *    No port is ever opened to the network, no screen is ever public.
 *  - If a stream fails, the agent pauses. It does not run blind.
 *
 * This module is the host manager: allocation, start, stop, status.
 * The actual VM launch on Windows is a WSL2 command (see startCommandFor);
 * in tests, spawn is injected, so no VM is actually launched here.
 */
function agentIndexFromId(agentId) {
  const m = String(agentId || "").match(/agent-(\d+)/);
  return m ? Number(m[1]) : 1;
}
function portsFor(agentId) {
  const i = agentIndexFromId(agentId);
  return { vncPort: 5900 + i, novncPort: 6080 + i };
}
function liveViewUrlFor(agentId) {
  const { novncPort } = portsFor(agentId);
  return `http://127.0.0.1:${novncPort}/vnc.html`;
}
function startCommandFor(agentId, job) {
  const { vncPort, novncPort } = portsFor(agentId);
  // WSL2 host command, as run on Kevin's Windows machine. SPACE runs
  // inside WSL2; the main Windows desktop is never touched.
  return {
    program: "wsl",
    args: [
      "-d", "Ubuntu",
      "bash", "-lc",
      `SPACE_VNC_PORT=${vncPort} SPACE_NOVNC_PORT=${novncPort} space-agent start --job ${JSON.stringify(String(job || ""))}`,
    ],
    env: { VNC_PORT: String(vncPort), NOVNC_PORT: String(novncPort) },
  };
}

function createSandboxHost(options) {
  const opts = options || {};
  const spawn = opts.spawn || null; // injected in tests; real spawn on Windows
  const sandboxes = new Map();

  function start(agentId, job) {
    const ports = portsFor(agentId);
    const sandbox = {
      agentId,
      job: String(job || ""),
      status: "starting",
      vncPort: ports.vncPort,
      novncPort: ports.novncPort,
      liveViewUrl: liveViewUrlFor(agentId),
      startedAt: new Date().toISOString(),
    };
    sandboxes.set(agentId, sandbox);
    const cmd = startCommandFor(agentId, job);
    if (spawn) {
      try {
        const proc = spawn(cmd.program, cmd.args, { env: cmd.env });
        sandbox.process = proc;
        sandbox.status = "running";
        if (proc && typeof proc.on === "function") {
          proc.on("exit", () => { sandbox.status = "stopped"; });
          proc.on("error", () => { sandbox.status = "failed"; });
        }
      } catch {
        sandbox.status = "failed";
      }
    } else {
      // No spawn in this environment = host not yet launched on Windows.
      // Status stays "starting" and the screen must pause, not run blind.
      sandbox.status = "waiting-for-host";
    }
    return sandbox;
  }
  function stop(agentId) {
    const s = sandboxes.get(agentId);
    if (!s) return null;
    if (s.process && typeof s.process.kill === "function") { try { s.process.kill(); } catch {} }
    s.status = "stopped";
    return s;
  }
  function stopAll() {
    for (const id of [...sandboxes.keys()]) stop(id);
    return [...sandboxes.values()];
  }
  function get(agentId) { return sandboxes.get(agentId) || null; }
  function list() { return [...sandboxes.values()].map((s) => ({ agentId: s.agentId, job: s.job, status: s.status, liveViewUrl: s.liveViewUrl, vncPort: s.vncPort, novncPort: s.novncPort })); }

  return { start, stop, stopAll, get, list, portsFor, liveViewUrlFor, startCommandFor };
}

module.exports = { createSandboxHost, portsFor, liveViewUrlFor, startCommandFor, agentIndexFromId };
