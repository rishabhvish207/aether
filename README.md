# Aether

Repository: [rishabhvish207/aether](https://github.com/rishabhvish207/aether).

A local-first AI workspace using Next.js, TypeScript, Tailwind CSS and Tauri 2/Rust. **Active implementation; the complete product specification is not yet fulfilled.** See [project state](docs/PROJECT_STATE.md) and [requirement tracker](docs/IMPLEMENTATION_TRACKER.md).

## Run

Requires Node.js 20.9+ (tested with 26.9), npm and a separately running inference server.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. Default provider is Ollama at http://127.0.0.1:11434. The setup wizard discovers existing services without changing them. The native Linux setup path can download a verified portable runtime and start an isolated child only after explicit consent. No system services or model stores are changed automatically. Configure additional providers in Providers. Compatible API base URLs should include `/v1`. Browser requests require the inference server to permit this origin. Do not expose an unauthenticated Ollama service to the internet.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

`build` creates static `out/`; `preview` serves it on 127.0.0.1:4173. This app does not require Next.js server APIs. In this managed environment, production builds require an approved command because the sandbox denies TypeScript child processes.

## Browser tests

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/aether-playwright npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/aether-playwright npm run test:e2e
```

Tests use explicitly intercepted provider responses; they do not certify a live model. Desktop and 390px mobile workflows run against the production static export. Rebuild before running these tests.

## Desktop

Linux needs Tauri's GTK/WebKitGTK 4.1 development libraries and a Rust toolchain. Run `npm run tauri dev` or `npm run tauri build` after installing appropriate host prerequisites deliberately. This host currently lacks WebKitGTK 4.1; no native package has been compiled or launched. Do not change graphics drivers or boot configuration to build the app.

Source is on NTFS. Node install, build and browser tests are checked here. Rust's download finalization requires hard-link support and fails safely, retaining the verified partial file, if the selected filesystem cannot support it. Select model storage outside this repository. No existing Ollama model files have been touched.

## Present workflows

Streaming text chat; separate supplied thinking; cancellation; local history/search/folders/pinning/branching/edit/regenerate; temporary chats; safe Markdown and code highlighting; profile CRUD/portable imports; provider CRUD and diagnostics; model inventory/metadata/pull/removal through supported APIs; real-metric benchmarks; appearance and inference settings; checksummed selective JSON backup/restore; opt-in research source collections; whisper.cpp transcription, installed local-system voice playback, public Hugging Face discovery and approval-controlled browser workspace agents. Engine-dependent paths require external setup and some remain unverified.

Native source includes SQLite migrations, file/folder dialogs, an ownership-aware runtime/storage setup core, original-preserving GGUF upload/create and streamed HTTPS downloads. The standalone runtime core is compiled/tested independently, including real isolated child startup; the Tauri binding remains unverified. These are **unverified**, not a shipping native implementation. Raw file/archive resume, gated Hugging Face auth, full import repair/cancellation, native agent execution/rollback, PDF/camera, keychain, full settings, scheduled backup and Android remain incomplete.

Keys remain session-only. Backups are unencrypted; conversation attachments currently live inside message records. Temporary chats and their attachments live only in memory until you leave/reload. No telemetry. Model and voice-engine licenses are separate. Application license selection is pending; no open-source release license is asserted.

Setup details and exact test limitations: [adaptive setup/runtime/storage](docs/SETUP_RUNTIME_STORAGE.md). An empty existing Ollama library is a valid connection; Aether never assumes it owns that service or its residual files. A chosen download folder does not relocate the server's weights. Full official runtime archive installation and packaged desktop setup have not been tested here.
