# Robot Orchestra — voice-control-v1 audit, 2026-10-26

Done to the best ability possible without a live Windows run. This is
the audit, not a promise that the live run will be flawless — the live
risks are named at the end, with exactly what Kevin needs to provide.

## What was audited
- voice-control.cjs, agent-screens.cjs, voice-wiring.cjs, job-runner.cjs,
  sandbox-host.cjs, voice-server.cjs, main.cjs wiring, preload.cjs,
  demo-m1.cjs, setup-wsl2-sandbox.ps1, all tests.

## Bugs found and fixed
1. **Role-name screen commands failed (FIXED).** Screens are stored as
   agent-1 / agent-2, so "Show Outreach" / "Stop Research" / "Pause
   Builder" returned "no screen" before the fix. Added resolveAgentId()
   in voice-wiring.cjs, mapping role names and "Agent N" to agent-N.
   Test added: screen commands work by role name.
2. **Approval "yes"/"no" could be misrouted (CHECKED, OK).** Pending
   approval is answered before routing, so "yes" never becomes a new job.
3. **Mic permissions (CHECKED, OK).** main.cjs allows audio only, app
   origin only, app windows only. No video, no other origin.
4. **Voice endpoints (CHECKED, OK).** Same-origin check at the top of
   the server applies to /api/voice/* too. Mic is never auto-started.
5. **Keys scan (CLEAN).** No hard-coded API keys, secrets, or passwords
   in the new voice code. Scan pattern: sk-*, ghp_*, AKIA*, password=,
   api_key=, client_secret=.

## Situations this code is built to survive
- Misheard risky command: approval gate pauses, head speaks the exact
  job, waits for "yes"/"no". No send/ship/pay/delete on a mishear.
- Free model loops: job guard narrows, retries once, escalates to Kevin.
- One agent crashes / stops: other screens keep running, stop is per-screen.
- Sandbox stream dies: agent pauses, does not run blind.
- Wake word collision: wake word is config, change one line, no retraining.
- Wrong branch: main is untouched. If voice branch breaks, main still runs.

## Live risks I cannot eliminate from here — need Kevin's PC to prove
1. **SPACE in WSL2 vs Hyper-V.** SPACE needs Linux + KVM. WSL2 may not
   provide KVM. If SPACE fails in WSL2, fallback is a Hyper-V Ubuntu VM
   with KVM, or Daytona. This is the biggest live unknown.
2. **SPACE's real CLI flags.** The WSL2 launch command in sandbox-host.cjs
   uses a plausible `space-agent start` form. If SPACE's actual CLI differs,
   that command must be corrected on the PC — it is one line, in one file.
3. **STT/TTS binaries.** Moonshine / Faster-Whisper and Piper must be
   installed and running on 127.0.0.1:8766 on his PC (HF realtime keeps 8765). This repo provides
   config + health logic, not the binaries themselves.
4. **Mic + Windows permissions.** Electron allows audio only, but Windows
   itself must grant the app mic access, and the mic must actually hear him.
5. **Free-model tool calling.** Guard limits damage, but a weak free model
   may still fail a multi-step job and escalate. That is expected, not a bug.

## What Pip needs from Kevin for the live run
1. His Windows PC, repo checked out on branch voice-control-v1.
2. Run apps/desktop/scripts/setup-wsl2-sandbox.ps1 as Administrator.
3. Install Moonshine (or Faster-Whisper) + Piper in WSL2, start them on
   127.0.0.1:8766. Tell Pip if that port is already in use.
4. Wake word choice: default is "robot" — tell Pip if he wants a different word.
5. A live test window: talk to the head, try "Outreach, draft outreach
   for London plumbers", "Show Outreach", "Stop Research", and a risky
   one like "send the batch" (expect it to pause and ask). Tell Pip what
   the head actually said and what each screen actually showed.
6. Tell Pip whether SPACE starts in WSL2, or errors — paste the error
   exactly. That decides WSL2 vs Hyper-V.
7. No passwords, keys, or tokens in chat, ever. None are needed for this run.
