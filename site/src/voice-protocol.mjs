const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function normalizeVoiceEndpoint(input) {
  const value = String(input || "").trim();
  if (!value) throw new Error("Enter your Hugging Face speech-to-speech server URL.");
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `ws://${value}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("That server URL is not valid.");
  }
  if (!["ws:", "wss:"].includes(url.protocol)) {
    throw new Error("Use a WebSocket address beginning with ws:// or wss://.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Credentials and query strings are not allowed in the saved voice URL.");
  }
  if (url.protocol === "ws:" && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error("For a remote server, use wss://. Plain ws:// is allowed only on this PC.");
  }
  if (url.pathname === "/" || !url.pathname) url.pathname = "/v1/realtime";
  return url.toString();
}

export const ORCHESTRA_VOICE_TOOL = Object.freeze({
  type: "function",
  name: "ask_robot_orchestra",
  description: "Forward the user's spoken task to Robot Orchestra's selected model route (direct local Ollama or Hermes/OpenRouter delegation). Do not perform the task yourself.",
  parameters: {
    type: "object",
    properties: {
      task: { type: "string", minLength: 1, maxLength: 8000 },
    },
    required: ["task"],
    additionalProperties: false,
  },
});

export function createVoiceSessionUpdate() {
  return {
    type: "session.update",
    session: {
      type: "realtime",
      instructions: "You are the voice interface for Robot Orchestra. For every user turn, call ask_robot_orchestra exactly once with the user's complete request. The tool routes through the selected task model, either direct local Ollama or Hermes/OpenRouter delegation. Do not answer, browse, or perform other work yourself. After the tool returns, speak a concise, faithful summary of its result. If the tool returns an error, explain it clearly. Never claim a task was completed unless the selected route reports it.",
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 24000 },
          transcription: { model: "whisper-1" },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 650,
            create_response: false,
            interrupt_response: true,
          },
        },
        output: { format: { type: "audio/pcm", rate: 24000 } },
      },
      tools: [ORCHESTRA_VOICE_TOOL],
      tool_choice: "required",
    },
  };
}

export function createTaskResponseRequest() {
  return { type: "response.create", response: { tool_choice: "required" } };
}

export function createTaskFollowupResponseRequest() {
  return { type: "response.create", response: { tool_choice: "none" } };
}

export function createFunctionOutput(callId, output) {
  return {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: String(callId),
      output: typeof output === "string" ? output : JSON.stringify(output),
    },
  };
}

export function pcm16Base64FromFloat32(samples, sourceRate, targetRate = 24000) {
  if (!(samples instanceof Float32Array) || samples.length === 0) return "";
  if (!Number.isFinite(sourceRate) || sourceRate < targetRate) {
    throw new Error("Unsupported microphone sample rate.");
  }
  const ratio = sourceRate / targetRate;
  const outputLength = Math.floor(samples.length / ratio);
  if (outputLength < 1) return "";
  const bytes = new Uint8Array(outputLength * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < outputLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += samples[j];
    const average = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(i * 2, average < 0 ? average * 32768 : average * 32767, true);
  }
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary);
}

export function float32FromPcm16Base64(encoded) {
  if (typeof encoded !== "string" || encoded.length > 1_000_000) return new Float32Array();
  let binary;
  try {
    binary = atob(encoded);
  } catch {
    return new Float32Array();
  }
  const evenLength = binary.length - (binary.length % 2);
  const output = new Float32Array(evenLength / 2);
  for (let i = 0; i < output.length; i += 1) {
    const value = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
    const signed = value & 0x8000 ? value - 0x10000 : value;
    output[i] = signed < 0 ? signed / 32768 : signed / 32767;
  }
  return output;
}
