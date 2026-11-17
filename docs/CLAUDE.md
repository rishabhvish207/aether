> Repository adaptation (2026-11-17): Codex is the implementation agent. This repository began empty except for these documents; references below to an existing UI/screenshot/Claude are historical context. Follow root AGENTS.md, current PROJECT_STATE.md and IMPLEMENTATION_TRACKER.md for actual implementation evidence. The complete target remains unchanged.

Aether — Repository Instructions for Claude Code
================================================

These instructions apply to every Claude Code session in this repository. The complete product requirements are in `docs/AETHER_SRS.md`; implementation sequencing is in `docs/ROADMAP.md`; the local development environment is in `docs/LOCAL_AI_SETUP.md`; and completion evidence is tracked in `docs/IMPLEMENTATION_TRACKER.md`. Read them before implementation.

Mission and scope
-----------------

Build the complete Aether product described by the SRS and roadmap. The maintainer explicitly does not want only an MVP, a visual prototype, a one-feature demo, or a shell with items marked “soon”. The roadmap is an execution order, not permission to stop after an early phase. Continue implementing every applicable P0, P1 and P2 feature until the full target is functional and verified. Only features explicitly labelled Future or explicitly optional in the requirement itself may be left out of the target scope.

The latest supplied screenshot is evidence of the problem to avoid: core navigation such as Models, AI Profiles, Benchmarks and Settings appears as “soon”. That is not an acceptable final state. Implement those screens and their underlying operations end to end. Do not leave placeholder navigation, dead buttons, fake data, mock success states, TODO-only implementations or unimplemented controls in the shipped UI.

The product name is exactly `Aether` for now. Do not rename it or use “Aether Studio”. Keep display branding centralized and document any fixed native/package identifiers that require a rename checklist.

Full-build working method
-------------------------

- Inspect the actual repository, code, test setup, `git status`, remotes, branch, dependencies and existing user changes before editing. Extend the existing app; do not discard it or blindly scaffold over it.
- Read the SRS and roadmap in full. Create or update `docs/IMPLEMENTATION_TRACKER.md` with every functional requirement ID, current status, implementation evidence, tests/evidence needed and remaining work. Do not mark a requirement done from appearance alone.
- Produce a short audit and execution plan, then immediately start implementation. The audit is not the deliverable and must not be the end of the session.
- Work in small, internally sequenced vertical slices so the code remains buildable; nevertheless, continue across phases without asking the user whether to proceed after each phase. A phase boundary is a checkpoint, not a stop condition.
- If the available context/session ends before completion, update `PROJECT_STATE.md`, the tracker and the roadmap with exact completed work, exact remaining work and the next concrete action so the next session resumes automatically. Never relabel an incomplete app as complete.
- Do not ask the maintainer to make routine choices. Make reasonable, reversible decisions and document them. Ask only when a genuinely blocking decision requires the maintainer's preference, credentials, branding asset, license choice or authorization for a destructive/irreversible action. Use placeholders only for external values that truly must be supplied, and keep those controls honest and clearly explained.
- If you discover that an external service, hardware device, API credential, OS permission or unsupported host platform is needed, implement the full supported integration, setup flow, capability detection, failure states and documentation. Report what could not be exercised locally. Never replace real behavior with a demo or pretend success.
- Do not try to write the entire application as one untested patch. Complete the full scope through tested slices, preserving a runnable app and tracking each requirement until all applicable requirements are verified.

Architecture rules
------------------

- Frontend: Next.js App Router, React, TypeScript and Tailwind CSS, using currently supported stable versions verified against official docs during implementation.
- Make the frontend statically exportable for Tauri 2. Do not rely on permanent Next.js SSR, Next.js Route Handlers or Server Actions for core app operation. Tauri's documented Next.js integration uses static export and the generated `out` directory; verify current instructions before changing this configuration.
- Tauri 2/Rust is the native capability layer for the full desktop application: filesystem access, dialogs, downloads, process/health checks, secure credentials, SQLite, backup/restore, platform resource monitoring and permitted tools.
- Use a narrow, typed application-service boundary. UI components must not contain provider-specific protocol logic or unrestricted native operations.
- Keep Provider (API/interface/endpoint) separate from Runtime (inference engine). Implement Ollama first, then the SRS provider/server adapters, including OpenAI-compatible endpoints, remote Ollama, llama.cpp server and LM Studio where their APIs support it.
- Provider capabilities are dynamic and may differ by model/server. Capability-gate streaming, thinking, vision, audio, tools, structured output, embeddings and model management; explain unsupported capabilities accurately.
- Keep storage behind interfaces. The browser preview may use IndexedDB; the native app uses SQLite with migrations. Do not bind features directly to React state, localStorage, SQLite or a single provider.
- Do not store model weights, large attachments or backups inside the source repository or SQLite. Use configurable user-selected paths and safe streaming-to-disk operations.
- Use Lucide React (or a documented maintained alternative) for icons; never use emoji as UI icons. The maintainer will supply the final logo.
- Use reusable design tokens and fully functional, responsive screens. Default to dark, support light/system and the appearance/accessibility controls in the SRS.

Required functional coverage
----------------------------

Implement the full scope in `docs/AETHER_SRS.md`, including at least all of the following end-to-end modules. The SRS remains authoritative and may contain additional detail beyond this summary.

1. Application shell and onboarding: setup/welcome, local-first explanation, responsive navigation, global status, functional home/empty/error/loading views, theme system, keyboard accessibility and no dead navigation.
2. Chat: configurable provider/model selection; streaming; stop/cancel; retry; edit-and-resubmit; regenerate; delete/copy; provider-supplied thinking in a separate collapsible section; safe Markdown, math only if added safely, syntax-highlighted code, tables, attachments, token/performance details; temporary chats that do not persist; durable history with search, rename, delete, reopen, folders/workspaces, pin/star, branching and export where specified.
3. AI Profiles: complete create/read/update/duplicate/delete workflows, editable starter templates (General Assistant, Coder, Researcher, Study Tutor, Note Maker, Writer and Roleplay), system prompts, output preferences, generation defaults, provider/model binding, capability preferences, versioned import/export and validation.
4. Models and downloads: inventory by provider, GGUF local import, direct URL and Hugging Face repository/file discovery, selected file/quantization, gated authentication where supported, target path, space checks, streamed progress, speed, cancel/resume, verification, errors/retry and recovery; configurable storage location; runtime-managed vs original-file distinction; safe registration/removal; Ollama Modelfile generation/preview/apply; resource estimates labelled as estimates. Never manually alter Ollama-managed blobs.
5. Inference configuration: model/runtime-aware controls for temperature, top-p/top-k/min-p, context, repetition penalty, seed, stop sequences, keep-alive and thinking where supported; distinguish app/profile/provider/conversation settings; preview changes and explain unsupported parameters.
6. Provider/server management: add/edit/test/enable/disable/remove/list connections; local, LAN and remote classification; Ollama, remote Ollama, OpenAI-compatible, llama.cpp and LM Studio adapters where compatible; timeouts, optional headers/auth, capability reporting and secure native credential storage. Show users where requests go.
7. Multimodal and files: images via attachment/paste/drag-drop; text/code files; validated file previews and extraction; PDF/document extraction; supported camera capture with explicit permission; clear capability checks. Implement optional local indexing/RAG as described in the SRS with traceable source excerpts, not invented citations.
8. Voice: real STT/TTS interfaces and an actual supported local-engine integration path; setup/download/license notes for suitable engines; push-to-talk, transcription preview, send-to-chat, auto-speak and voice/rate/volume controls where supported. Advanced live duplex features may remain out only where the SRS explicitly calls them later/optional.
9. Research: opt-in web/search/open/extract workflow, configurable provider, user-visible network disclosure, trustworthy source collection, actual links/citations, source-vs-synthesis distinction, saved research workspace and report export where specified. Never fabricate sources or citations.
10. Agents and tools: typed tool registry and execution loop; permission manager; workspace-scoped file operations; visible inputs/outputs, step history, diffs, explicit approval, cancellation, budgets/timeouts/iteration limits, audit log and rollback/recovery where applicable. Terminal/shell access must be governed by explicit policies and confirmations. Never execute raw model output directly.
11. Benchmarks/resources: repeatable versioned tests and custom prompts; warm/cold run distinction; real provider metrics for prompt processing/output tok/s/TTFT/load/total time; record model/provider/settings/hardware/context; capture RAM/swap/VRAM/GPU/temperature only when supported; history, comparisons, export; do not invent metrics or quality scores.
12. Settings and customization: every category specified by FR-130; searchable/resettable settings; shortcuts and conflict handling; bundled/custom themes and import/export; adjustable density/font/chat width/sidebar/spacing/motion/glass; reduced motion/transparency and high-contrast accommodations.
13. Persistence and portability: local-first structured records; IndexedDB preview adapter; SQLite native adapter and migrations; profile/theme/settings/model-config/conversation/attachment/benchmark/workspace/tool export; versioned backups, manifest and checksums; restore preview, conflicts, category selection and safe extraction; credentials and model weights excluded by default.
14. About and project hygiene: version, dependencies/third-party notices, licenses, privacy statement, acknowledgements and configurable repository/creator links without invented values; README, contributing/security guidance, changelog, architecture/development docs, release notes and dependency/license review.
15. Native build and delivery: fully integrate Tauri 2 and Rust for the Linux desktop target, static frontend export, native capabilities, secure storage and packaged build; keep cross-platform adapters/configuration where possible; Android requires its own valid runtime/network model and permissions, never desktop CUDA assumptions. Document precisely which platform artefacts were built and tested.

Completion and verification rules
---------------------------------

- All visible features must be functional. No “soon”, “planned”, “coming soon”, dead links, inert buttons, no-op settings or fake placeholders in final navigation. If a truly optional feature is not offered, do not show it as a broken/incomplete module; document the omission and its reason.
- For every requirement, collect evidence: code path, test(s), manual smoke-test steps and any genuine environment limitation. Maintain a feature-to-requirement traceability matrix in `docs/IMPLEMENTATION_TRACKER.md`.
- Add automated tests for stream parsing/cancellation, persistence/migrations, imports/exports, download validation/resume, permissions, provider capability differences, backup path safety and other risky boundaries. Do not limit testing to component snapshots.
- Run lint, TypeScript checks, unit/integration tests and production build after relevant changes; build the Tauri app for the available host and test actual package launch when possible. Test empty, loading, success, error, disconnected, cancellation and permission-denied paths.
- Manually smoke-test every navigation destination and core workflow at narrow mobile and desktop sizes. Check keyboard/focus/accessibility and dark/light/system themes.
- Verify privacy/network flows, absence of default telemetry, secret handling, safe Markdown, path traversal protections and tool permissions. Check Git diff for secrets, giant files, generated output and debug code.
- Keep user-owned Git changes intact. Never run `git reset --hard`, `git clean -fd`, force push or history rewrite. Inspect branch/remotes before any Git configuration change. Do not commit/push/publish without the maintainer's authorization; never claim a push or test succeeded unless it did.
- Do not mark the tracker or roadmap complete until all applicable requirements are implemented and verified. A running dev server and a polished shell do not mean the product is complete.

When reporting progress
-----------------------

Give concise, factual checkpoints: modules now working, requirements closed, tests actually run, build/package results, known external/platform limitations and the next exact task. Do not ask the user to authorize every ordinary next phase. Continue on to the next phase unless a real blocker requires their input. At full completion, report any explicit optional/Future items that remain out of scope and provide a feature matrix that demonstrates the rest is implemented and tested.
