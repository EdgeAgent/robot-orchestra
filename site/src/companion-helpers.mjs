// Robot Orchestra companion dock — presentation helpers only.
//
// These functions change how text is SHOWN, never what is stored, sent,
// or routed. Model values, prices, approval, and loopback rules are
// untouched: a truncated label still carries the full model id as its
// value, and the full id is always available on hover / tap (title).

// Shorten a long model id for one line, e.g.
// "nvidia/nemotron-3-ultra-550b-a55b:free" -> "nvidia/nemotron-3-ultra-550b-a55b…"
// Full id is unchanged; callers put it in `title`.
export function truncateModelId(id, maxLength = 36) {
  if (typeof id !== "string") return "";
  if (id.length <= maxLength) return id;
  if (maxLength < 2) return "…";
  return `${id.slice(0, maxLength - 1)}…`;
}

// Same zero-price rule the dock already uses for OpenRouter lists:
// both prompt and completion prices must be exactly zero.
export function isZeroPriceModel(entry) {
  return (
    Number(entry?.pricing?.prompt) === 0 &&
    Number(entry?.pricing?.completion) === 0
  );
}

export function filterFreeModels(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(isZeroPriceModel).map((entry) => entry.id).filter(Boolean);
}

// Guidance text only, shown when Ollama answers but has no models.
// No install, pull, or connection is started by this text.
export function ollamaEmptyHint() {
  return "Ollama is running, but no local models are installed yet. Install Ollama, then run: ollama pull llama3.1 — then tap Local again to detect it.";
}

// The orange system message in the photo is a feed message, not a
// separate banner. It is actionable only if it names the adapter;
// the one-tap action reuses the dashboard button that already exists
// (dashboard -> Bridge setup). Nothing auto-connects or tests here.
export function isAdapterConnectMessage(text) {
  return (
    typeof text === "string" &&
    text.includes("connect your local Hermes adapter")
  );
}

// Segmented Free / Local control state, derived from the saved model
// value. "ollama:…" means Local is active; everything else is Free
// (OpenRouter, including openrouter/free). No routing change.
export function modelSource(model) {
  return typeof model === "string" && model.startsWith("ollama:")
    ? "local"
    : "free";
}
