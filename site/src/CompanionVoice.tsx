import { useEffect, useRef, useState } from "react";
import {
  createFunctionOutput,
  createTaskFollowupResponseRequest,
  createTaskResponseRequest,
  createVoiceSessionUpdate,
  float32FromPcm16Base64,
  normalizeVoiceEndpoint,
  pcm16Base64FromFloat32,
} from "./voice-protocol.mjs";

type VoiceEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  item_id?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  error?: { message?: string };
  response?: { status?: string; status_details?: { reason?: string } };
};
type VoiceProps = {
  onSendTask: (task: string) => Promise<string>;
  model: string;
  busy: boolean;
  includeBrowserContext: boolean;
  includeKnowledge: boolean;
};
type ConnectionState = "disconnected" | "connecting" | "connected";
const STORAGE_KEY = "robot-orchestra-hf-realtime-url";
const DEFAULT_ENDPOINT = "ws://127.0.0.1:8765/v1/realtime";

function loadEndpoint() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_ENDPOINT;
  } catch {
    return DEFAULT_ENDPOINT;
  }
}

export function CompanionVoice({ onSendTask, model, busy, includeBrowserContext, includeKnowledge }: VoiceProps) {
  const [open, setOpen] = useState(false);
  const [endpoint, setEndpoint] = useState(loadEndpoint);
  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const [capturing, setCapturing] = useState(false);
  const [status, setStatus] = useState("Voice is off. Your microphone is not being used.");
  const [transcript, setTranscript] = useState("");
  const [spokenReply, setSpokenReply] = useState("");
  const [error, setError] = useState("");
  const modelRef = useRef(model);
  modelRef.current = model;
  const socketRef = useRef<WebSocket | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const captureContextRef = useRef<AudioContext | null>(null);
  const captureSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackCursorRef = useRef(0);
  const handledCallsRef = useRef(new Set<string>());
  const responseActiveRef = useRef(false);
  const pendingFollowupRef = useRef(false);
  const includeBrowserRef = useRef(includeBrowserContext);
  const includeKnowledgeRef = useRef(includeKnowledge);
  const onSendTaskRef = useRef(onSendTask);
  const mountedRef = useRef(true);
  const handshakeTimerRef = useRef<number | null>(null);

  useEffect(() => { onSendTaskRef.current = onSendTask; }, [onSendTask]);
  useEffect(() => { includeBrowserRef.current = includeBrowserContext; }, [includeBrowserContext]);
  useEffect(() => { includeKnowledgeRef.current = includeKnowledge; }, [includeKnowledge]);

  const sendEvent = (payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  };

  const stopMicrophone = () => {
    processorRef.current?.disconnect();
    captureSourceRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    captureStreamRef.current?.getTracks().forEach((track) => track.stop());
    captureContextRef.current?.close().catch(() => undefined);
    processorRef.current = null;
    captureSourceRef.current = null;
    silentGainRef.current = null;
    captureStreamRef.current = null;
    captureContextRef.current = null;
    if (mountedRef.current) setCapturing(false);
  };

  const stopPlayback = () => {
    playbackContextRef.current?.close().catch(() => undefined);
    playbackContextRef.current = null;
    playbackCursorRef.current = 0;
  };

  const disconnect = () => {
    stopMicrophone();
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "User disconnected");
    stopPlayback();
    responseActiveRef.current = false;
    pendingFollowupRef.current = false;
    if (handshakeTimerRef.current !== null) window.clearTimeout(handshakeTimerRef.current);
    handshakeTimerRef.current = null;
    setConnection("disconnected");
    setStatus("Disconnected. Your microphone is off.");
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopMicrophone();
      if (handshakeTimerRef.current !== null) window.clearTimeout(handshakeTimerRef.current);
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "Voice panel closed");
      stopPlayback();
    };
  }, []);

  const playAudio = (encoded: string) => {
    try {
      const samples = float32FromPcm16Base64(encoded);
      if (!samples.length) return;
      const context = playbackContextRef.current || new AudioContext();
      playbackContextRef.current = context;
      void context.resume();
      const audio = context.createBuffer(1, samples.length, 24000);
      audio.getChannelData(0).set(samples);
      const source = context.createBufferSource();
      source.buffer = audio;
      source.connect(context.destination);
      const startAt = Math.max(context.currentTime + 0.035, playbackCursorRef.current);
      source.start(startAt);
      playbackCursorRef.current = startAt + audio.duration;
    } catch {
      setError("The speech server returned an audio chunk this browser could not play.");
    }
  };

  const runOrchestraTaskTool = async (event: VoiceEvent) => {
    const callId = typeof event.call_id === "string" ? event.call_id : "";
    if (!callId || handledCallsRef.current.has(callId)) return;
    handledCallsRef.current.add(callId);
    let result: { ok: boolean; result?: string; error?: string };
    try {
      if (event.name !== "ask_robot_orchestra") throw new Error("The voice server requested an unsupported tool.");
      const args = JSON.parse(String(event.arguments || "{}")) as { task?: unknown };
      const task = typeof args.task === "string" ? args.task.trim().slice(0, 8000) : "";
      if (!task) throw new Error("The voice transcript did not contain a task. Please try again.");
      if (mountedRef.current) {
        setStatus(modelRef.current.startsWith("ollama:") ? "Local Ollama is processing your spoken task…" : "Hermes is coordinating your spoken task…");
        setError("");
      }
      const answer = await onSendTaskRef.current(task);
      result = { ok: true, result: answer.slice(0, 5000) };
      if (mountedRef.current) setTranscript(task);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The selected model could not accept that voice task.";
      result = { ok: false, error: message.slice(0, 1200) };
      if (mountedRef.current) setError(message);
    }
    const output = createFunctionOutput(callId, result);
    if (sendEvent(output)) {
      pendingFollowupRef.current = true;
      if (!responseActiveRef.current) {
        pendingFollowupRef.current = false;
        sendEvent(createTaskFollowupResponseRequest());
      }
      if (mountedRef.current) setStatus(`${modelRef.current.startsWith("ollama:") ? "Local Ollama" : "Hermes"} returned a result · preparing the spoken summary…`);
    }
  };

  const connect = () => {
    setError("");
    let target: string;
    try {
      target = normalizeVoiceEndpoint(endpoint);
      localStorage.setItem(STORAGE_KEY, target);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Check the voice server URL.");
      return;
    }
    if (typeof WebSocket === "undefined" || typeof navigator.mediaDevices?.getUserMedia !== "function") {
      setError("Live microphone audio is unavailable in this desktop window.");
      return;
    }
    try {
      const context = new AudioContext();
      playbackContextRef.current = context;
      void context.resume();
      const socket = new WebSocket(target);
      socketRef.current = socket;
      handledCallsRef.current.clear();
      responseActiveRef.current = false;
      pendingFollowupRef.current = false;
      setConnection("connecting");
      setStatus("Connecting to the Hugging Face speech server…");
      handshakeTimerRef.current = window.setTimeout(() => {
        if (socketRef.current === socket && socket.readyState === WebSocket.OPEN) {
          setError("The voice server connected but did not confirm its session. Check that it is the Hugging Face speech-to-speech realtime server.");
          socket.close(1000, "Realtime handshake timeout");
        }
      }, 12000);
      socket.onopen = () => {
        setStatus("Connected · configuring the selected task route…");
        socket.send(JSON.stringify(createVoiceSessionUpdate()));
      };
      socket.onmessage = (message) => {
        let event: VoiceEvent;
        try {
          event = JSON.parse(String(message.data)) as VoiceEvent;
        } catch {
          setError("The voice server sent an unreadable realtime event.");
          return;
        }
        switch (event.type) {
          case "session.created":
            setStatus("Connected · syncing audio and task routing…");
            break;
          case "session.updated":
            if (handshakeTimerRef.current !== null) window.clearTimeout(handshakeTimerRef.current);
            handshakeTimerRef.current = null;
            setConnection("connected");
            setStatus("Ready. Tap the mic to start listening; it turns off after each spoken turn.");
            break;
          case "error":
            setError(String(event.error?.message || "The voice server rejected a realtime request.").slice(0, 800));
            break;
          case "input_audio_buffer.speech_started":
            setStatus("Listening…");
            setTranscript("");
            setSpokenReply("");
            break;
          case "input_audio_buffer.speech_stopped":
            stopMicrophone();
            setStatus("Speech captured · transcribing locally…");
            break;
          case "conversation.item.input_audio_transcription.delta":
            setTranscript((current) => `${current}${event.delta || ""}`.slice(0, 8000));
            break;
          case "conversation.item.input_audio_transcription.completed": {
            const finalTranscript = String(event.transcript || "").trim().slice(0, 8000);
            if (finalTranscript) setTranscript(finalTranscript);
            if (finalTranscript) {
              setStatus(`Transcript ready · routing through ${modelRef.current.startsWith("ollama:") ? "local Ollama" : "Hermes"}…`);
              sendEvent(createTaskResponseRequest());
            } else {
              setError("No speech was recognized. Tap the mic and try again.");
              setStatus("Ready. Your microphone is off.");
            }
            break;
          }
          case "response.function_call_arguments.done":
            void runOrchestraTaskTool(event);
            break;
          case "response.created":
            responseActiveRef.current = true;
            break;
          case "response.output_audio.delta":
            if (event.delta) playAudio(event.delta);
            break;
          case "response.output_audio_transcript.delta":
            setSpokenReply((current) => `${current}${event.delta || ""}`.slice(0, 5000));
            break;
          case "response.output_audio_transcript.done":
            if (event.transcript) setSpokenReply(String(event.transcript).slice(0, 5000));
            break;
          case "response.done":
            responseActiveRef.current = false;
            if (event.response?.status === "failed" && event.response.status_details?.reason) {
              setError(`Voice response failed: ${event.response.status_details.reason}`);
            }
            if (pendingFollowupRef.current) {
              pendingFollowupRef.current = false;
              sendEvent(createTaskFollowupResponseRequest());
              setStatus(`${modelRef.current.startsWith("ollama:") ? "Local Ollama" : "Hermes"} replied · speaking the result now…`);
            } else {
              setStatus(`${modelRef.current.startsWith("ollama:") ? "Local Ollama" : "Hermes"} replied. Voice is muted; tap the mic to speak again.`);
            }
            break;
          default:
            break;
        }
      };
      socket.onerror = () => {
        if (mountedRef.current) setError("Could not reach the speech server. Start `speech-to-speech serve` and retry.");
      };
      socket.onclose = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
          stopMicrophone();
          setConnection("disconnected");
          setStatus("Voice server disconnected. Your microphone is off.");
        }
      };
    } catch (reason) {
      setConnection("disconnected");
      setError(reason instanceof Error ? reason.message : "Could not open the voice connection.");
    }
  };

  const startMicrophone = async () => {
    if (connection !== "connected" || busy || capturing) return;
    setError("");
    setTranscript("");
    setSpokenReply("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (socketRef.current?.readyState !== WebSocket.OPEN) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("The speech server disconnected. Reconnect before using the microphone.");
      }
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(2048, 1, 1);
      const mute = context.createGain();
      mute.gain.value = 0;
      processor.onaudioprocess = (audioEvent) => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        try {
          const audio = pcm16Base64FromFloat32(audioEvent.inputBuffer.getChannelData(0), context.sampleRate, 24000);
          if (audio) socket.send(JSON.stringify({ type: "input_audio_buffer.append", audio }));
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Could not encode microphone audio.");
        }
      };
      source.connect(processor);
      processor.connect(mute);
      mute.connect(context.destination);
      captureStreamRef.current = stream;
      captureContextRef.current = context;
      captureSourceRef.current = source;
      processorRef.current = processor;
      silentGainRef.current = mute;
      setCapturing(true);
      setStatus("Listening · audio goes directly to the server URL above. Speak, then pause.");
    } catch (reason) {
      setCapturing(false);
      setError(reason instanceof Error ? reason.message : "Microphone access was not granted.");
    }
  };

  const micButtonLabel = capturing ? "Turn mic off" : "Enable mic";
  return (
    <section className={`hf-voice-panel ${open ? "is-open" : "is-closed"}`} aria-label="Hugging Face live speech-to-speech">
      <div className="hf-voice-bar">
        <div className="hf-voice-brand">
          <span className={`hf-voice-indicator ${connection === "connected" ? "is-connected" : capturing ? "is-listening" : ""}`} />
          <div><b>HF LIVE VOICE</b><small>{connection === "connected" ? "Realtime · Hermes routed" : "Speech-to-speech for your copilot"}</small></div>
        </div>
        {connection === "connected" && (
          <button className={`hf-voice-mic ${capturing ? "is-listening" : ""}`} type="button" onClick={() => void (capturing ? stopMicrophone() : startMicrophone())} disabled={busy} aria-label={micButtonLabel} title={micButtonLabel}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8"/></svg>
            <span>{capturing ? "Mute" : "Talk"}</span>
          </button>
        )}
        <button className="hf-voice-close" type="button" onClick={() => { disconnect(); setOpen(false); }} aria-label="Close and disconnect voice">×</button>
      </div>
      {!open ? (
        <button className="hf-voice-reopen" type="button" onClick={() => setOpen(true)}>Open voice controls</button>
      ) : connection === "disconnected" ? (
        <form className="hf-voice-setup" onSubmit={(event) => { event.preventDefault(); connect(); }}>
          <label htmlFor="hf-voice-url">Realtime server URL</label>
          <div className="hf-voice-urlrow">
            <input id="hf-voice-url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} spellCheck={false} autoComplete="off" placeholder={DEFAULT_ENDPOINT} />
            <button type="submit" disabled={busy}>Connect</button>
          </div>
          <p>Default stays on this PC. Start the upstream server with <code>speech-to-speech serve</code>. The first run downloads local models; no Hugging Face inference token is needed for the local server.</p>
          <p className="hf-voice-privacy">Microphone audio streams only after you enable the mic. It goes directly to this URL. Use remote servers only over <code>wss://</code> and only if you trust them.</p>
          {error && <div className="hf-voice-error" role="alert">{error}</div>}
        </form>
      ) : (
        <div className="hf-voice-live">
          <div className="hf-voice-status" role="status"><span />{status}</div>
          {transcript && <div className="hf-voice-transcript"><small>HEARD</small><p>{transcript}</p></div>}
          {spokenReply && <div className="hf-voice-reply"><small>HERMES · SPOKEN</small><p>{spokenReply}</p></div>}
          {error && <div className="hf-voice-error" role="alert">{error}</div>}
          <div className="hf-voice-live-foot">
            <span>{capturing ? "Mic active · pause to send this turn" : "Mic off between turns"}</span>
            <button type="button" onClick={disconnect}>Disconnect</button>
          </div>
          <small className="hf-voice-context-note">Voice tasks use the checked browser and Knowledge options above. Only ask_robot_orchestra can be called.</small>
        </div>
      )}
    </section>
  );
}
