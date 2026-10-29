# Website card draft — DO NOT PUBLISH YET (draft only, 2026-10-29)

Target: https://edgeagent.github.io/ — Robot Orchestra flagship card only.
Style: profile-level, static, no animation. Do not list his other projects in this card.

## Card — copy ready

**Robot Orchestra**
Local-first Windows multi-agent desktop copilot.
Draggable robot head, chat dock, Brain workspace, Ollama + Hermes/OpenRouter free models.

- **v0.6 shipping** — Download the Windows installer via GitHub Releases:
  https://github.com/EdgeAgent/robot-orchestra/releases/latest
- **Voice + multi-screen — $8.99/month extension, in development, not yet released**
  Branch: `chat-dock-cleanup` on GitHub (review branch, not main, not a release).
  Talk to the head, delegate by name, watch each agent on its own screen,
  approval gate always asks before send / ship / pay / delete.
- **New in this branch:** larger chat-first dock (520×780), truncated model picker
  with segmented Free / Local control, collapsible NEXT MOVE, transparent
  floating head — circle only, no square window behind it.
- **Also on the separate extension branch** (`voice-split-screen-extension`, unmerged):
  click the head to listen / hear a reply again, and right-click a page →
  Scan page to Brain (preview first, confirm to save). These are NOT in the
  `chat-dock-cleanup` branch yet — do not present them as shipped.

**View on GitHub:** https://github.com/EdgeAgent/robot-orchestra

## What this card deliberately does NOT say

- It does NOT call Voice 0.7 “released” or “coming soon” without a date.
  It says: extension, $8.99/month, in development, not yet released.
- It does NOT promise a payment / checkout flow. No payment system exists yet
  for the $8.99 extension — do not invent one, do not link a checkout.
- It does NOT claim a live Windows run, real mic, WSL2 + SPACE, or real noVNC
  proof. Those are still unproven and are listed as blockers below.
- It does NOT add a direct download button for the extension. The only
  download is the v0.6 installer via GitHub Releases, which already exists.

## Production blockers, in order (not for the public card)

1. Windows site build proof: `pnpm --dir site run build` — clears the
   local-api 503 “UI not built” failure in this VM.
2. Real mic + Moonshine/Piper on 127.0.0.1:8766 + HF realtime on 8765,
   with no port collision, on a real Windows PC.
3. WSL2 + SPACE + KVM proof, or Hyper-V / Daytona fallback; real noVNC
   stream on a voice job start.
4. Browser agent inside a sandbox (browser-use / Stagehand / Playwright)
   is NOT wired — “watch it browse live” is designed, not demonstrated.
5. Installer rebuild for any 0.7 release — desktop package is still 0.6.0.
6. $8.99/month pricing / payment flow — no payment system exists yet.
7. Dead end left in this branch: side-panel “Save scan to local Brain”
   sends `browser-save-scan`, which the native host does not handle.
   The working scan-to-Brain path lives on the separate extension branch.
