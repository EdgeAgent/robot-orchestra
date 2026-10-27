"use strict";
/**
 * Robot Orchestra — M1 demo + killer demo, v1.
 *
 * Run: node demo-m1.cjs
 *
 * This is the demo Kevin asked for, as a runnable script on his machine:
 *  M1: one agent, one screen, one job, end to end, by voice command.
 *  Killer demo: Agent 1 (Outreach) drafts outreach + Agent 2 (Research)
 *  researches competitors IN PARALLEL, on separate screens, then a
 *  single voice batch approval covers the risky part.
 *
 * What it actually does here: it drives the real voice-wiring +
 * sandbox-host logic (routing, screens, approval gate, ports, guard).
 * It does NOT fake a live browser stream and does NOT send anything:
 * outreach is DRAFTS ONLY, and any send job pauses for a voice "yes"
 * — the demo answers "no" on purpose, to prove the gate holds.
 * On Kevin's Windows PC, with WSL2 + SPACE + a live noVNC stream,
 * the same commands drive real agent screens; this script is the
 * rehearsal that proves the routing, screens, and gate before that run.
 */
const { createVoiceWiring } = require("./voice-wiring.cjs");
const { createSandboxHost } = require("./sandbox-host.cjs");
const { runJobWithGuard } = require("./job-runner.cjs");

async function main() {
  const said = [];
  const wiring = createVoiceWiring({ onMessage: (t) => { said.push(t); console.log(`HEAD: ${t}`); } });
  const host = createSandboxHost({ spawn: () => ({ on: () => {}, kill: () => {} }) });

  console.log("=== M1: one agent, one screen, by voice ===");
  console.log(wiring.handleCommand("Outreach, draft outreach for London plumbers with good reviews but no website"));
  const screen1 = wiring.listScreens()[0];
  const sandbox1 = host.start(screen1.id, screen1.job);
  console.log(`SCREEN: ${screen1.id} -> live view ${sandbox1.liveViewUrl} (loopback, WSL2 host)`);

  console.log("\n=== Killer demo: parallel, two screens ===");
  wiring.handleCommand("Research, research top 3 competitor automation agencies in London Ontario");
  for (const s of wiring.listScreens()) {
    const sb = host.start(s.id, s.job);
    console.log(`SCREEN: ${s.id} (${s.status}) -> ${sb.liveViewUrl}`);
  }
  console.log(`\nHEAD SUMMARY: ${wiring.summaryForVoice()}`);

  console.log("\n=== Batch approval gate: send pauses, demo says no ===");
  const blocked = wiring.handleCommand("Outreach, send the outreach batch");
  console.log(`BLOCKED: ${blocked.needsApproval} — prompt: ${blocked.prompt}`);
  const cancelled = wiring.handleCommand("no");
  console.log(`CANCELLED: ${cancelled.cancelled} — screens still: ${wiring.listScreens().length}, none sent`);

  console.log("\n=== Free-model guard: narrow, retry once, escalate ===");
  let calls = 0;
  const guarded = await runJobWithGuard(async () => { calls += 1; throw new Error("model tool loop failed"); }, "research competitors and build a demo and send it");
  console.log(`GUARD: attempts=${guarded.attempts} calls=${calls} escalated=${guarded.escalated} — ${guarded.message}`);

  console.log("\n=== M1 demo complete ===");
  console.log("Next on Windows: checkout voice-control-v1, run setup-wsl2-sandbox.ps1, start the voice server, then run this demo live and watch the screens in noVNC.");
  console.log("Film that live run for the README — that is the killer demo, not this rehearsal.");
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { main };
