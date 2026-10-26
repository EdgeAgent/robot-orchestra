# Robot Orchestra — Voice + Multi-Screen Sandbox — Reference Pack

**Repo, verified 2026-10-26:** https://github.com/EdgeAgent/robot-orchestra — PUBLIC, MIT, Electron/React, pnpm workspace, Windows x64 installer v0.6.0. It already has: draggable robot head + Ctrl+1 compact chat, Chat/Tasks/Feed/Ideas/Goals/Artifacts dock, Brain workspace, direct Ollama (127.0.0.1:11434) + Hermes/OpenRouter free delegation, bounded same-origin browser scans (10/25/50 pages), optional Hugging Face live-voice panel. It does NOT bundle Hermes, does NOT grant desktop-control permissions, and planning is suggestions-only. The voice wake-word + multi-screen sandbox + live browser control in this pack are the NEW layer to build on top of those existing routes — not a replacement app.

**Hand this file to whoever (or whatever agent) is building on Robot Orchestra.**
It is the complete reference: the best GitHub repos to use, the full framework,
the skill set for every agent, and the build order. Do not rebuild Orchestra.
Add voice, add multi-screen sandboxes, and wire them into what already exists.

**Identity rule:** This is Robot Orchestra. Not Jarvis. No Jarvis skin, no Jarvis
name, no Jarvis dashboard. The floating robot head chat UI you already have is
the partner face. Voice is a new front door on that same head.

**Model rule:** Brain is a placeholder for both.
`MODEL_GATEWAY = "openrouter" | "ollama"` — swap it in config, nothing else changes.
OpenRouter is usually free models, via Hermes. Ollama is local, private, offline.
Paid frontier via OpenRouter, capped, only for hard builds / reviews.

---

## 1. What Orchestra already is — do not rebuild this

- **Floating robot head + chat UI** — already built. This is the partner.
  Voice talks through this head, it does not replace it.
- **Hermes** — the engine / router. Routes jobs, runs lead-gen, watches replies.
- **Scout, Builder, Reviewer** — the specialist team in the desktop orchestra app.
- **Clockwork** — Boss + approval gate + memory skeleton (brain, loop, approval).
- **BrainScan** — context / memory layer. The Boss reads this before planning,
  so "do it like last time" actually means something.
- **Hermes lead-gen system** — a service the Boss calls, not something to merge in.

What is NEW in this pack:
1. Free, fast, open-source voice control, any wake word you want.
2. Multi-screen sandboxes — one live screen per agent, watchable in real time.
3. Voice routing by agent name — "Agent 1, do X", "Agent 2, research Y".
4. Live browser view per screen — see it open a browser, search, click, fill.

## 2. Architecture — one picture

```
You speak (any wake word you set)
        ↓
Robot Head (Boss / Partner) — floating head chat UI, voice in + voice out
        ↓  routes by name, or picks the right agent itself
┌──────────────┬──────────────┬──────────────┐
│ Agent 1      │ Agent 2      │ Agent 3      │
│ Screen 1     │ Screen 2     │ Screen 3     │
│ Sandbox VM   │ Sandbox VM   │ Sandbox VM   │
│ Live browser │ Live browser │ Live browser │
│ + terminal   │ + terminal   │ + terminal   │
│ + log        │ + log        │ + log        │
└──────────────┴──────────────┴──────────────┘
        ↓  results come back to the Boss
Boss summarises → you approve sends / ships → job done, log saved
```

Rules that never change:
- One sandbox per agent. No shared filesystem between agents unless the Boss
  explicitly passes a result.
- One approval = one agent, one action. Agent 1's approval does not cover Agent 2.
- Sends, ships, payments, deletes = always ask you first, by voice, exact action named.
- Reads, searches, local builds, tests = no approval needed.
- "Stop everything" halts all screens. "Stop Agent 2" halts only that screen.
- The never-contact-again (scrub) list is absolute and can never be learned away.
- Keys, passwords, wallets are never spoken out loud and never stored in transcripts.

## 3. Core repos — install these first (12)

These are the best, verified open-source repos for THIS mission, not a generic list.
Each one maps to exactly one job in the picture above.

### Voice — hear it, understand it, talk back

| Repo | Role in Orchestra | Why this one |
|---|---|---|
| `dscripka/openWakeWord` — Apache-2.0, ONNX, CPU | Wake word listener, always-on, low CPU | Pre-trained models for common phrases, plus custom training. Note: pre-trained model files themselves are CC BY-NC-SA — check before any commercial use. For instant any-word use, see the transcription-trigger method below, no training needed. |
| `SYSTRAN/faster-whisper` — MIT | Speech-to-text, local | CTranslate2 Whisper, fast on CPU or GPU. Tiny = 75 MB, Small = ~484 MB is the sensible default. The fallback if Moonshine does not fit a job. |
| `moonshine-ai/moonshine` / Moonshine Voice — MIT | Speech-to-text, fastest / lowest latency | On-device, streaming, works while you are still talking. Tiny models down to ~1 MB class, largest ~245M params, reported better than Whisper Large v3 on OpenASR at a fraction of the size. Use this first for live voice; Faster-Whisper is the backup. |
| `rhasspy/piper` — MIT original, now OHF-Voice fork (GPL) | Text-to-speech, local, fast | Neural TTS in ONNX, runs faster than real time even on a Pi, 35+ languages, CLI-simple. Original repo was archived Oct 2025 — use the Open Home Foundation fork for current development. |
| `rhasspy/wyoming` + `rhasspy/wyoming-faster-whisper` + `rhasspy/wyoming-openwakeword` | Voice plumbing | Peer-to-peer voice protocol (JSONL + PCM audio) that glues wake word → STT → TTS together without a cloud. This is how Home Assistant Voice does it, and it is the cleanest way to keep voice local. |
| Silero VAD | Voice activity detection | Only process real speech, ignore room noise. Without VAD, the STT burns CPU on silence and music. |
| `Vosk` (alphacep/vosk) | Ultra-light STT alternative | Small models, good for command words on weak hardware. Backup if Moonshine / Faster-Whisper is too heavy for a screen. |

**Any wake word, any agent name — how it actually works:**
- Config, one line each, no code change, no retraining to start:
  ```
  WAKE_WORD = "robot"          # any word you want
  AGENT_1_NAME = "Agent 1"     # or "Outreach", "Scout", anything
  AGENT_2_NAME = "Agent 2"     # or "Research"
  AGENT_3_NAME = "Agent 3"     # or "Builder"
  MODEL_GATEWAY = "openrouter" # or "ollama"
  ```
- Instant any-word method: run the tiny STT continuously and trigger when the
  transcript contains WAKE_WORD. Any word works immediately, no samples needed.
  Trade-off: more CPU than a dedicated wake-word model, still fine on a normal PC.
- Lowest-CPU method (later, optional): train one openWakeWord model for that
  exact word. Needs recordings of you saying it (100+ for working, 500+ for solid).
  You retrain per word — do this only if CPU actually becomes a problem.
- After the wake word: head wakes, listens for one command, reads back what it
  heard ("You said: Agent 1, do outreach for X — correct?"), routes it, speaks a
  short reply, goes back to listening.

### Orchestration — the Boss and the team

| Repo | Role in Orchestra | Why this one |
|---|---|---|
| `langchain-ai/langgraph` — MIT | Boss orchestration, state graph | Graph of nodes + edges, explicit shared state, durable checkpoints, human-in-the-loop pauses at any node, time-travel debugging. This is the production-grade Boss. Use it for routing, approvals, pause/resume, and rollback. Steeper learning curve than CrewAI — worth it for a system that sends and ships. |
| `crewai/crewai` — MIT | Role-based crews, fast prototype | Agents with roles + goals + tasks, sequential or hierarchical crews. Fastest path to a working multi-agent prototype when work splits cleanly into Researcher / Writer / Reviewer. Use it for a first version of a crew, then move the approval-critical paths to LangGraph. |
| `aaif-goose/goose` — Apache-2.0 | CLI agent worker (Builder / Runner) | Rust CLI + desktop + API, 15+ providers including Ollama and OpenRouter, 70+ MCP extensions, shareable recipes (YAML). Old repo `block/goose` redirects here. Use goose as the worker inside a sandbox: goal in, multi-step actions out, supervised. |
| `openclaw/openclaw` — MIT | Computer-control reference + gateway pattern | Self-hosted personal assistant, gateway on your machine, model-agnostic, skills via ClawHub. WARNING, and this matters: it grants broad system permissions by design, and third-party skills have had malicious packages — run it in a sandbox VM first, review every skill's source, never on your main machine with main accounts. Use it as the reference for "agent with hands", not as the host for your main accounts. |
| `microsoft/agent-framework` (successor to AutoGen + Semantic Kernel) | Alternative orchestration, if on Microsoft stack | Only if you are already on .NET / Azure. Otherwise LangGraph is the pick. AutoGen is in maintenance mode — do not start new work on it. |

### Live browser — see it work, on screen

| Repo | Role in Orchestra | Why this one |
|---|---|---|
| `browser-use/browser-use` — MIT, Python | Agent browser control, natural language | LLM → browser-use → Playwright → browser. Natural-language commands, vision, multi-tab, automatic element detection, any LLM provider, local Ollama supported. The most battle-tested open-source browser agent. This is the default for "Agent 2, research X" and "Agent 1, find leads". |
| `browserbase/stagehand` — MIT, TypeScript | Hybrid browser control, cheaper + more precise | Playwright + three primitives: `act("click submit")`, `extract("get total as number")`, `observe("what buttons are visible?")`. Deterministic code where precision matters, LLM where pages change. v3 adds action caching — repeat actions cost no LLM call. Use Stagehand when a workflow is repeatable and you want token cost down; use browser-use when the task is open-ended. |
| `microsoft/playwright` | Browser engine underneath both | The actual browser driver. Do not hand-roll browser control — browser-use and Stagehand both sit on Playwright. |
| `novnc/noVNC` + websockify + TigerVNC / x11vnc + Xvfb | Live screen streaming to your browser | This is how you WATCH a sandbox: virtual display (Xvfb) → VNC server → websockify → noVNC web client. No VNC client software needed, it opens in a normal browser tab. One noVNC view per agent screen. This is the "open up screens and see it do it" layer. |
| `jo-inc/camofox-browser` | Stealth / headed browser option | Playwright-compatible browser with built-in VNC view (`ENABLE_VNC=1`, noVNC on port 6080). Useful when a site blocks plain automation — use it only for sites you are authorised to automate, and never to evade a site's rules or access controls. |

### Sandbox — one disposable machine per agent

| Repo / tech | Role in Orchestra | Why this one |
|---|---|---|
| Perplexity SPACE — Apache-2.0, Rust, Firecracker microVMs | Production-grade sandbox, one VM per task | Open-sourced Oct 2026, the sandbox behind Perplexity Computer since July 2026. Each task gets its own Firecracker microVM, credentials and outbound traffic controlled from OUTSIDE the VM, HTTP API + server-sent events, snapshots / pause / resume. Red-team note, honestly: 0/108 host escapes, but early network-allowlist bypasses (11/54) — check TLS name + HTTP host, not just IP, on your allowlist. Requires Linux x86_64 + KVM, btrfs, Docker. No macOS host. |
| Firecracker (firecracker-microvm/firecracker) | MicroVM engine underneath SPACE | Lightweight VMs that boot in milliseconds. Use directly only if SPACE is too much — SPACE is the easier path. |
| `e2b` (code open, hosted service not $0 at scale) | Cloud sandbox alternative | Use only if you do not have a Linux KVM host. Local SPACE / Docker is $0; E2B hosted bills at scale. |
| `daytonai/daytona` | Dev-environment sandboxes | Good for coding agents (Builder) — reproducible dev sandboxes with snapshots. Alternative to SPACE for code-only agents. |
| Docker + gVisor | Lightweight isolation, NOT sufficient alone | Containers share the host kernel. Fine for trusted code, NOT sufficient for untrusted agent code or web agents that download things. Use VMs (SPACE / Firecracker) for browser + outreach agents; Docker is OK for a narrow, trusted Builder job only. |
| `ollama/ollama` | Local model runner, private fallback | CLI model runner, $0 API spend. Coder model 14B+ for reliable tool-calling; small 7B models break tool loops. This is the Ollama side of MODEL_GATEWAY. |
| `qdrant/qdrant` | Vector memory (already in BrainScan) | Long-term memory / RAG for the Boss. Keep it — do not replace BrainScan's memory with a new store. |
| `n8n-io/n8n` | Scheduled / webhook Runner (already yours) | Keep it as the Runner for scheduled jobs and webhooks. The Boss calls n8n, it does not replace the Boss. |
| `letta-ai/letta` | Long-term agent memory, optional | Stateful agents with persistent memory. Optional — only add if BrainScan + Qdrant are not enough for multi-week agent memory. |

### Nice-to-have voice / assistant references (do not install first)

- `OpenVoiceOS / Mycroft`, `Rhasspy / Wyoming`, `Home Assistant Voice` — full
  voice-assistant stacks. Use them as reference for wake → STT → intent → TTS
  plumbing, not as a replacement for Orchestra.
- `Kokoro-82M` (hexgrad/Kokoro-82M) — ultra-fast CPU TTS, 82M params, studio
  quality. Alternative to Piper if you want a different voice.
- `Coqui TTS` — note: XTTS v2 weights are non-commercial only. Check licence
  before any commercial voice cloning.
- `Bernstein` — deterministic CLI-agent orchestrator, git worktrees, pluggable
  sandboxes, experimental `--evolve` self-evolution. Closest to the self-improving
  requirement — keep any self-evolution gated behind the weekly approval loop
  (Section 7), never auto-applied.
- `smolagents`, `pydantic-ai`, `agno` — lightweight agent frameworks. Only if
  LangGraph feels too heavy for a single narrow agent.

## 4. Skill sets — what every agent must be able to do

A "skill" here = a named capability with tools, inputs, outputs, and guardrails.
Give each agent only the skills for its job. A narrow agent is reliable; a
general agent hallucinates.

### Boss / Partner Head (the robot head you talk to)
- **Skills:** Listen (wake + STT + confirm what it heard), Route (by agent name
  or by job type), Plan (break one command into ordered tasks), Summarise
  (all agents, one short spoken summary), Approve (voice yes/no, exact action
  named), Stop (one agent or all), Recall (BrainScan: "like last time").
- **Tools:** voice in/out, LangGraph graph, BrainScan memory, sandbox manager,
  approval gate, log reader.
- **Inputs:** your voice command, agent statuses, last results.
- **Outputs:** short spoken reply (1–2 sentences) + full written log.
- **Guardrails:** never sends/ships/pays/deletes without your yes. Never guesses
  when unsure — asks one question. Never speaks a key/password. Never skips the gate.

### Agent 1 — Outreach (example: "Agent 1, do outreach for X")
- **Skills:** Find leads (good reviews, no website, or your lead lists), Draft
  personalised email/DM (one clear question, no invented price/promise),
  Build demo (simple website template to attach), Track replies (yes / pricing /
  sample / call request → draft + flag, never invent answer).
- **Tools:** browser-use / Stagehand (live browser), lead lists, email drafts,
  scrub list (loaded before EVERY batch, absolute), sent-log (one person, one time).
- **Outputs:** drafts ready for batch approval, never sent without approval.
- **Guardrails:** scrub list can never be overridden. No duplicate sends. No
  price in first message unless you said so. No contact to a scrubbed address, ever.

### Agent 2 — Research (example: "Agent 2, research competitor markets")
- **Skills:** Search (browser, live, visible), Compare (competitors, pricing,
  positioning, reviews), Extract (structured data: name, price, offer, proof),
  Report (ranked findings with sources, what is verified vs. unverified).
- **Tools:** browser-use (open-ended research), Stagehand extract(), search,
  BrainScan memory.
- **Outputs:** competitor report with sources + confidence flags. Unverified
  claims are labelled unverified, never presented as fact.
- **Guardrails:** read-only. No sending, no contacting competitors, no account
  logins unless you explicitly approved that site and that account.

### Agent 3 — Builder (example: "Agent 3, build me a demo for X")
- **Skills:** Build (code, landing page, demo site), Test (run tests, report
  pass/fail honestly), Fix (own errors until tests pass or blocker reported),
  Review-handoff (what changed, what is untested).
- **Tools:** goose CLI, git, tests, sandbox filesystem.
- **Outputs:** working build + test report + change list.
- **Guardrails:** builds locally in its sandbox only. No ship/deploy without
  Reviewer pass + your approval. No production accounts from a Builder sandbox.

### Reviewer (runs on every build, before any ship)
- **Skills:** Receipt checklist — does it work, is it tested, does it match
  YOUR original request (not what the Builder felt like building), what is
  still unverified.
- **Guardrails:** cannot approve its own work. Approval is yours, via the Boss gate.

### Shipper (only after Reviewer pass + your approval)
- **Skills:** Commit, deploy, publish, verify live (actually responds), rollback
  on failure.
- **Guardrails:** no ship without review + approval. If live verification fails,
  roll back and report — never leave a half-shipped version live and quiet.

### Runner (scheduled / watch jobs)
- **Skills:** Run on schedule, watch logs, one safe retry, report started /
  finished / failed / needs you.
- **Guardrails:** safe failures (timeout, missing file) = one retry, then report.
  Unsafe failures (payment, send, publish, delete) = never auto-retry, stop and wait.

### Shared skills (all agents)
- **Log:** one log per job, plain language: command heard, plan, agent, result,
  approval given/denied. If it goes wrong, the log finds it in 30 seconds.
- **Memory:** every job writes outcome to BrainScan. Next time starts from evidence.
- **Screen:** every agent has a live screen (browser + terminal + log) you can
  open, watch, pause, and take over.

## 5. Floating head — full control, talking mouth, lights, smile (2026-10-26)

Kevin's clarification: the floating head is the controller. You talk to it, it
reacts, it answers you while its mouth moves, lights change, it smiles — it
does NOT need exact lip-sync, the mouth just needs to move while it talks.
And when you say "Agent 1", that agent's sandbox pops up.

**Head state machine — wire voice to the states that already exist in the repo:**
- `idle` — blinking, glancing, waiting for wake word.
- `listening` — alert eyes, live equaliser, steady green light, head cocked.
  Trigger: wake word heard, mic on.
- `thinking` — heavy-lidded eyes up, three pulsing dots, amber light.
  Trigger: Boss is planning / routing to an agent.
- `searching` / `working` — darting / focused eyes, cyan beacon / progress bar.
  Trigger: an agent is running a job in its sandbox.
- `speaking` — mouth moves / bobs as it talks, happy smile on success.
  Trigger: Boss / agent is speaking a reply. Mouth movement is driven by audio
  amplitude / simple bobbing, NOT phoneme lip-sync — that is explicitly good
  enough, per Kevin. Do not spend time on exact lip matching.
- `happy` — `^ ^` eyes + smile, bouncy hops. Trigger: job done, approval granted.
- `error` — red `X X` eyes, head shake, red light blinks. Trigger: job failed, blocked, needs you.
- `sleeping` — closed eyes, z's, light off. Trigger: no wake word for a while, or "go to sleep".

**Full control through the head — what "talk to it" means in practice:**
- Voice in → head goes `listening` → transcript confirmed → head goes `thinking`.
- Boss routes → head says the short answer, mouth moving, state `speaking`.
- "Agent 1" → head goes `working`, Agent 1's sandbox screen POPS UP (tile expands
  to full screen, live browser view on top, log underneath), head stays visible
  as the controller while you watch Agent 1 work.
- "Agent 2" → Agent 1's screen minimises back to a tile, Agent 2's screen pops up.
- "Show all agents" → tile view, head summarises each one, speaking, mouth moving.
- "Stop Agent 1" → that screen closes / pauses, head goes `happy` or `error`
  depending on outcome, and tells you what was stopped.
- Head is always on top, draggable, Ctrl+1 compact chat still works — voice does
  not replace typing, it is an additional front door on the same head.

**Do not build a new head.** The repo already has RobotHead with shapes
(rectangle / square / circle / hexagon), states, lights, antenna spring, and a
shared animation loop. Wire the voice pipeline to set `state` on that component.
That is the whole head job.

## 5a. Head takes control — everything by voice (2026-10-26)

Kevin's authority rule: the floating head is in charge. It controls the
computer and it delegates to the sub-agents. Everything is voice-controlled.

**Authority hierarchy — one chain, no sideways agents:**
```
Your voice
    ↓
Floating Head (Boss / Partner) — full controller
    ↓  delegates, by name or by job type
Sub-agents (Agent 1, Agent 2, Agent 3, …)
    ↓  each in its own sandbox screen
Computer work: browser, terminal, files, code, email drafts, research, builds
    ↓
Results back to Head → Head speaks the summary, mouth moving, lights on
```

**What "full control" means, concretely:**
- Head can open, run, pause, stop, and close any agent screen, by voice.
- Head can tell an agent to open a browser, search, click, fill, build, test,
  draft, and report — and you watch it on that agent's live screen.
- Head can run the computer work itself through those agents: no clicking
  through apps yourself, no typing commands yourself, unless you choose to.
- Voice is the primary interface for everything: wake word → command → head
  confirms → head delegates → head reports. Typing (Ctrl+1 chat) stays as a
  fallback, not the main way in.
- Delegation is explicit: "Agent 1, do X" goes to Agent 1, "do X" lets the Head
  pick, "all agents, status" gets a spoken summary from the Head.

**The one limit that stays, even with full control:**
- Full control does NOT mean no approvals. Sends, ships, payments, deletes,
  and touching a main account still pause and ask you, by voice, with the exact
  action named, before they run. That is the safety that lets full control be
  safe to leave running. Everything else — read, search, build, test, draft,
  open, watch — the Head just does, by voice, no extra click needed.
- Control runs in sandboxes first: each agent's computer is its sandbox VM.
  The Head controls those computers fully. Expanding a trusted agent to the
  main PC is a separate, explicit decision later — not the starting point.

## 5. Multi-screen spec — exactly what to build

**Screen model:**
- Boss screen: robot head, voice status, all-agents summary, approvals queue.
- Agent screen (one per agent): live browser/desktop view (noVNC) on top,
  terminal + log underneath, status pill (running / waiting / failed / done),
  job title, last log line, Stop / Pause / Take over / Expand buttons.
- Tile view: all agent screens as tiles, click a tile to expand to full screen.

**Voice routing grammar (implement this literally):**
- `[Agent name], [job]` → direct to that agent's screen.
  e.g. "Agent 1, do outreach for plumbers in London"
  e.g. "Agent 2, research competitor markets for AI agencies"
  e.g. "Agent 3, build a demo site for Bark And Purr"
- `[job]` (no name) → Boss picks the right agent by job type.
- `What are all agents working on?` → Boss summary, one line per agent.
- `Show Agent 2` → expand Agent 2's screen.
- `Pause Agent 1` / `Stop Agent 2` / `Stop everything` → as named.
- `Continue` → resume the paused agent from where it left off.

**Live view requirements:**
- Headed browser, not headless. You must be able to see it open a browser,
  type a search, click, and fill a form, in real time.
- Stream via noVNC (Xvfb + VNC + websockify) — one stream per agent screen.
- Pause = agent stops acting, screen freezes, you can take the mouse/keyboard.
- Take over = you drive that agent's browser yourself, log records the takeover,
  "continue" hands it back with your actions in its context.
- If an agent loops, stalls, or goes to the wrong site, you see it live and can
  intervene — you do not find out from a log after it finished wrong.

**Sandbox requirements, per screen:**
- One disposable VM/container per agent (SPACE / Firecracker preferred).
- Own filesystem, own CLI, own network allowlist, own job-scoped credentials.
- Snapshot before a risky step; rollback per screen only — resetting Agent 3
  does not touch Agent 1 or 2.
- Network allowlist checked on TLS name + HTTP host, not just IP (SPACE lesson).
- Short-lived credentials only. No master keys in any sandbox, ever.

## 6. Voice spec — fast and efficient, free

**Pipeline, in order, no step skipped:**
1. Mic → Silero VAD (speech or not?)
2. Wake word: openWakeWord OR transcription-trigger on WAKE_WORD (config).
   Head is deaf while it is speaking, so it cannot trigger itself.
3. Command capture: Moonshine (first choice) or Faster-Whisper Small.
   Confirm what it heard before acting. Low-confidence transcript = ask again, do not guess.
4. Boss routes (LangGraph) → agent screen → job runs in sandbox.
5. Short spoken reply via Piper (1–2 sentences). Full detail in log, not in your ear.
6. Back to wake-word listening.

**Latency targets (honest, not promised):**
- Wake → listening: under 1 second on a normal PC with openWakeWord / tiny STT.
- Command → confirmed transcript: a few seconds, depending on model size.
- Reply: Piper is faster than real time on CPU, so TTS is not the bottleneck.
- If latency is bad, shrink the STT model first (Tiny/Small), do not add a cloud API.

**Costs, honestly:**
- Licences for everything in Section 3: $0.
- Hardware: a normal PC runs voice + 2–3 sandboxes; GPU helps for larger models
  and faster STT, it is not required for Tiny/Small.
- Model spend: $0 if you stay on OpenRouter free + Ollama local. Paid frontier
  via OpenRouter, capped, only for hard builds/reviews — typical light use
  $10–30/mo, heavier $30–70/mo, heavy $100–150+ (community estimates, not a quote).
- Free-model limits: rate limits, rotation, weaker tool-calling. Mitigation:
  narrow jobs, retry once on a different free model, then escalate — never loop forever.

## 7. Self-learning — safe version only

- Weekly loop, ONE rule change at a time, with journal evidence, your voice
  approval, versioned, rollback after two worse weeks.
- What it CAN learn: which templates get replies, which prompts produce clean
  code, which times/channels work, better targeting.
- What it can NEVER self-edit (immutable core): approval gate, scrub list,
  one-person-one-time, send cap, keys/passwords/wallets/main accounts, safety
  rules, kill switch, logging, no impersonation. If it tries, the job stops and flags you.

## 8. Build order — milestones, with pass criteria

**M0 — Boss typed, no voice, no screens.**
Typed command → Boss → Scout → Builder → Reviewer, approval prompt, log.
Pass: a typed job works end to end. If this fails, voice will only make it worse.

**M1 — Voice on the head, one agent.**
Mic → tiny STT → text in head chat. Add WAKE_WORD config + push-to-talk fallback.
Add Piper short replies. Wire Build / Review / Ship / Run / Log / Stop everything.
Pass: you can say "Build X, review it, show me the log" and it works, nothing
ships without your yes.

**M2 — Multi-screen, three agents, live view.**
Boss + Agent 1 + Agent 2 + Agent 3, each in its own sandbox, each with a live
noVNC screen, voice routing by name.
Pass: "Agent 1, do outreach", "Agent 2, research competitors", "Agent 3, build
a demo" all run in parallel, you can watch each screen, and "Stop Agent 2"
stops only Agent 2.

**M3 — Live browser jobs, end to end.**
Agent 1 outreach drafts (approved batch only), Agent 2 competitor report
(with sources + verified/unverified flags), Agent 3 demo site (tested, reviewed).
Pass: drafts are ready, report is sourced, demo passes tests, nothing sent or
shipped without approval, logs tell the whole story in under a minute per job.

**M4 — Sandbox hardening + learning loop.**
Per-screen snapshot/rollback, network allowlist (TLS + host), job-scoped keys,
weekly ONE-rule-change loop on one job only.
Pass: resetting one agent does not touch the others; a bad rule change rolls back.

**M5 — Scale past three agents.**
Only after M2–M4 run clean for two weeks. More screens is easy — more approvals
is where it gets messy, so keep the Boss gate in the middle.

## 9. First test — run this, in this order

1. You: "Agent 1, do outreach for [one business type, one city]"
   → Agent 1 screen: browser opens, leads found, drafts written, waits for approval.
2. You: "Agent 2, research competitor markets for [same niche]"
   → Agent 2 screen: browser searches, competitors compared, report with sources.
3. You: "Agent 3, build a demo site for [one lead from Agent 1]"
   → Agent 3 screen: site built, tests run, Reviewer checks it.
4. You: "What are all agents working on?"
   → Boss: one line per agent, nothing shipped, drafts ready for your batch approval.
5. You: approve or reject each piece, by voice, one at a time.

If any step fails, fix that layer before adding more agents, more screens, or
more autonomy. A smaller job, a clearer template, or a better approval step
beats "more autonomy" every time.

## 10. What NOT to do

- Do not rebrand this as Jarvis, do not build a Jarvis dashboard, do not put a
  Jarvis face on Orchestra. Robot head, Orchestra name, always.
- Do not run OpenClaw or any broad-permission agent on your main machine with
  main accounts. Sandbox VM first, every time.
- Do not let a voice agent auto-send, auto-ship, or auto-pay because a demo
  made it look smooth. The approval gate is the whole point.
- Do not use a VPN or a workaround to evade a platform's Ontario / regional
  restriction, and do not use an agent to evade a site's access controls.
- Do not copy a demo's claims about speed, cost, or results — test them with
  the first test in Section 9.
- Do not give the system your main accounts or wallets. Small, separate scope
  first, expand only after it earns trust.
- Do not treat a free model as reliable: narrow jobs, one retry, then escalate.
- Do not let learned rules override the scrub list, the approval gate, or the
  one-person-one-time rule. Ever.

---

## 11. Voice controls EVERYTHING — not just the multi-screen view (2026-10-26)

Kevin's correction, and it is important: multi-screen is NOT the product.
Multi-screen is just where you WATCH. Voice is the control layer for
everything. The head controls itself, does things, and calls / delegates to
other agents — by voice, end to end.

**What voice controls, in full:**
- The head itself: wake, sleep, listen, speak, pause, resume, stop everything,
  change model route (Ollama / OpenRouter), change wake word / agent names
  in config, report status.
- The computer: open browser, search, click, fill, build, test, draft, run,
  watch logs, open files, save artifacts — through its agents, in sandboxes.
- The agents: spawn / start an agent, name it, give it a job, check on it,
  pause it, stop it, restart it, hand it a result from another agent.
- Delegation: Head → Agent 1 (outreach) → Agent 2 (research) → Agent 3
  (build) → back to Head, in one spoken chain, without you clicking between
  steps. Example: "Head, find me 10 leads, research their competitors, and
  build a demo for the best one" — Head splits it, delegates, tracks it,
  and reports back, asking approval only for sends / ships.
- Itself: Head can self-manage within its rules — retry a safe failure once,
  switch to a different free model if one rate-limits, snapshot / rollback a
  sandbox, pause an agent that loops, and propose ONE learned rule change
  per week for your approval. Self-control does NOT include self-permission:
  it cannot approve its own sends, ships, payments, deletes, or edit its
  immutable core (approval gate, scrub list, keys, kill switch, logging).

**If a feature is not voice-controllable, it is not done.**
That is the test for every milestone: can Kevin do it by talking to the head,
with no mouse, no typing, no dashboard clicking, except for the explicit
voice approval ("yes, send that batch") and the typed fallback when voice
fails? If the answer is no, that feature is unfinished, even if its screen
looks good. Screens are for watching, voice is for controlling.

## 12. The app IS the desktop environment — main head is the main agent (2026-10-26)

Kevin's architecture, in his words as understood: the main chat head IS the
main agent, and the app itself IS the desktop / desktop environment that the
agents live and work in.

**That means, concretely:**
- Main Head = Main Agent (Boss). One head, one boss, one voice you talk to.
  It does not just chat — it controls, delegates, and reports.
- The Orchestra app = the desktop environment. Not a chat window sitting on
  top of Windows — a workspace where agents open their own apps, browsers,
  terminals, and files, inside their own sandboxes.
- Each sub-agent gets its own desktop inside that environment: its own
  browser window, its own terminal, its own apps, visible as its own screen.
  When you say "Agent 1", that agent's desktop pops up, and you watch it
  open a browser, search, click, build — inside the Orchestra desktop, not
  scattered across your main Windows desktop.
- Calling a browser = the agent opening a browser in its sandbox desktop.
  Calling an app = the agent opening that app in its sandbox desktop.
  The Head coordinates which agent opens what, and you see it happen live
  on that agent's screen.
- Your main Windows desktop stays clean: the mess, the browsers, the builds,
  the retries all happen inside Orchestra's desktop environment, in
  sandboxes, until the Head brings you a finished result to approve.

## 13. Loose ends and gaps — closed, end to end (2026-10-26)

This section exists because Kevin said: give it a whole end, tie up any loose
ends and gaps. Nothing below is left as "figure it out later" without a named
owner and a default.

**1. Repo vs. local — gap closed.**
- Repo snapshot (GitHub, 2 commits, Oct 19) is BEHIND Kevin's local app.
- Default: this branch is based on the repo snapshot, on a NEW branch
  `docs/voice-multi-screen`, never on `main`, so it cannot overwrite local work.
- Merge checklist before this branch ever merges to `main`: (a) Kevin pushes
  local updates to a branch, (b) rebase this docs branch on that, (c) re-check
  head states, voice protocol, and desktop main.cjs against the new local code,
  (d) only then merge. If local and repo diverge on a file, local wins.

**2. Voice already exists in the repo — do not duplicate it.**
- Repo already has: `site/src/voice-protocol.mjs` + HF live-voice panel +
  `apps/desktop/test/voice-protocol.test.mjs` (`ask_robot_orchestra` tool,
  24kHz PCM, explicit client response, loopback endpoint by default).
- Gap closed: the new voice layer does NOT replace that panel on day one.
  It ADDS: always-on wake-word listener → transcript → confirm → route to the
  EXISTING voice protocol / task tool. HF panel stays as the manual Talk-button
  fallback until wake-word voice passes M1 tests, then HF becomes optional.
- Mic rule stays: mic is never started on launch. Wake-word listening starts
  only after Kevin enables voice in settings, and the head shows `listening`
  state while it is on, so there is never a silent mic.

**3. Desktop control — the permission gap, closed explicitly.**
- Current repo boundary: app does NOT bundle Hermes, does NOT grant
  desktop-control permissions, planning is suggestions-only, browser scans are
  bounded and opt-in.
- New layer changes that boundary ON PURPOSE, and only in this order:
  (a) sandbox VMs first — full control inside sandboxes, (b) browser control
  inside those sandboxes, (c) main-PC control NEVER by default, only if Kevin
  explicitly enables a "main PC control" toggle, per agent, with a visible
  banner while it is on. No agent gets main-PC control from a sandbox job
  automatically, and no approval gate bypass comes with that toggle.

**4. Sandbox on Windows — the host gap, closed.**
- SPACE (Firecracker) requires Linux x86_64 + KVM. It does NOT run directly
  on a Windows host. That is a real gap for a Windows desktop app.
- Default for Windows: run the sandbox host in WSL2 (Linux + KVM where
  available) or in Hyper-V VMs, with SPACE inside that Linux host. If KVM is
  not available, fall back in this order: Daytona dev sandboxes → Docker
  containers for trusted code only → do NOT run untrusted browser agents
  in a plain container and call it a sandbox.
- Live view on Windows: noVNC stream from the sandbox host (WSL2 / VM) to
  the Electron dashboard, one stream per agent screen. If a stream fails,
  the agent pauses — it does not run blind.

**5. Model gateway — the free-model gap, closed.**
- Ollama route: direct, local, no Hermes, no delegates. Use it for private
  work and for planning that must stay local.
- Hermes/OpenRouter route: delegated, Scout/Builder/Reviewer, free models
  via `openrouter/free` or zero-price list. Free catalog changes — the app
  must re-check the catalog at start and show "no zero-price model available"
  honestly, instead of silently falling back to a paid model.
- `MODEL_GATEWAY` placeholder is the config, not a promise: if neither route
  has a usable model, the head says so and waits — it does not fake a reply.

**6. Agent names, wake word, and job types — no fixed names.**
- Defaults in config, changeable in one line each: `WAKE_WORD`, `AGENT_1_NAME`,
  `AGENT_2_NAME`, `AGENT_3_NAME`. No name is hard-coded in code that would
  require a rebuild to change.
- Voice routing grammar is in Section 5 and is the contract: name-first =
  direct, no name = Boss picks, "show / pause / stop" = screen control.
  If a name is ambiguous (two agents with the same name), the head asks
  which one — it does not guess.

**7. Approvals, scrub list, and keys — already covered, restated as a checklist.**
- Before ANY send/ship/pay/delete: voice approval, exact action named, one
  agent, one action, logged.
- Before EVERY outreach batch: scrub list loaded, sent-log checked,
  one-person-one-time, no price/promise invented.
- Keys: never spoken, never in transcripts, never in sandbox files beyond a
  short-lived job-scoped credential. Main accounts are outside sandboxes.

**8. Testing — no new layer without tests.**
- Existing tests to keep passing: `apps/desktop/test/*.test.cjs`,
  `voice-protocol.test.mjs`, browser-extension crawler tests.
- New tests to add with the voice layer: wake-word trigger (word present /
  absent), transcript confirm (low confidence = ask again), routing by name
  (Agent 1 vs Agent 2 vs no name), head state transitions
  (idle → listening → thinking → speaking → idle), per-screen stop
  (stopping Agent 2 does not stop Agent 1), approval gate (send without
  approval is refused, logged).
- A milestone does not pass on a demo video or a log line. It passes on
  the test in Section 9, run end to end.

**9. Install / build — no hidden steps.**
- Repo build: `pnpm install`, `pnpm run dev` (playground), `pnpm run build`,
  `pnpm run typecheck`, desktop via `npm install --prefix apps/desktop` /
  `npm start --prefix apps/desktop`, Windows installer via desktop dist script.
- Windows installer is unsigned — SmartScreen warning is expected, per repo
  README. Browser extension is unpacked developer-mode only until store
  listings are published. Do not promise a store install that does not exist.
- New voice dependencies (openWakeWord, Moonshine / Faster-Whisper, Piper,
  Wyoming) are local installs on the PC / in WSL2, not bundled in the
  installer on day one. Bundle them only after M1 passes.

**10. What is still Kevin's decision (not a gap, a choice).**
- Wake word: any word he wants, config only — no default imposed here.
- Agent names: Agent 1/2/3 placeholders, or Outreach / Research / Builder.
- Sandbox host on his PC: WSL2 + SPACE (preferred) vs Hyper-V vs Daytona.
- When to push local updates and merge this docs branch to `main`.
- Whether main-PC control ever gets enabled — default is NO, sandbox only.

**End-to-end check — if all of Section 11 is true, the pack is whole:**
Voice wakes the head → head listens, thinks, speaks with a moving mouth →
head routes by name → agent screen pops up → agent works live in its sandbox
browser → head summarises → you approve or stop by voice → log records it →
next job starts from BrainScan memory. No step in that chain is unwritten,
unowned, or left to a demo.

---

**Source files this pack builds on:**
- `voice-cli-agent-orchestrator-framework.md` — the framework, 95% version,
  voice layer, multi-screen layer, live browser layer.
- `voice-computer-stack-free-repos.md` — the full repo list by layer.
- This file — the hand-off reference: best repos + full skill sets + build order,
  ready to give to Robot Orchestra to make it happen.
