const OLLAMA_ORIGIN = "http://127.0.0.1:11434";
const MODEL_PREFIX = "ollama:";
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,179}$/;

function connectionError(action, cause) {
  if (cause?.name === "TimeoutError" || cause?.name === "AbortError")
    return new Error(`Ollama ${action} timed out. The model may still be loading; try again in a moment.`);
  return new Error(`Could not reach Ollama at 127.0.0.1:11434 while ${action}. Start Ollama and try again.`);
}

function parseModelChoice(value) {
  if (typeof value !== "string" || !value.startsWith(MODEL_PREFIX)) return null;
  const name = value.slice(MODEL_PREFIX.length);
  return MODEL_NAME.test(name) ? name : null;
}

function toModelChoice(name) {
  if (typeof name !== "string" || !MODEL_NAME.test(name)) return null;
  return `${MODEL_PREFIX}${name}`;
}

async function listOllamaModels(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new Error("HTTP fetch is unavailable.");
  let response;
  try {
    response = await fetchImpl(`${OLLAMA_ORIGIN}/api/tags`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      redirect: "manual",
    });
  } catch (error) {
    throw connectionError("checking installed models", error);
  }
  if (!response.ok)
    throw new Error(`Ollama is not responding at 127.0.0.1:11434 (HTTP ${response.status}).`);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Ollama returned an unreadable model list.");
  }
  if (!Array.isArray(payload?.models))
    throw new Error("Ollama returned an invalid model list.");
  return [...new Set(payload.models
    .map((entry) => toModelChoice(String(entry?.name || "")))
    .filter(Boolean))];
}

async function chatOllama(modelChoice, messages, fetchImpl = globalThis.fetch) {
  const model = parseModelChoice(modelChoice);
  if (!model) throw new Error("Select a valid installed Ollama model.");
  const installed = await listOllamaModels(fetchImpl);
  if (!installed.includes(modelChoice))
    throw new Error(`Ollama model “${model}” is not installed. Refresh the local model list and choose an installed model.`);
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 28)
    throw new Error("The Ollama conversation is invalid or too long.");
  const safeMessages = messages.map((message) => {
    const role = ["system", "user", "assistant"].includes(message?.role)
      ? message.role
      : null;
    const content = typeof message?.content === "string"
      ? message.content.slice(0, 24000)
      : "";
    if (!role || !content.trim()) throw new Error("The Ollama conversation contains an invalid message.");
    return { role, content };
  });
  let response;
  try {
    response = await fetchImpl(`${OLLAMA_ORIGIN}/api/chat`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: safeMessages, stream: false }),
      signal: AbortSignal.timeout(120000),
      redirect: "manual",
    });
  } catch (error) {
    throw connectionError("running the local chat", error);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Ollama returned an unreadable chat response.");
  }
  if (!response.ok)
    throw new Error(String(payload?.error || `Ollama returned HTTP ${response.status}.`).slice(0, 500));
  const answer = payload?.message?.content;
  if (typeof answer !== "string" || !answer.trim())
    throw new Error("The local model returned an empty answer.");
  return answer.trim().slice(0, 12000);
}

module.exports = { OLLAMA_ORIGIN, parseModelChoice, toModelChoice, listOllamaModels, chatOllama };
