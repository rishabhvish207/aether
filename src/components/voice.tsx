"use client";
import { useEffect, useRef, useState } from "react";
import {
  WhisperServer,
  LocalSystemSpeech,
  wavFromRecording,
} from "@/core/voice";
export function VoicePanel({
  sendToChat,
}: {
  sendToChat: (text: string) => void;
}) {
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:8080/inference");
  const [allowed, setAllowed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voice, setVoice] = useState("");
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const update = () =>
      setVoices(
        "speechSynthesis" in window
          ? speechSynthesis.getVoices().filter((v) => v.localService)
          : [],
      );
    update();
    if ("speechSynthesis" in window)
      speechSynthesis.addEventListener("voiceschanged", update);
    return () => {
      mounted.current = false;
      abort.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if ("speechSynthesis" in window) {
        speechSynthesis.cancel();
        speechSynthesis.removeEventListener("voiceschanged", update);
      }
    };
  }, []);
  async function start() {
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "Microphone recording is unavailable on this platform or insecure origin",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const r = new MediaRecorder(stream.current);
      recorder.current = r;
      const parts: Blob[] = [];
      r.ondataavailable = (e) => parts.push(e.data);
      r.onstop = async () => {
        stream.current?.getTracks().forEach((t) => t.stop());
        if (!mounted.current) return;
        setRecording(false);
        setProcessing(true);
        const c = new AbortController();
        abort.current = c;
        try {
          const wav = await wavFromRecording(
            new Blob(parts, { type: r.mimeType }),
          );
          if (!mounted.current) return;
          const transcript = await new WhisperServer(endpoint).transcribe(
            wav,
            c.signal,
          );
          if (mounted.current) setText(transcript);
        } catch (e) {
          if (mounted.current) setError(String(e));
        } finally {
          if (mounted.current) setProcessing(false);
        }
      };
      r.start();
      setRecording(true);
      setError("");
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(String(e));
    }
  }
  return (
    <section className="stack">
      <h1>Voice workspace</h1>
      <div className="notice">
        Speech is separate from the chat provider. Configure a whisper.cpp
        server with an independently downloaded model. Recording is sent only
        after explicit consent. System playback lists local voices only. No
        voice engine or model is bundled.
      </div>
      <section className="card stack">
        <h2>Record & transcribe</h2>
        <label>
          whisper.cpp inference URL
          <input
            type="url"
            disabled={recording || processing}
            value={endpoint}
            onChange={(e) => {
              setEndpoint(e.target.value);
              setAllowed(false);
            }}
          />
        </label>
        <label className="switch">
          <input
            type="checkbox"
            disabled={recording || processing}
            checked={allowed}
            onChange={(e) => setAllowed(e.target.checked)}
          />
          Allow microphone recording and sending audio to this endpoint
        </label>
        {recording ? (
          <button onClick={() => recorder.current?.stop()}>
            Stop & transcribe
          </button>
        ) : processing ? (
          <button onClick={() => abort.current?.abort()}>
            Cancel transcription
          </button>
        ) : (
          <button disabled={!allowed} onClick={() => void start()}>
            Start recording
          </button>
        )}
        <small>
          Stop after speaking to preview and edit the transcription before
          sending. Audio is converted locally to mono 16 kHz PCM WAV. Recording
          is not saved to history.
        </small>
        <label>
          Transcription preview / playback text
          <textarea value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <button
          disabled={!text.trim() || recording || processing}
          onClick={() => sendToChat(text)}
        >
          Use text in chat composer
        </button>
      </section>
      <section className="card stack">
        <h2>Local system playback</h2>
        {!voices.length && (
          <p>
            No installed local voice is exposed by this platform.
            Install/configure a local system voice; remote system voices are
            excluded.
          </p>
        )}
        <label>
          Voice
          <select value={voice} onChange={(e) => setVoice(e.target.value)}>
            <option value="">Select local voice</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </label>
        <label>
          Rate
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </label>
        <label>
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
        </label>
        <div className="row">
          <button
            disabled={!voice || !text.trim()}
            onClick={() =>
              void new LocalSystemSpeech()
                .speak(text, voice, rate, volume)
                .catch((e) => setError(String(e)))
            }
          >
            Speak text
          </button>
          <button
            disabled={!voices.length}
            onClick={() => new LocalSystemSpeech().stop()}
          >
            Stop playback
          </button>
        </div>
      </section>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
