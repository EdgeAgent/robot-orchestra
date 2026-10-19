const assert = require("node:assert/strict");
const {
  OLLAMA_ORIGIN,
  parseModelChoice,
  toModelChoice,
  listOllamaModels,
  chatOllama,
} = require("../ollama-client.cjs");

(async () => {
  assert.equal(parseModelChoice("ollama:qwen2.5:7b"), "qwen2.5:7b");
  assert.equal(parseModelChoice("openrouter/free"), null);
  assert.equal(parseModelChoice("ollama:"), null);
  assert.equal(toModelChoice("qwen2.5:7b"), "ollama:qwen2.5:7b");
  assert.equal(toModelChoice(""), null);

  const calls = [];
  const mockFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === `${OLLAMA_ORIGIN}/api/tags`)
      return new Response(JSON.stringify({ models: [
        { name: "qwen2.5:7b" },
        { name: "llama3.2:3b" },
        { name: "invalid model name" },
      ] }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (String(url) === `${OLLAMA_ORIGIN}/api/chat`)
      return new Response(JSON.stringify({ message: { role: "assistant", content: "A local answer." } }), { status: 200, headers: { "Content-Type": "application/json" } });
    throw new Error(`Unexpected outbound URL: ${url}`);
  };

  const models = await listOllamaModels(mockFetch);
  assert.deepEqual(models, ["ollama:qwen2.5:7b", "ollama:llama3.2:3b"]);
  assert.equal(calls[0].url, `${OLLAMA_ORIGIN}/api/tags`);
  assert.equal(calls[0].init.redirect, "manual");

  const answer = await chatOllama("ollama:qwen2.5:7b", [
    { role: "system", content: "You are a local assistant." },
    { role: "user", content: "Answer locally." },
  ], mockFetch);
  assert.equal(answer, "A local answer.");
  const chatCall = calls.at(-1);
  assert.equal(chatCall.url, `${OLLAMA_ORIGIN}/api/chat`);
  assert.equal(chatCall.init.redirect, "manual");
  const payload = JSON.parse(chatCall.init.body);
  assert.equal(payload.model, "qwen2.5:7b");
  assert.equal(payload.stream, false);
  assert.equal(payload.tools, undefined, "The local model must not receive orchestration tools.");

  await assert.rejects(
    chatOllama("ollama:not-installed", [{ role: "user", content: "No send." }], mockFetch),
    /not installed/,
  );
  const beforeInvalid = calls.length;
  await assert.rejects(
    chatOllama("ollama:bad model", [{ role: "user", content: "No send." }], mockFetch),
    /valid installed Ollama model/,
  );
  assert.equal(calls.length, beforeInvalid, "Invalid model choices must fail before any request.");
  await assert.rejects(
    listOllamaModels(async () => { throw new Error("fetch failed"); }),
    /Could not reach Ollama at 127\.0\.0\.1:11434/,
  );
  assert.ok(calls.every(({ url }) => url.startsWith("http://127.0.0.1:11434/")));
  console.log("PASS: Ollama local model discovery, loopback-only routing, safe message validation, non-streaming chat and unavailable-model refusal.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
