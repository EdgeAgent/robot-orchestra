"use strict";
/**
 * Robot Orchestra — local voice server, v1.
 *
 * How it runs on Kevin's machine, as a dev would set it up there:
 *  - One small server on loopback only: http://127.0.0.1:8765
 *  - STT: Moonshine (streaming, tiny) or Faster-Whisper, local binary.
 *  - TTS: Piper, local binary, voice chosen in config.
 *  - Mic never auto-starts. The server only transcribes when the head
 *    is listening, and only speaks when the head is speaking.
 *  - No audio, transcript, or config ever leaves this machine. Endpoints
 *    are loopback-only by design; a non-loopback endpoint in config is
 *    rejected, not warned-and-allowed.
 *
 * This module is the config + health + route logic for that server.
 * The actual binary spawn happens in startVoiceServer() on Windows;
 * here, the logic is kept pure so it can be tested without a mic.
 */
const DEFAULT_VOICE_SERVER = Object.freeze({
  host: "127.0.0.1",
  port: 8765,
  sttEngine: "moonshine", // moonshine | faster-whisper
  ttsEngine: "piper",
  ttsVoice: "en_US-lessac-medium",
  wakeWord: "robot",
});

function isLoopbackHost(host) {
  return ["127.0.0.1", "localhost", "[::1]", "::1"].includes(String(host || ""));
}
function voiceServerConfig(overrides) {
  const cfg = { ...DEFAULT_VOICE_SERVER, ...(overrides || {}) };
  if (!isLoopbackHost(cfg.host)) throw new Error("Voice server must run on loopback only.");
  return cfg;
}
function voiceServerUrl(cfg) {
  const c = voiceServerConfig(cfg);
  return `http://${c.host}:${c.port}`;
}
function sttRoute(cfg) { return `${voiceServerUrl(cfg)}/stt`; }
function ttsRoute(cfg) { return `${voiceServerUrl(cfg)}/tts`; }
function healthResponse(cfg, engines) {
  const c = voiceServerConfig(cfg);
  return {
    ok: true,
    host: c.host,
    port: c.port,
    stt: (engines && engines.stt) || c.sttEngine,
    tts: (engines && engines.tts) || c.ttsEngine,
    micAutoStart: false,
    loopbackOnly: true,
  };
}

module.exports = { DEFAULT_VOICE_SERVER, isLoopbackHost, voiceServerConfig, voiceServerUrl, sttRoute, ttsRoute, healthResponse };
