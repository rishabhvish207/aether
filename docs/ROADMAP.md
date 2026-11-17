Aether — Delivery Roadmap
========================

This roadmap tracks implementation status; it is not a reduced MVP scope. The maintainer explicitly requires the complete product. Every applicable item across phases 0–13 is part of the requested end state. Phases are an implementation order and dependency plan, not permission to stop after chat or leave later features as placeholders. Update status markers only after verifying code and behavior.

Status legend
-------------

- [ ] Planned
- [~] In progress
- [x] Verified complete
- [!] Blocked or decision needed

Current implementation checkpoint — 2026-11-17
-----------------------------------------------

Codex started from documents only. Browser workflows implemented across phases 0–12; all phases remain subject to the per-ID tracker and native/live tests. Do not read unchecked historical tasks as proof of absence or claim full phase completion. See PROJECT_STATE.md for exact continuation. The maintainer authorized automatic commits and normal pushes of verified work on 2026-11-17; follow root AGENTS.md.

Current baseline
----------------

- [x] Product direction and high-level requirements documented.
- [x] Working name selected as Aether; renameability required.
- [x] Developer has a local Ollama instance and GGUF model workflow outside the repository; see `LOCAL_AI_SETUP.md`.
- [x] Aether repository scaffold verified (Next.js static export, strict TypeScript, lint/test tooling).
- [~] First frontend/provider vertical slice implemented; browser regression checks and live endpoint validation ongoing.

Phase 0 — Repository foundation
===============================

Goal: a healthy repository that can be understood and built by a person or another AI coding agent.

- [x] Inspect current repository and Git state; preserve existing work.
- [x] Scaffold/verify Next.js App Router, TypeScript, Tailwind and lint/test tooling.
- [x] Establish static-export compatibility from the start for eventual Tauri packaging.
- [ ] Centralize app identity and shared types.
- [ ] Add README, CLAUDE.md, SRS, roadmap and current project-state document.
- [ ] Add `.gitignore` for model files, local databases, secrets, caches and build artifacts.
- [ ] Run install, lint, typecheck, tests and production build.
- [x] Make the initial baseline commit; `addd8ac` pushed to SSH origin and remote SHA verified. Main tracks origin/main. Automatic verified commits/pushes authorized in AGENTS.md.

Phase 1 — First usable chat slice
=================================

Goal: establish the first tested vertical slice, then continue into every later phase. This phase is a checkpoint, not the final deliverable.

- [ ] Responsive app shell and navigation.
- [ ] Dark, light and system theme selection; token-based design system.
- [ ] Provider and runtime domain interfaces.
- [ ] Ollama provider with connection test and model list.
- [ ] Model selection and chat streaming.
- [ ] Stop/cancel, loading, empty, disconnected, and error states.
- [ ] Separate provider-supplied thinking from final answer.
- [ ] Safe Markdown and code rendering.
- [ ] Basic chat session state; no pretend persistence.
- [ ] Tests for stream parsing, errors and cancellation.
- [ ] Update project state and push a stable milestone.

Phase 2 — Conversations and local persistence
=============================================

- [ ] Define durable conversation/message/message-part schema.
- [ ] Use a storage interface; IndexedDB adapter for browser preview.
- [ ] Local history, rename, delete, search and reopen.
- [ ] Temporary chat that does not save to normal history.
- [ ] Export to Markdown/JSON/TXT.
- [ ] Plan/migrate to SQLite in native packaged mode, with versioned migrations.
- [ ] Test migration/export/import and temporary-chat persistence guarantees.

Phase 3 — Profiles and generation settings
==========================================

- [ ] AI Profile create/edit/duplicate/delete/import/export.
- [ ] Starter profiles: General, Coder, Researcher, Study Tutor, Note Maker, Writer, Roleplay.
- [ ] Model binding, system prompt, generation controls and output preferences.
- [ ] Model Configuration UI with supported options and runtime-aware controls.
- [ ] Preview generated Modelfile/config changes before applying.
- [ ] Profile capability declarations for tools, vision, audio and web.

Phase 4 — Design system and customization
=========================================

- [ ] Refine Liquid Glass visual language without harming readability.
- [ ] Theme tokens and bundled themes.
- [ ] Custom theme import/export.
- [ ] Appearance controls: density, font size, chat width, animation, blur/transparency.
- [ ] Reduced motion, reduced transparency, high contrast and keyboard accessibility.
- [ ] Responsive mobile navigation and chat composer.
- [ ] Visual regression/screenshots across target viewport sizes.

Phase 5 — Model manager
=======================

- [ ] Provider-aware model inventory.
- [ ] Local GGUF import and direct URL download.
- [ ] Download manager with progress, cancellation/resume, file-size/free-space checks and validation.
- [ ] Hugging Face search/repository details/file selection; gated authentication handled securely.
- [ ] Model storage path setting and mount availability checks.
- [ ] Distinguish original GGUFs and provider-managed model representations.
- [ ] Safe model registration/removal flow; no manual edits to Ollama blobs.
- [ ] Resource-fit estimate with clear uncertainty ranges.
- [ ] Model configurations and generated Modelfile preview/apply.

Phase 6 — Benchmarking and resource telemetry
=============================================

- [ ] Repeatable versioned benchmark prompt set.
- [ ] Real prompt-processing and generation token/sec from provider metrics when available.
- [ ] Client-measured time to first token and total duration.
- [ ] Context/config/runtime metadata recorded for each benchmark.
- [ ] RAM/swap and NVIDIA VRAM/utilization/temperature where platform APIs expose them.
- [ ] Cold-start vs warm-run distinction.
- [ ] Local benchmark history and model comparisons.
- [ ] Manual capability/quality ratings; no fabricated model quality scores.
- [ ] Export benchmark results to JSON/CSV/Markdown.

Phase 7 — Provider/server manager
=================================

- [ ] Server connection registry with names, types, endpoint, health and supported capabilities.
- [ ] Remote Ollama.
- [ ] OpenAI-compatible providers.
- [ ] llama.cpp server.
- [ ] LM Studio where compatible.
- [ ] Authentication through OS credential store in native app.
- [ ] Server connection diagnostics and request timeouts.
- [ ] Warn about remote data flow and endpoint trust.

Phase 8 — Attachments and multimodal UI
=======================================

- [ ] Image attach/paste/drag-and-drop for compatible models.
- [ ] File/code attachment processing and safe previews.
- [ ] Capability checks and clear errors when selected model cannot accept an input type.
- [ ] PDF/document extraction.
- [ ] Camera capture where supported, with permission and preview.
- [ ] Optional local indexing/RAG only after attachment handling is reliable.

Phase 9 — Voice
===============

- [ ] STT/TTS provider interfaces.
- [ ] Evaluate license, supported platforms, quality and storage requirements for Kokoro, Piper, Whisper/whisper.cpp, sherpa-onnx or alternatives.
- [ ] Push-to-talk recording and transcription preview.
- [ ] Auto-speak and voice/rate settings.
- [ ] Streaming speech, interruption and realtime duplex voice are later items.

Phase 10 — Native desktop integration
=====================================

- [ ] Integrate Tauri 2/Rust as the native layer while preserving a stable, testable web preview; the complete application requires native desktop capabilities and cannot ship as a dev-server-only UI.
- [ ] Static-export build verified inside Tauri.
- [ ] Native capability bridge for app paths, filesystem, downloads, process/server health and OS dialogs.
- [ ] SQLite/native storage adapter and migrations.
- [ ] OS credential store integration.
- [ ] Permission boundaries and Tauri capabilities reviewed.
- [ ] Linux packaged build tested on a clean environment.
- [ ] Windows/macOS build scripts and testing later.
- [ ] Install/uninstall/upgrade behavior documented.

Phase 11 — Agent and workspace tools
====================================

- [ ] Typed tool registry and provider tool-call loop.
- [ ] Permission manager and per-tool policy.
- [ ] Workspace-scoped file read/write/search.
- [ ] Diff preview, approval, rollback/restore and audit log.
- [ ] Terminal tool disabled until command-policy design is complete; explicit approval for risky operations.
- [ ] Git status/diff and safe developer workflows.
- [ ] Optional research/search/open-source tools with citations.
- [ ] Run limits, cancellation, token/time limits and untrusted-content defenses.
- [ ] Agent run UI with visible tool activity and outputs.

Phase 12 — Backup, restore and release polish
=============================================

- [ ] Selectable backup categories and versioned manifest.
- [ ] Back up settings, profiles, themes, chats, benchmarks, model configurations, toolsets and metadata.
- [ ] Exclude model weights by default; provide a source manifest.
- [ ] Exclude credentials by default; never store plaintext credentials in a normal backup.
- [ ] Restore preview, checksums, conflict resolution and safe archive extraction.
- [ ] About/version/license/acknowledgements/repository links.
- [ ] README, CONTRIBUTING, SECURITY, CHANGELOG, LICENSE, third-party notices and release checklist.
- [ ] Logo provided by maintainer; no placeholder logo shipped as final branding.
- [ ] Accessibility, privacy and security review.

Phase 13 — Mobile and ecosystem
===============================

- [ ] Validate Tauri 2 Android support and platform requirements at implementation time.
- [ ] Choose mobile inference: direct native runtime, compatible local service, or LAN/Termux connection. Do not assume desktop Ollama/CUDA runs on Android.
- [ ] Android permissions, storage, microphone, camera, battery and background behavior.
- [ ] Installable APK built and smoke-tested on a supported Android device/emulator; if unavailable, document the precise toolchain/device blocker.
- [ ] Complete a real mobile connection flow to an on-device runtime or an explicitly configured LAN/Termux/remote provider; test permissions and failure states.
- [ ] Implement safe auto-update only after signing, integrity verification, rollback and trust model are planned and tested.
- [ ] Optional community themes/profiles/toolsets and extensions after security review.
- [ ] Plugin permission and distribution model designed before accepting third-party executable plugins.

Release gates
-------------

Every milestone should be demonstrably usable, not just structurally present. Before marking a phase complete:

- Run lint, type checking, tests and production build.
- Test its success, empty, disconnected and failure paths.
- Review keyboard/accessibility and responsive states relevant to the feature.
- Check local data/network behavior and verify no secrets or model files entered Git.
- Update documentation and `PROJECT_STATE.md` with reality.
- Review `git diff`; make a descriptive commit when a stable checkpoint is reached.
- Verify GitHub SSH remote before pushing. Never force-push or rewrite history without explicit permission.

Full-scope delivery rule
========================

Do not stop when Phase 1 is complete. Continue through every applicable phase and close the associated requirement IDs in `IMPLEMENTATION_TRACKER.md`. A navigation entry must never be shipped as “soon” or as a dead placeholder. When a feature depends on an external service, engine, credential, device or unsupported host platform, implement its real setup/capability/error behavior and record what could not be tested; never fake success. Mark the app complete only when every applicable requirement is verified. The explicitly optional/Future items may remain excluded only with their scope and reason documented.

2026-11-17 provider follow-through: multiline SSE and invalid/truncated management responses handled; cancelled stale provider inventory results; provider/model-scoped capability state. Unit suite 28 passing, browser suite 8 passing; lint/typecheck/static export passed. Continue remaining phases; native system-library blocker persists.
