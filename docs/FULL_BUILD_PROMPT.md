> Repository adaptation (2026-11-17): Codex is the implementation agent. This repository began empty except for these documents; references below to an existing UI/screenshot/Claude are historical context. Follow root AGENTS.md, current PROJECT_STATE.md and IMPLEMENTATION_TRACKER.md for actual implementation evidence. The complete target remains unchanged.

Aether Complete Build Directive for Claude Code
================================================

Use this as the main implementation prompt in the existing Aether repository. It replaces the old “Initial Implementation Prompt” that asked Claude to stop after a first chat vertical slice. The target is the complete application described below and in the SRS, not a demo.

The developer has explicitly said that a partial prototype is not acceptable. The supplied screenshot shows an incomplete navigation panel where Models, AI Profiles, Benchmarks and Settings are labelled “soon”. This is an example of the failure mode to eliminate. Do not hand back a shell with core modules missing, even if the styling is attractive.

Primary instruction
-------------------

Build the complete Aether application in the repository that already exists. Read `CLAUDE.md`, `docs/AETHER_SRS.md`, `docs/ROADMAP.md`, `docs/LOCAL_AI_SETUP.md` and `docs/PROJECT_STATE.md` in full. The SRS and roadmap define the scope. All applicable P0, P1 and P2 items are in scope for the requested full product; priority labels guide implementation order and dependencies, not omissions. An item is excluded only if it is expressly marked Future or expressly optional by its own requirement wording.

Do not stop after auditing the repo, planning, creating a scaffold, building a home screen, implementing chat, or completing the first roadmap phase. Audit first, then implement continuously through the roadmap, keeping the app buildable after each internal slice. Do not ask whether to continue after each phase. If a genuine blocking decision is needed, ask a focused question; otherwise make a sensible reversible choice and continue.

Do not destroy existing work. Inspect `git status`, branch, remotes, package scripts, framework versions, dependencies, current screens, storage and tests before editing. Extend the existing code. If the project is a partial implementation, map it against the requirements and fix gaps rather than restarting without cause.

First actions — not the final deliverable
-----------------------------------------

1. Inspect the repository and report the real baseline, including what currently runs, what the screenshot's placeholder items correspond to in code, Git working tree state and any blocking issues.
2. Read the entire SRS. Create or update `docs/IMPLEMENTATION_TRACKER.md` with every FR/NFR or requirement group, status (`missing`, `partial`, `implemented-unverified`, `verified`, `blocked`), concrete file/code evidence, tests and next action.
3. Build a dependency-aware plan across all roadmap phases. Keep it in the tracker. Do not provide only a plan: begin implementing immediately after the baseline audit.
4. Ensure the app remains runnable and tested throughout. Commit checkpoints are allowed only when appropriate and authorized; do not push or publish without authorization.

Product and design
------------------

Aether is a polished, local-first, open-source AI workspace and model manager. The current name is `Aether`; do not append “Studio”. Centralize brand display metadata so it can be renamed later. No mandatory hosted Aether backend and no telemetry by default. Requests go only to the chosen local/remote provider or explicitly enabled online integration, with clear network disclosure.

Use Next.js App Router, React, TypeScript and Tailwind CSS, with a maintained icon library such as Lucide. Default theme is dark, with light/system themes, custom themes, tokenized color/surface/typography/radius/density/motion settings, restrained liquid-glass styling and accessible alternatives. Do not copy ChatGPT, Gemini or PocketPal UI/branding. Do not use emoji icons. The maintainer will provide the logo, so do not invent a final logo.

Responsive means a genuinely usable mobile layout, not a compressed desktop sidebar. Every route and navigation destination must exist and work. No “soon” tags, inert buttons, fake feature cards, hard-coded mock model lists in production, fake benchmarks or placeholder settings. When a feature is not supported by the selected provider/platform, present an accurate capability message and the available setup path.

Architecture constraints
-----------------------

- Check current official documentation before selecting/upgrading framework and runtime APIs. Do not use stale method signatures or blindly pin outdated packages.
- Keep Next.js statically exportable for Tauri 2. The core application must not rely on Next.js server APIs, Route Handlers, Server Actions or a permanent Next server. Verify the current Tauri/Next.js static-export requirements.
- Implement the native desktop application with Tauri 2/Rust. The browser preview is a development/testing adapter, not the complete product runtime. Native file access, process management, long downloads, SQLite and credentials must go through a typed native capability bridge.
- Use service boundaries and typed domain types. Keep provider APIs out of React view components. Separate Provider (API endpoint) and Runtime (inference engine).
- Implement provider/runtime adapters for Ollama, remote Ollama, OpenAI-compatible endpoints, llama.cpp server and LM Studio where compatible. The default local Ollama URL is configurable and initially `http://127.0.0.1:11434`.
- Each provider/model must report its capabilities and expose unsupported operations accurately. Do not imply all models support thinking, images, tool calls, embeddings or audio.
- Use IndexedDB behind the storage interface in browser preview and SQLite with migrations in native release. Keep UI/features independent of the storage implementation.
- Use configurable external model-data and attachment paths. Never place large model files, downloads, databases, backups or credentials in the source repository.
- Never execute raw model output or a generated shell command. All tools must pass through typed schemas, a permission manager, workspace boundaries, user approval where needed, limits and audit logs.

Complete feature list
---------------------

Implement the SRS end to end. The following summary is a mandatory coverage checklist, not a replacement for the SRS.

A. Setup and connection management

- First-run onboarding explaining local-first behavior and what leaves the device.
- Test local Ollama and support unreachable, unauthorized and incompatible endpoints with actionable diagnostics.
- CRUD operations for provider/server connections; connect, test, select, disable and remove; labels, timeouts, optional headers/auth and health state.
- Explicit local/LAN/remote classification and visible endpoint destination.

B. Complete chat and history

- Provider/model/profile selection and streaming chat, proper chunk parser, cancellation, retry, stop, reconnect/error states and final metrics where available.
- Markdown headings/lists/tables/links/quotes/fenced code, syntax highlighting, code-copy, safe sanitization and no unsafe HTML execution.
- Message copy/edit-and-resubmit/regenerate/delete/export; coherent branch behavior; timestamps and structured message parts.
- Display only provider-supplied `thinking` in a separate collapsible region; never manufacture hidden reasoning.
- Normal local conversation history: create, reopen, rename, search across titles/content, delete, pin/star, folders/workspaces, branch and export to Markdown/JSON/TXT as specified.
- Temporary chats must not be saved to normal history; clearly indicate the mode and implement documented cleanup behavior.
- Auto-scroll that pauses when the user scrolls up, jump-to-latest, visible cancellation, active provider/model/profile and generation details.

C. AI Profiles

- Full create/read/edit/duplicate/delete/import/export workflow and validation.
- Starter templates: General Assistant, Coder, Researcher, Study Tutor, Note Maker, Writer and Roleplay; all editable, not hard-coded special-case modes.
- System instructions, description, desired output format/style, generation defaults, preferred provider/model or use-current selection, capability requirements and voice/tools preferences where supported.
- Profile import/export uses a versioned portable format, excluding secrets by default. Handle missing/incompatible model bindings without silent switching.

D. Model management and inference configuration

- Provider-aware model inventory and installed/remote distinction.
- Import existing local GGUF files without forcing copies into the repository; safe direct-URL downloads; Hugging Face repository search/details, files, sizes, quantization, licenses/model-card links and gated authentication when supported.
- Download jobs show target path, estimated/known size, disk space, progress, speed, cancel/pause/resume when actually supported, retry/error state and verification status. Stream to disk, validate source and destination, safely clean up partial files and never claim a checksum was checked unless it was computed.
- User-configurable storage directory and mount/path availability checks. Never silently download models into the app repo or system root.
- Distinguish original GGUFs from runtime-managed copies/blobs. Safe model-registration/removal flow with separate confirmations for removing registration, original files and runtime weights. Never manually delete Ollama-managed blobs.
- Generate Ollama Modelfiles from structured UI; preview changes/diffs before applying; do not require ordinary users to hand-author Modelfiles.
- Expose supported temperature, top-p/top-k/min-p, context, repeat penalty, seed, stop sequences, keep-alive, thinking and other supported inference controls. Explain provider-specific limitations.
- Label resource-fit estimates as estimates and use actual provider/runtime resource data where available. Warn clearly about possible RAM/VRAM/context pressure without silently changing settings.

E. Provider and runtime support

- Ollama: connection/list/show/chat streaming/stop where supported, model create/import/configuration/removal and loaded-model status.
- Remote Ollama and OpenAI-compatible endpoints with endpoint/auth/configuration support.
- llama.cpp server and LM Studio adapters where their real APIs support it.
- Provider capability matrix and connection diagnostics; secure native credential store integration; browser preview must not claim browser-stored secrets are hardware-protected.
- Remote requests must show destination/network implications. No hard-coded one-provider assumptions in chat, profiles or model inventory.

F. Attachments, documents, camera and local context

- Image upload, clipboard paste and drag/drop, conditional on model vision support.
- Text/code attachments with file type/size validation and user-visible extraction behavior.
- PDF and document text extraction, safe previews and per-attachment removal; clear errors for unsupported/invalid content.
- Camera capture where supported, with explicit permission and a preview before sending.
- Optional local document indexing/RAG as specified in the SRS: source chunks are traceable, retrievals are shown separately from generated synthesis, and users can inspect/delete indexed data.

G. Voice

- Real speech-to-text and text-to-speech provider interfaces, with concrete local engine integrations selected after checking current licenses, platform compatibility and storage requirements (consider suitable engines such as Whisper/whisper.cpp or sherpa-onnx for STT and Piper/Kokoro or compatible alternatives for TTS).
- Push-to-talk capture, permission handling, recording state, transcription preview/edit, send to chat, playback, auto-speak, voice/rate/volume controls, interruption and errors.
- Include an install/setup path and explain when engine models must be downloaded separately. Never show working voice controls when no backend is configured.
- Advanced streaming duplex conversation can be omitted only where the SRS explicitly permits it as a later/optional extension.

H. Research and sourced answers

- An actual research workflow, not just a persona prompt: configurable search provider, search results, open/extract source content, source list, notes/synthesis, citations/links and exportable reports.
- Network access is opt-in per provider/profile/session. Show when the query leaves the device and identify the chosen search provider.
- Never invent URLs, page contents or citations. Distinguish retrieved excerpts, claims grounded in sources and model-written synthesis. Handle blocked pages, timeouts and unavailable search services honestly.
- Saved research workspaces/source collections and export where specified.

I. Agent mode and workspace tools

- Typed tool registry with schema, descriptions, capability requirements and permissions; correct provider tool-call handling and execution loop.
- Read/search/write within explicitly approved workspace roots. Show proposed edits as a diff and require approval before applying when appropriate. Include cancellation, retry/error recovery, run status, visible tool inputs/outputs, history, timestamps, audit log, token/time/iteration limits and recovery/rollback where applicable.
- Terminal access is isolated behind policy, explicit confirmations and command-risk handling; block unsafe actions or require elevated confirmation for destructive operations, privilege escalation, package installation, network exposure and credential access.
- Treat prompt injection in model output, web pages and local files as untrusted content; it cannot alter application permission policy. Never run arbitrary shell commands generated by the model automatically.

J. Benchmarking and resource monitoring

- Versioned, repeatable built-in prompt set plus custom tests; cold/warm runs; run configuration and provider metadata.
- Record actual load duration, TTFT, prompt tokens and prompt-processing tok/s, output tokens and generation tok/s, total duration, timestamp, errors, model/context/options/runtime and relevant hardware details when exposed.
- Use provider metrics when available; otherwise label client-measured fields accurately. Never call wall-clock division exact provider throughput. Do not invent resource telemetry or AI-quality rankings.
- Capture RAM, swap, VRAM, GPU utilization, temperature and offload data only where supported and permitted. Make unsupported metrics visible as unsupported.
- Local benchmark history, comparison across compatible runs and CSV/JSON/Markdown export; manual ratings may be offered but must be explicitly user-entered.

K. Appearance, settings and shortcuts

- Dark/light/system modes; bundled themes such as Aether Dark, Aether Light, Graphite, Aurora and Glass if visually reviewed; custom theme import/export.
- Reusable design tokens; controls for density, type size, chat width, sidebar, message spacing, animation, transparency and blur.
- Honor reduced motion, reduced transparency and high contrast; keyboard navigation/focus; screen-reader labels and touch targets.
- Implement the full settings categories from FR-130: General, Appearance, Chat, Models, Providers/Servers, Inference, AI Profiles, Voice, Tools/Agent, Storage, Privacy, Shortcuts, Backup, Advanced and About. Add settings search and confirmation-backed reset behavior. Do not show inert categories.
- Configurable keyboard shortcuts with conflict detection and explanations.

L. Local persistence, backup and restore

- Structured schema for settings, profiles, themes, chats, message parts, attachments/metadata, benchmarks, model configurations, research/workspaces, toolsets and related records.
- IndexedDB browser adapter and SQLite native adapter with versioned migrations and migration tests.
- Export selected categories and full backups; versioned manifest; checksums; model source manifest without packaging large weights by default.
- Restore preview, version/schema compatibility handling, category selection, conflict review and explicit overwrite choices. Defend archive extraction from path traversal, unsafe links and symlinks. Credentials excluded by default; never put plaintext secrets in normal backups.
- Clear data-management controls; no silent data loss, no hidden cloud sync and no automatic destructive cleanup.

M. Native application, security and release

- Integrate Tauri 2/Rust for Linux desktop capabilities: filesystem/dialogs, model downloads, app data paths, process/server checks, SQLite, secure credential store, resource telemetry where available, backup/restore and controlled tool execution.
- Static frontend export and packaged launch; define/install/test the Linux package format(s) that the current host can build. Verify startup and core operations from the packaged app, not only `npm run dev`.
- Maintain a viable platform abstraction and documented build path for Windows/macOS. Android is a full target: provide the supported Tauri/mobile application package, platform permissions and a real inference strategy (device runtime or explicit LAN/Termux/remote connection). Do not falsely claim desktop Ollama/CUDA is an Android runtime. Configure and verify the Android build wherever the toolchain is available; if the present host lacks a required SDK/signing credential, implement the build configuration and document the precise blocker without claiming a tested APK. Keep Windows/macOS build paths viable and state exactly which platforms were actually built and tested.
- About screen: version, privacy statement, licenses/third-party notices and credits. Repository docs: README, setup, architecture, ROADMAP, current state, CONTRIBUTING, SECURITY, CHANGELOG, license decision/file when authorized, third-party notices and release checklist. Do not invent maintainer URLs or donation links.
- No default telemetry. Handle remote endpoint risk, secret storage, local file access, imported configs, markdown, path validation, update integrity and tool permissions as security boundaries.

What “complete” means
---------------------

The app is not complete merely because it compiles or a chat can answer one message. Completion requires all of the following:

- Every applicable requirement is represented in the tracker, implemented, and verified with code evidence and relevant tests/manual steps.
- Every top-level navigation item opens a real usable module. There are no “soon” labels, inert controls, fake lists, canned success notifications or UI-only settings.
- All key workflows have empty, loading, success, error, disconnected, cancellation and permission-denied behavior as relevant.
- `npm`/package manager lint, type checking, tests and production build pass. Run available Tauri build/package checks and launch the built desktop app where possible. Failures are fixed or marked as an explicit environment blocker with logs and a remaining action.
- Storage survives restart in the appropriate mode; migrations and backup/restore are tested. Temporary chats are not persisted to regular history.
- Provider requests, web research and agent operations are explicit and observable; real metrics are not fabricated; model files stay out of Git.
- `docs/IMPLEMENTATION_TRACKER.md`, `docs/PROJECT_STATE.md`, `docs/ROADMAP.md` and user documentation accurately reflect implementation. Do not mark untested behavior verified.

Execution strategy and continuation
-----------------------------------

Use roadmap phases internally in dependency order. After each phase, test and keep the app runnable, update the tracker, then proceed to the next phase automatically. Do not end the work after phase 1 or ask “should I continue?”. Avoid a single enormous unverified patch, but also do not use “small steps” as an excuse to deliver only a prototype. Continue until all scope is complete or a specific unavoidable blocker is documented.

If you hit context/session limits, leave a durable checkpoint: exact requirements completed, exact requirements remaining, commands/checks run and their results, current Git status, current branch, current failure/blocker, and the next implementation step. Resume from that checkpoint. Do not spend the next session re-planning everything from scratch.

Git safety: preserve user changes, inspect status and remotes, never run destructive reset/clean or force-push commands, and do not commit/push/publish without appropriate authorization. Report commands and test results truthfully. The deliverable is working code, not just a plan or a polished screenshot.
