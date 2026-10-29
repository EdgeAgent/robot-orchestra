// Chat-dock cleanup: presentation helpers only. No model, routing,
// approval, or loopback behaviour is tested here because none changed.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const { join } = require("node:path");

let helpers;
test.before(async () => {
  helpers = await import(
    pathToFileURL(join(__dirname, "..", "..", "..", "site", "src", "companion-helpers.mjs")).href
  );
});

test("long model id truncates to one short line, short ids unchanged", () => {
  const long = "nvidia/nemotron-3-ultra-550b-a55b:free";
  const short = helpers.truncateModelId(long);
  assert.ok(short.length <= 36, short);
  assert.ok(short.endsWith("…"), short);
  assert.ok(long.startsWith(short.slice(0, 10)));
  assert.equal(helpers.truncateModelId("openrouter/free"), "openrouter/free");
  assert.equal(helpers.truncateModelId(""), "");
});

test("free-only filter keeps zero-price models, drops paid and partial", () => {
  const out = helpers.filterFreeModels([
    { id: "a:free", pricing: { prompt: "0", completion: "0" } },
    { id: "b:paid", pricing: { prompt: "0.01", completion: "0" } },
    { id: "c:half", pricing: { prompt: "0", completion: "0.02" } },
    { id: "d:no-price", pricing: {} },
  ]);
  assert.deepEqual(out, ["a:free"]);
  assert.deepEqual(helpers.filterFreeModels(null), []);
});

test("model source: ollama: is local, everything else is free", () => {
  assert.equal(helpers.modelSource("ollama:llama3.1"), "local");
  assert.equal(helpers.modelSource("openrouter/free"), "free");
  assert.equal(helpers.modelSource("nvidia/nemotron-3-ultra-550b-a55b:free"), "free");
  assert.equal(helpers.modelSource(""), "free");
});

test("adapter connect message is detected, ordinary messages are not", () => {
  assert.equal(
    helpers.isAdapterConnectMessage(
      "Open Robot Orchestra and connect your local Hermes adapter first.",
    ),
    true,
  );
  assert.equal(helpers.isAdapterConnectMessage("Hey, I'm Hermes."), false);
  assert.equal(helpers.isAdapterConnectMessage(null), false);
});

test("empty-Ollama hint names Ollama install and a pull, and starts no action", () => {
  const hint = helpers.ollamaEmptyHint();
  assert.match(hint, /ollama pull/);
  assert.match(hint, /Detect|tap Local/i);
  assert.doesNotMatch(hint, /key|token|password/i);
});
