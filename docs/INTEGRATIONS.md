# Integration setup and current limits

## Local chat

Existing Ollama services remain user-managed and unchanged by setup. Native setup can explicitly create a separate owned library and child process, reusing an existing executable or installing a verified portable release with consent. See SETUP_RUNTIME_STORAGE.md for boundaries and verification. Aether never changes an external model directory or edits model blobs. Use Providers to test the endpoint. Browser preview requires allowed origins; limit allowances to the explicit development origin, and do not bind unauthenticated runtimes publicly. LM Studio/llama.cpp/OpenAI-compatible endpoints use their `/v1` base URLs. Keys remain session-only, not persisted.

Provider protocol references checked 2026-11-17: [Ollama chat](https://docs.ollama.com/api/chat), [Ollama create](https://docs.ollama.com/api/create). Native local create/import is now implemented in the standalone runtime core and tested with an isolated HTTP fixture; packaged/live model import remains unverified. Native static packaging follows [Tauri's Next.js guide](https://v2.tauri.app/start/frontend/nextjs/) and [SQL plugin](https://v2.tauri.app/plugin/sql/).

## Voice

The current STT adapter targets the JSON `/inference` endpoint of [whisper.cpp's server example](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server). Build/configure that server separately following upstream instructions, download a licensed Whisper model outside this repository, bind it to loopback, and point Voice at its actual endpoint. Enable only the browser origin you use if the server requires CORS configuration. Aether records with explicit microphone permission, converts audio locally to mono 16 kHz PCM WAV and uploads it only after the user stops. Preview and edit transcription before transferring text to the chat composer.

Whisper.cpp is MIT; review the selected model's separate terms and storage requirements before downloading. No engine/model has been installed or bundled by Aether. PCM encoding is unit-tested; live engine and microphone tests remain pending. Local system TTS exposes only voices marked local by the browser. If none appear, playback remains unavailable; do not substitute remote voices silently. Auto-speak and persisted voice profiles remain unfinished. Piper/Kokoro/sherpa-onnx are not bundled or selected; engine/voice license and platform evaluation remains open.

## Research

Configure a trusted [SearXNG instance](https://docs.searxng.org/dev/search_api.html) that enables JSON output and permits the app origin. Each session requires explicit consent. Opening sources uses direct HTML fetches, which may fail because of source CORS/anti-bot restrictions. Errors are surfaced, no fabricated excerpts are generated, and no hidden proxy is used. Exported notes are user synthesis, separately labeled from retrieved excerpts. Automatic source-grounded AI synthesis and native controlled fetching remain unfinished.

## Public model discovery

Hugging Face discovery uses the [Hub API](https://huggingface.co/docs/hub/api). Repository file selection resolves to a pinned revision, not a repository HTML URL. Model-card links expose license context; review it yourself before downloading. Gated/private authentication and resumable native transfers remain unfinished. Browser preview can inspect public repositories; actual large-file download requires the native desktop build. The native code is not compiled on this host yet.

## Controlled agents

In Chromium on a secure origin, select a workspace via the OS picker. Each typed list/read/write request then requires approval. Editing displays complete before/after content, checks for intervening changes, and records local audit events. No shell/terminal/install tool is registered. Browser file APIs are not present in all webviews; the native executor, visual diffs and rollback are not yet implemented. File-content reads in audit logs are private local data and can be included in agent-run backups. Live provider tool-call and file-picker workflows still require end-to-end verification.

## Android

Mobile layout is browser-tested at 390×844. No Android project/APK is generated or tested. The intended first inference strategy is an explicitly selected trusted LAN/remote or Termux HTTP server using existing provider adapters; no desktop CUDA or Ollama binary is assumed on Android. Before implementing packaging: verify Tauri Android SDK/NDK/JDK prerequisites, generated network/camera/microphone/storage permissions and cleartext-HTTP network-security rules. Use scoped Android storage rather than the desktop file picker. Signing and actual device/emulator tests remain required. Auto-updates stay disabled pending signing/integrity/rollback/trust validation.
