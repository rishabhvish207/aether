export interface SpeechToText {
  transcribe(audio: Blob, signal: AbortSignal): Promise<string>;
}
export interface TextToSpeech {
  speak(
    text: string,
    voiceId: string,
    rate: number,
    volume: number,
  ): Promise<void>;
  stop(): void;
}
export async function wavFromRecording(blob: Blob): Promise<Blob> {
  const context = new AudioContext({ sampleRate: 16000 });
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(
      1,
      Math.ceil(decoded.duration * 16000),
      16000,
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const audio = await offline.startRendering();
    return pcmWav(audio.getChannelData(0), 16000);
  } finally {
    await context.close();
  }
}
export function pcmWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const string = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };
  string(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  string(8, "WAVE");
  string(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  string(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
export class WhisperServer implements SpeechToText {
  constructor(private endpoint: string) {}
  async transcribe(audio: Blob, signal: AbortSignal) {
    const url = new URL(this.endpoint);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Use an HTTP(S) whisper.cpp inference endpoint");
    const data = new FormData();
    data.append("file", audio, "recording.wav");
    data.append("response_format", "json");
    const r = await fetch(url, {
      method: "POST",
      body: data,
      signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
    });
    if (!r.ok) throw new Error(`Transcription HTTP ${r.status}`);
    const result = await r.json();
    if (typeof result.text !== "string")
      throw new Error("Incompatible transcription response: missing text");
    return result.text;
  }
}
export class LocalSystemSpeech implements TextToSpeech {
  stop() {
    speechSynthesis.cancel();
  }
  speak(text: string, voiceId: string, rate: number, volume: number) {
    return new Promise<void>((resolve, reject) => {
      const voice = speechSynthesis
        .getVoices()
        .find((v) => v.voiceURI === voiceId && v.localService);
      if (!voice) {
        reject(new Error("Select an installed local system voice"));
        return;
      }
      this.stop();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.rate = rate;
      utterance.volume = volume;
      utterance.onend = () => resolve();
      utterance.onerror = (e) =>
        reject(new Error(`Speech playback: ${e.error}`));
      speechSynthesis.speak(utterance);
    });
  }
}
