import assert from "node:assert/strict";
import test from "node:test";
import {
  createFunctionOutput,
  createTaskFollowupResponseRequest,
  createTaskResponseRequest,
  createVoiceSessionUpdate,
  float32FromPcm16Base64,
  normalizeVoiceEndpoint,
  pcm16Base64FromFloat32,
} from "../../../site/src/voice-protocol.mjs";

test("voice endpoint defaults to the local HF Realtime path and rejects insecure remote sockets", () => {
  assert.equal(normalizeVoiceEndpoint("127.0.0.1:8765"), "ws://127.0.0.1:8765/v1/realtime");
  assert.equal(normalizeVoiceEndpoint("wss://voice.example.test/v1/realtime"), "wss://voice.example.test/v1/realtime");
  assert.throws(() => normalizeVoiceEndpoint("ws://voice.example.test/v1/realtime"), /use wss/i);
  assert.throws(() => normalizeVoiceEndpoint("ws://user:pass@127.0.0.1:8765"), /credentials/i);
  assert.throws(() => normalizeVoiceEndpoint("https://127.0.0.1:8765"), /WebSocket/i);
});

test("voice session exposes one selected-model task tool and waits for an explicit client response", () => {
  const update = createVoiceSessionUpdate();
  const session = update.session;
  assert.equal(session.audio.input.format.rate, 24000);
  assert.equal(session.audio.output.format.rate, 24000);
  assert.equal(session.audio.input.turn_detection.create_response, false);
  assert.equal(session.tool_choice, "required");
  assert.deepEqual(session.tools.map((tool) => tool.name), ["ask_robot_orchestra"]);
  assert.match(session.tools[0].description, /Ollama.*Hermes\/OpenRouter/);
  assert.equal(createTaskResponseRequest().response.tool_choice, "required");
  assert.equal(createTaskFollowupResponseRequest().response.tool_choice, "none");
});

test("function output uses the HF Realtime tool result event shape", () => {
  assert.deepEqual(createFunctionOutput("call-1", { ok: true, text: "delegated" }), {
    type: "conversation.item.create",
    item: { type: "function_call_output", call_id: "call-1", output: "{\"ok\":true,\"text\":\"delegated\"}" },
  });
});

test("PCM16 conversion downsamples microphone data and round-trips bounded audio samples", () => {
  const source = new Float32Array([-1, -0.5, 0, 0.5, 1, 1, 1, 1]);
  const encoded = pcm16Base64FromFloat32(source, 48000, 24000);
  const decoded = float32FromPcm16Base64(encoded);
  assert.equal(decoded.length, 4);
  assert.ok(Math.abs(decoded[0] + 0.75) < 0.0001);
  assert.ok(Math.abs(decoded[1] - 0.25) < 0.0001);
  assert.equal(decoded[2], 1);
  assert.equal(decoded[3], 1);
  assert.equal(float32FromPcm16Base64("!").length, 0);
});
