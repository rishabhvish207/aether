Aether — Software Requirements Specification
============================================

Document status: Draft for implementation
Specification version: 0.1
Product name: Aether (working name; keep easy to rename)
Product category: Local-first AI workspace and model manager
Primary developer environment: Arch Linux, Fish, Ollama, NVIDIA laptop GPU

Purpose
-------

This document defines Aether's complete intended product scope, user-facing requirements, architecture constraints, safety requirements, acceptance criteria, and delivery plan. It is the primary product specification. If implementation convenience conflicts with a requirement here, preserve the requirement or document a proposed change before implementing it. The user has explicitly asked for the complete application, not only a prototype or initial chat MVP. All roadmap phases and applicable functional requirements are part of the requested end state.

Aether is intended to be a polished, configurable, open-source, local-first AI workspace. It should provide a coherent interface for chat, model management, provider/server configuration, AI profiles, benchmarking, local history, backup/restore, and—over time—voice, research and agent workflows. Aether should not be merely an Ollama-themed chat window. Ollama is the first supported runtime/provider, not the product's permanent boundary.

Product vision
--------------

Aether should let users discover, connect, configure, run, benchmark and organize AI models from a single attractive application. It should prioritize local privacy and user control, while allowing opt-in connections to remote servers and online model repositories. The application should work without a public Aether backend. Desktop and mobile releases should be installable applications rather than requiring the user to manually run a Next.js development server.

Aether should balance five goals:

- Excellent visual quality: refined liquid-glass-inspired surfaces, thoughtful spacing, typography, transitions, responsive layouts and multiple themes.
- Practical model control: downloads, local imports, runtime/provider selection, settings, resource estimates, benchmarking, history and backups.
- User freedom: custom AI profiles, prompt/configuration control, local and remote providers, and support for compatible models/capabilities without assuming every model supports every feature.
- Local-first privacy: conversation history, configuration and backups remain local by default; networking is explicit and visible.
- Maintainability and user understanding: a modular architecture, clear names, tests, documentation and small verifiable implementation milestones.

Normative language
------------------

The words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY express requirement strength. “Later” describes sequencing within the complete build. “Future” is outside the current target unless the roadmap or maintainer explicitly brings it into scope. The current request includes the complete roadmap; do not interpret later milestones as omitted product features.

Target users
------------

- People running local models on a personal computer or mobile device.
- Developers who want a local model client, coding helper and eventually a permission-controlled coding agent.
- Users who want to manage many models and compare their practical performance on their own hardware.
- Users who want configurable assistant personas/profiles for research, roleplay, coding, writing, studying and note-making.
- Users who want control over history, privacy, storage and backups.

Platforms and runtime assumptions
---------------------------------

Initial development target: desktop web preview on the developer's Linux machine.

Concrete runnable target: an installable desktop application on Linux, using a web frontend hosted by Tauri 2 and a native local core. Keep Windows and macOS builds supported by the architecture and build configuration, but never claim they were tested when the current host cannot test them. Android is a planned target and must use a suitable mobile inference/runtime strategy or a clearly configured local/LAN/Termux connection; do not assume desktop Ollama/CUDA runs on Android. iOS is optional/future and should not drive the architecture. The full feature set must be implemented behind platform-capability adapters so a native platform can expose every feature it supports and clearly explain genuine platform limitations.

The chosen UI stack is Next.js App Router, React, TypeScript and Tailwind CSS. The frontend MUST be designed for static export so it can be packaged into Tauri; it MUST NOT depend on a permanent Next.js server, Server Actions, runtime SSR or Next.js Route Handlers for core app operation. Official references: Next.js static export documentation and Tauri's Next.js guide, listed in the references section.

Aether has no mandatory remote application backend. Aether still needs a local/native capability layer for file access, process management, local model downloads, runtime management, native SQLite access, OS credential storage, and other privileged operations. In production this belongs behind a narrow Tauri/Rust command or capability interface. Browser development mode MAY use browser-compatible adapters with a visibly limited capability set.

Architecture principle
----------------------

The UI MUST talk to application services and provider interfaces, not directly to a single runtime throughout component code.

Conceptual flow:

    Aether UI (Next.js / React)
        -> feature services
            -> provider and runtime interfaces
                -> Ollama / OpenAI-compatible server / llama.cpp / LM Studio / future adapters
            -> storage interface
                -> browser IndexedDB adapter in web preview
                -> SQLite/native storage adapter in Tauri release
            -> native capability bridge in desktop/mobile builds
                -> filesystem, downloads, process management, OS keychain, backup/restore

Provider and Runtime are different concepts. A provider represents the API or endpoint used to communicate with a model. A runtime is the inference engine. The types may map one-to-one in simple cases, but MUST NOT be conflated in the overall architecture.

Identity and renaming
--------------------

The visible working name is Aether. Do not rename it or append “Studio” without explicit authorization. The final public brand may change later, so:

- Put the display name and brand metadata in a single shared source-of-truth module or metadata file where practical.
- Avoid hardcoding the display name inside UI components, messages, logs and feature modules. UI should import a shared brand/config value.
- Keep package name, repository slug, Tauri bundle identifier, app display name and storage-directory name distinct concepts. Native manifests may require literal identifiers; document the small rename checklist rather than pretending every identifier can be dynamically shared.
- Do not use the brand name as a namespace for unrelated business logic.
- Do not assume the name is globally unique. It remains the working name for now; trademark/domain/repository uniqueness should be checked before public launch.

Technology decisions
--------------------

Required or intended:

- Next.js App Router, React, TypeScript, Tailwind CSS.
- Tauri 2 and Rust for installable desktop/native integration, added after the initial web UI and provider vertical slice work.
- Lucide React for consistent open-source icons. Do not use emoji as UI icons. The developer will provide the logo later.
- SQLite as the long-term canonical structured store in the native application.
- A storage abstraction so browser preview can use IndexedDB before the SQLite/Tauri adapter is implemented.
- Ollama as the first local provider, default endpoint `http://127.0.0.1:11434`.
- Provider adapters for OpenAI-compatible APIs, remote Ollama, llama.cpp server and LM Studio as staged additions.
- Local files for GGUFs, attachments, exports and backups; do not store large binaries in SQLite.
- A tested Markdown renderer with syntax highlighting and sanitization.

The implementation agent MUST check current stable versions and official docs at implementation time. It MUST NOT pin outdated package versions just because this SRS was written earlier. Avoid unnecessary dependency sprawl. Choose maintained libraries with suitable licenses and document important choices.

Product scope and priorities
----------------------------

Priority definitions and full-scope rule:

- P0: foundational requirements; implement first.
- P1: important requirements; implement after their dependencies are stable.
- P2: advanced requirements; implement after prerequisite work is reliable.
- Future: explicitly outside the current product target unless the maintainer later brings it into scope.

P0/P1/P2 are sequencing and dependency labels, not permission to omit a feature from the complete application requested here. The full build is not complete while an applicable requirement is absent, represented only by a placeholder, marked "soon", mocked, or described as a future milestone. Only requirements explicitly labelled Future or explicitly optional by their own wording may remain out of the shipped scope. If a platform or external service genuinely prevents a capability from being exercised in the current environment, implement the real integration and its capability/error/setup path, record the limitation accurately, and do not fabricate success.

Functional requirements
=======================

1. First launch and connectivity
--------------------------------

FR-001 [P0] Aether MUST show a welcome/setup experience that explains the application is local-first and that inference is performed by the selected provider/runtime.

FR-002 [P0] Aether MUST test the default local Ollama endpoint `http://127.0.0.1:11434` and report connected, unreachable, unauthorized or incompatible states with useful recovery guidance.

FR-003 [P0] Users MUST be able to add, edit, test, select, disable and remove provider/server connections. The default local endpoint MUST be editable rather than hardcoded as the only endpoint.

FR-004 [P0] Provider endpoint configuration MUST distinguish localhost/LAN endpoints from arbitrary remote endpoints and clearly indicate where requests will be sent.

FR-005 [P0] Aether MUST NOT require a hosted Aether server for core local chat. Network access for Hugging Face, remote providers, web research, updates and optional integrations MUST be explicit and feature-dependent.

FR-006 [P0] Connection errors MUST be shown in the UI; they MUST NOT be swallowed or replaced with fake responses.

2. Chat and conversation interaction
------------------------------------

FR-010 [P0] Users MUST be able to select a provider and a model, create a conversation, submit text, receive streamed output and stop generation.

FR-011 [P0] The interface MUST show generation state: connecting/loading, generating, stopped, completed and error. Send/stop controls MUST behave correctly during these states.

FR-012 [P0] The chat renderer MUST support Markdown including headings, lists, tables, links, blockquotes and fenced code blocks. Code blocks SHOULD have language-aware syntax highlighting and copy controls. Raw model output MUST be sanitized before rendering HTML-capable content.

FR-013 [P0] Messages MUST support copy, edit-and-resubmit, regenerate, delete and export where applicable. Regeneration/editing SHOULD preserve a clear conversation branch/history model; implement branch-aware behavior in the full product rather than relying on a temporary MVP simplification.

FR-014 [P0] Aether MUST handle streaming chunks correctly, including partial Unicode, partial Markdown fences, cancellation, failed requests and final metrics.

FR-015 [P0] The internal message representation MUST be structured, not only one text string. It SHOULD accommodate text, provider-provided thinking, images, attachments, tool calls, tool results, errors, timestamps, token metrics and future multimodal parts.

FR-016 [P0] If a provider/model returns a separate `thinking` field, Aether MUST display it separately from the final answer in a collapsible, clearly labeled panel. The application MUST NOT fabricate or infer hidden reasoning that the provider did not return. A setting SHOULD control whether supplied thinking is shown by default.

FR-017 [P0] The conversation view MUST show the active model/profile, connection state and a compact generation status. Advanced token/speed/context metrics MAY be in a details panel.

FR-018 [P0] Temporary chat MUST be a first-class mode. The app MUST NOT persist its conversation messages to normal history. Its temporary state and files SHOULD be cleared on close/end according to a documented policy. The UI MUST clearly indicate temporary mode.

FR-019 [P0] Normal history MUST be stored locally and support creating, renaming, searching, deleting and reopening conversations. Search SHOULD include message content and titles.

FR-020 [P1] Users SHOULD be able to branch a conversation, pin/star conversations, organize them into folders/workspaces, and export to Markdown, JSON and plain text.

FR-021 [P1] Streaming UI SHOULD support auto-scroll that pauses when the user scrolls up, a jump-to-latest control, retry from error and visible cancellation.

FR-022 [P1] Conversation export MUST clearly state whether it includes thinking, tool activity and attachments. Those should be configurable.

3. AI Profiles (personas / assistant configurations)
----------------------------------------------------

FR-030 [P0] Aether MUST support reusable AI Profiles. “AI Profile” is the preferred product terminology; do not copy PocketPal's “Pal” terminology.

FR-031 [P0] An AI Profile MUST contain at least: ID, name, description, system prompt/instructions, preferred provider/model, default generation parameters, optional output-style settings, and created/updated timestamps.

FR-032 [P0] Users MUST be able to create, duplicate, edit, delete, import and export profiles.

FR-033 [P0] Starter profile templates SHOULD include General Assistant, Coder, Researcher, Study Tutor, Note Maker, Writer and Roleplay. These are editable templates, not hard-coded app modes.

FR-034 [P0] Users MUST be able to bind a profile to a specific model or allow it to use the current selected model. If the required model/provider is missing or incompatible, Aether MUST explain the mismatch rather than silently switching.

FR-035 [P1] Profiles SHOULD be able to specify desired capabilities such as vision, audio, web/research tools, code tools, memory behavior, preferred voice and output format. Availability MUST be checked against provider/model capabilities at runtime.

FR-036 [P1] Profile sharing MUST use a portable format, such as versioned JSON. It MUST exclude provider secrets by default.

4. Model management and Hugging Face
------------------------------------

FR-040 [P0] Aether MUST list models available from each configured provider and distinguish installed local models from remote models.

FR-041 [P0] Aether MUST support importing an existing local GGUF file. The UI MUST not require the user to move the source file into the app repository.

FR-042 [P0] Aether MUST support downloading a public GGUF by direct URL to a configurable model-storage location. Downloads MUST show progress, size when known, speed, pause/cancel where supported, failure status and resumability where supported.

FR-043 [P1] Aether SHOULD support Hugging Face repository search/details through the public Hugging Face API, with model-card/repository links, file listing, quantization/file size and gated/private-repository authentication when required. Never assume every repository or model file is a GGUF.

FR-044 [P0] Before a large download, Aether MUST show the target path, estimated size, available disk space and a warning when storage is insufficient or uncertain.

FR-045 [P0] Download and import workflows MUST never silently write multi-gigabyte model files into the source repository or system root. The configured model directory is the authoritative destination.

FR-046 [P0] Imports MUST validate file existence and basic format/metadata where possible. If a checksum is known, the user SHOULD be able to verify it. Never claim verification without computing it.

FR-047 [P0] The model manager MUST distinguish the original downloaded GGUF from runtime-managed/internal model blobs. It MUST explain when an Ollama import creates an additional representation or copy. It MUST NOT manually delete provider-managed blobs as part of ordinary cleanup.

FR-048 [P0] Model removal MUST clearly distinguish: (a) removing a model registration from a provider, (b) deleting an original GGUF source file, and (c) removing runtime-managed weights. Each destructive operation MUST be confirmed and clearly describe what will be deleted.

FR-049 [P0] Aether MUST support a configurable default model-data directory and detect unavailable/missing mount points before starting operations that depend on them.

FR-050 [P1] Aether SHOULD support installing an Ollama-importable GGUF through a generated Modelfile. The user should edit structured configuration fields in Aether rather than being required to hand-write a Modelfile, but a raw/advanced view MAY be provided.

FR-051 [P1] The app SHOULD support local model folders and local runtime/server registrations beyond Ollama where practical.

FR-052 [P1] The app SHOULD support model search and install from remote Hugging Face repositories. Downloads MUST be cancellable and MUST not pretend that a repository page URL is a direct file URL without resolving it correctly.

5. Model configuration and resource fit
---------------------------------------

FR-060 [P0] Aether MUST provide a model/runtime configuration UI for supported generation options, including temperature, top-p/top-k/min-p where supported, context length, repeat penalty, seed, stop sequences, keep-alive and thinking controls where supported.

FR-061 [P0] Configuration MUST be stored locally as Aether configuration/profile data. Applying a change to a provider/runtime MUST be explicit and reversible where possible; never silently mutate the original model file.

FR-062 [P0] For Ollama-backed GGUF imports, Aether MAY generate a Modelfile from the structured configuration and show a preview/diff before creating or replacing a named model. It MUST warn that re-importing may create extra disk usage and that runtime-managed data should not be edited manually.

FR-063 [P1] Before installation or loading, Aether SHOULD estimate disk, RAM and VRAM needs using model size/metadata, quantization, context and measured hardware where available. Estimates MUST be labeled estimates, not guarantees.

FR-064 [P1] Aether SHOULD display actual loaded-model processor split, context and memory/throughput metrics when the provider exposes them. It MUST NOT infer exact GPU layers or RAM use from model size alone.

FR-065 [P1] Aether SHOULD warn when available RAM is low, swap is growing rapidly, or requested context is likely to cause memory pressure. It SHOULD suggest lower context/quantization or a smaller model without automatically changing configuration.

6. Providers and servers
------------------------

FR-070 [P0] Implement Ollama as the first provider, including model listing, chat streaming, stop/cancel where supported, model show/configuration, model create/import, model delete and loaded-model status.

FR-071 [P1] Implement an OpenAI-compatible endpoint provider, configurable with base URL and API key. Do not assume all compatible servers support the same features.

FR-072 [P1] Add adapters for remote Ollama, llama.cpp server and LM Studio/OpenAI-compatible servers as separate milestones.

FR-073 [P1] Each provider MUST declare or report its capabilities, including streaming, thinking, vision/images, tool calling, structured output, embeddings, audio and model-management operations where relevant.

FR-074 [P0] Provider capability declarations MUST be treated as dynamic and potentially incomplete. Aether MUST handle unsupported features gracefully and explain when a feature is unavailable.

FR-075 [P0] Remote provider settings MUST not expose API keys in the UI after save. Secrets MUST be stored using the OS credential store in native builds where feasible; in web preview, warn about browser-storage security and do not claim secrets are hardware-secured.

FR-076 [P1] Remote endpoints MUST support a connection test, request timeout, customizable label and optional authentication headers. Arbitrary remote base URLs MUST be visible and user-controlled.

7. Attachments, vision and documents
------------------------------------

FR-080 [P0] The data model and chat composer MUST be designed to support attachments without redesigning the message schema later.

FR-081 [P1] Add image upload/paste/drag-and-drop for providers/models that advertise image input. Display capability warnings for text-only models.

FR-082 [P1] Add text and code file attachments, with filename/type/size validation and user-visible extraction behavior.

FR-083 [P2] Add PDF/document extraction, folder/project context and optional local indexing/RAG. Clearly distinguish retrieved excerpts from model-generated text.

FR-084 [P2] Add camera capture on platforms with camera capability, with explicit permission and user-visible preview before sending.

8. Voice
---------

FR-090 [P1] Design a provider interface for text-to-speech (TTS) and speech-to-text (STT), independent of the chat provider.

FR-091 [P1] Add push-to-talk/record, transcription preview, send-to-model, auto-speak and user-selectable voice/rate/volume when appropriate local engines are configured.

FR-092 [P1] Evaluate Kokoro, Piper, Whisper/whisper.cpp, sherpa-onnx or equivalent options for platform support, quality, footprint and licenses before selecting a bundled/default engine. Model weights and third-party components may have different licenses; document them.

FR-093 [P2] Add streaming TTS, interruption/barge-in and continuous realtime voice only after push-to-talk is reliable.

9. Research and web sources
---------------------------

FR-100 [P1] Research mode SHOULD be a profile/workflow with configurable search/open/extract capabilities, not merely a system prompt.

FR-101 [P1] Research output MUST show citations/links for externally sourced claims and distinguish retrieved source content from model synthesis. Do not fabricate citations.

FR-102 [P1] Web access MUST be opt-in per provider/profile/session and indicate when a query will leave the local device.

FR-103 [P2] Add saved research workspaces with source collections, notes and exportable reports.

10. Agents and tools
--------------------

FR-110 [P2] The complete Aether target MUST include an Agent Mode in which the model can request tool operations and Aether orchestrates controlled execution loops, subject to the permission and safety requirements in FR-111–116.

FR-111 [P2] Tools MUST be registered with typed schemas, human-readable descriptions, capability requirements and permission policies.

FR-112 [P2] Tool execution MUST run through a permission manager and an executor, not arbitrary component code. Model output MUST never directly execute shell commands without policy checks.

FR-113 [P2] Filesystem and terminal tools MUST have workspace-scoped boundaries by default. File reads/writes outside approved roots require explicit approval. Destructive commands, privilege escalation, package installation, network exposure and credential access require elevated confirmation or should be blocked.

FR-114 [P2] For proposed file edits, Aether SHOULD show a diff and ask for approval before applying. The user MUST be able to cancel a run and inspect tool inputs/outputs.

FR-115 [P2] Agent runs MUST have visible step history, timestamps, cancellation, maximum-iteration/token/time limits, error recovery, and an audit trail stored locally.

FR-116 [P2] Tool outputs are untrusted data and MUST NOT be allowed to change the permission policy. Content from files/web pages may contain prompt injection; tool boundaries and confirmation rules must remain in force.

11. Appearance and responsive design
------------------------------------

FR-120 [P0] Dark mode MUST be the default first-launch theme. The user MUST also be able to select light mode and system-following mode.

FR-121 [P0] Aether MUST include a refined liquid-glass-inspired design language: layered translucent surfaces, restrained blur, soft borders, depth, coherent spacing, typography and polished motion. It MUST remain legible and usable without transparency effects.

FR-122 [P0] Build a token-based theme system covering color roles, surfaces, borders, shadows, radius, typography, motion, density and glass/blur settings. Do not hardcode theme values across feature components.

FR-123 [P1] Users SHOULD be able to switch between bundled themes and import/export custom themes. Suggested initial themes include Aether Dark, Aether Light, Graphite, Aurora and Glass, subject to visual review.

FR-124 [P0] Include reduced-motion, reduced-transparency and high-contrast/accommodation options where possible. Respect OS reduced-motion preferences by default.

FR-125 [P0] The application MUST be responsive for desktop and mobile widths, keyboard accessible and touch-friendly. It MUST not assume that desktop sidebar layouts fit a phone.

FR-126 [P0] Use Lucide React (or a documented alternative chosen after license/maintainability review) for general icons. Do not use emoji as interface icons. The developer will provide the Aether logo later.

FR-127 [P1] Add adjustable density, font size, chat width, sidebar behavior, message spacing and animation preferences.

FR-128 [P1] Theme configuration SHOULD be versioned and portable, independent from application settings.

12. Settings and keyboard shortcuts
-----------------------------------

FR-130 [P0] Settings MUST be organized into clear categories: General, Appearance, Chat, Models, Providers/Servers, Inference, AI Profiles, Voice, Tools/Agent, Storage, Privacy, Shortcuts, Backup, Advanced and About. Categories can be introduced incrementally.

FR-131 [P0] Settings MUST distinguish app settings, provider settings, model profile settings and per-conversation overrides.

FR-132 [P1] Settings SHOULD include a search field and defaults/reset controls. Reset must show a confirmation and preserve user data unless the user explicitly requests clearing it.

FR-133 [P1] Keyboard shortcuts MUST be configurable. Conflicts MUST be detected and explained.

13. Persistence, backups and restore
------------------------------------

FR-140 [P0] Persistent conversation and app data MUST be local by default. Structured data SHOULD use SQLite in the native release, with explicit schema migrations; web-preview storage SHOULD use an adapter such as IndexedDB.

FR-141 [P0] The storage layer MUST be abstracted so UI/features do not bind directly to SQLite, IndexedDB or localStorage.

FR-142 [P1] Users MUST be able to export selected data: settings, themes, profiles, conversations, attachments, benchmark history, model configurations, toolsets, workspace metadata and backup manifest.

FR-143 [P1] Backup UI MUST let users choose categories. Model weights MUST be excluded by default due to size; a manifest SHOULD record model identity, source repository/URL, revision, quantization, path and checksum where available.

FR-144 [P1] Restore MUST preview the contents, detect conflicts, validate versions/checksums where applicable and ask before overwriting. Archive extraction MUST defend against path traversal and unsafe links.

FR-145 [P1] Provider credentials and API keys MUST be excluded by default. If credential export is ever added, it MUST be separately opted into and encrypted, with clear warning. Prefer references to OS credential storage rather than export of secrets.

FR-146 [P1] A backup SHOULD contain a versioned manifest and integrity checksums. Restore should support skipping incompatible sections rather than silently corrupting data.

FR-147 [P2] Add scheduled backups, retention policies and restore points.

14. Benchmarking and resource monitoring
----------------------------------------

FR-150 [P0] Aether MUST present basic provider/model state and connection health.

FR-151 [P1] Benchmarking MUST measure, when supported: load duration, time to first token, prompt tokens and prompt processing tokens/sec, output tokens and generation tokens/sec, total duration, selected model/provider/configuration, timestamp and errors.

FR-152 [P1] Where available and permitted, capture RAM, swap, VRAM, GPU utilization, temperature and CPU/GPU offload at a defined sampling interval. Mark unsupported metrics instead of fabricating values.

FR-153 [P1] Benchmarks MUST use a versioned, repeatable prompt set and allow custom prompts. Warm-up and cold-start runs SHOULD be differentiated. Report the model's context/parameters, not just the model name.

FR-154 [P1] Benchmark history MUST be local and exportable. Comparisons must account for differing context, quantization, runtime, hardware and test versions.

FR-155 [P1] Quality scores MUST NOT be invented from timing tests. Use manual user ratings or an explicitly labeled optional evaluator with disclosed limitations.

FR-156 [P1] The first benchmark implementation SHOULD use available provider metrics such as Ollama's prompt/evaluation token counts and durations. Time the first streamed content token client-side if the provider doesn't supply TTFT. Do not call a wall-clock-only test “tokens per second.”

15. About, open source and community
------------------------------------

FR-160 [P0] Provide an About view with application name, version, licenses/third-party notices, repository link, acknowledgements/credits and privacy statement.

FR-161 [P1] The About view SHOULD include creator/GitHub links and optional donation links, but these are configurable metadata and must not be fabricated. Donation UI may be omitted until actual destinations are supplied.

FR-162 [P0] The repository MUST include README, ROADMAP, project state/progress, development setup, architecture documentation, security reporting guidance, contribution guidance, license (once selected), changelog and third-party notices.

FR-163 [P0] Open-source release MUST use licenses compatible with bundled dependencies and models. Model weights have separate licenses; Aether must not imply that a model's license is the same as the app's.

16. Desktop, mobile and distribution
------------------------------------

FR-170 [P0] The frontend MUST be architected so it can be statically exported and packaged in Tauri without a permanent Next.js runtime server. Tauri's documented static export constraints must be respected.

FR-171 [P1] Add Tauri desktop integration after the browser preview's first working vertical slice: local file access, OS dialogs, app paths, process/health checks, secure storage and backup file selection.

FR-172 [P1] Provide an installable Linux release, with package formats selected after testing and distribution target review. AppImage/deb/rpm may be considered; do not promise every format before validating build tooling.

FR-173 [P2] Add Android packaging through Tauri 2 or a documented alternative. Mobile must use a suitable mobile inference adapter or connect to a local/LAN server; it must not assume that desktop Ollama binaries or NVIDIA CUDA can run on Android.

FR-174 [P2] Support Termux-hosted runtime connections as an optional mobile/power-user workflow, with clear local network/security guidance.

FR-175 [P2] Support auto-update only after release signing, integrity, rollback and trust model are planned.

Non-functional requirements
===========================

NFR-001 Maintainability: features MUST be organized by responsibility. UI components MUST NOT contain provider-specific protocol logic or unrestricted native operations.

NFR-002 Type safety: TypeScript MUST run in strict mode where practical. Avoid `any` unless justified and localized. Validate untrusted runtime data at boundaries.

NFR-003 Reliability: network streams, downloads, database migrations, restore and native tool execution MUST have explicit errors, cancellation where appropriate and recovery behavior.

NFR-004 Security: treat model outputs, imported configs, remote endpoints, attached files and tool results as untrusted. Never execute model output as code without the agent permission layer.

NFR-005 Privacy: no telemetry by default. Any future telemetry must be opt-in, minimal and documented. Conversations, attachments and profiles must not silently leave the device.

NFR-006 Performance: chat streaming should render incrementally without re-rendering the entire history on every token. Large histories and model lists must remain responsive. Downloads should be streamed to disk, not buffered fully in browser memory.

NFR-007 Accessibility: semantic controls, keyboard navigation, focus management, screen-reader labels, visible focus, contrast and reduced-motion options are required.

NFR-008 Responsive design: main flows must remain usable from narrow phone widths through desktop widescreen without merely scaling down the desktop layout.

NFR-009 Storage integrity: migrations and backup/restore need tests. Never silently overwrite user data. Avoid destructive filesystem behavior.

NFR-010 Transparency: indicate provider endpoint, model, network use, tool execution and relevant resource estimates. Never simulate a successful provider response.

NFR-011 Portability: keep platform-specific functionality behind adapters. No unconditional Linux commands or filesystem paths in shared UI logic.

NFR-012 Open-source hygiene: license notices, model-license separation, dependency audit and contributor documentation must be maintained.

NFR-013 Renameability: brand display name is centralized; package/app IDs and other immutable identifiers are documented in a rename checklist.

NFR-014 Educational workflow: repository documents should explain architecture and setup sufficiently for the maintainer and a future AI contributor to understand the current state. Avoid overengineering explanations of concepts not yet implemented.

Security and privacy model
==========================

- Bind Aether's local services only to loopback unless the user explicitly configures a LAN/remote listener.
- Never expose shell execution to a model without the future tool policy/approval system.
- Restrict filesystem agent tools to an explicitly approved workspace by default.
- Use native OS credential storage for API keys in desktop releases where practical; never commit `.env` secrets or credentials.
- Model downloads/imported archive paths must be sanitized. Prevent directory traversal, unsafe symlinks and accidental writes outside the configured storage directory.
- The model folder and the application's source repository MUST be separate. Aether must never put large GGUFs in the Git repository by default.
- Temporary chat should not be inserted into persistent database history. Clear transient attachments according to documented policy.
- Remote server endpoints and web research create network traffic; the UI should disclose it.
- Backups exclude secrets and large model weights by default.
- Do not delete provider-managed blob files directly. Use the provider's supported removal/prune operations and clearly explain effects.
- Do not treat prompt instructions from model output or web content as trusted application policy.

Suggested conceptual data model
===============================

These are starting entities, not a command to build every table in the first sprint:

- AppSettings(id, schemaVersion, values, updatedAt)
- ProviderConnection(id, name, providerType, baseUrl, credentialRef, capabilityOverrides, enabled, createdAt, updatedAt)
- ModelReference(id, providerConnectionId, providerModelId, displayName, sourceType, sourceUrl, localPath, format, quantization, sizeBytes, capabilities, metadata, createdAt, updatedAt)
- ModelConfiguration(id, modelReferenceId, name, generationOptions, contextLength, templateConfig, runtimeOptions, createdAt, updatedAt)
- AIProfile(id, name, description, systemPrompt, modelBinding, defaultOptions, capabilityPreferences, toolsetId, voiceProfileId, createdAt, updatedAt)
- Conversation(id, title, profileId, providerConnectionId, modelId, mode, temporary, createdAt, updatedAt, archivedAt)
- Message(id, conversationId, parentMessageId, role, parts, status, createdAt, completedAt, metrics)
- Attachment(id, messageId, filename, mimeType, sizeBytes, localPath, checksum, metadata)
- BenchmarkRun(id, modelId, providerId, runtimeId, parameters, metrics, testSuiteVersion, resultStatus, createdAt)
- Theme(id, name, schemaVersion, tokens, createdAt, updatedAt)
- BackupManifest(id, schemaVersion, sections, createdAt, appVersion, checksums)
- ToolDefinition(id, name, schema, permissionClass, enabled, configuration)
- AgentRun(id, conversationId, status, events, startTime, endTime, limits)

Structured message parts should be versionable and able to hold text, thinking supplied by the model, image/file references, tool calls/results, and errors. Do not put large binary attachment content directly in message rows.

Acceptance criteria for the first usable chat checkpoint
======================================================

The first milestone is accepted only when all these are true:

- The app starts in a browser development environment and shows a polished responsive Aether shell.
- Dark mode is default; light mode works; the design uses centralized tokens rather than arbitrary per-component colors.
- The app tests the local Ollama endpoint and displays a useful disconnected state if unavailable.
- It lists models returned by Ollama and lets the user choose one.
- The user can send a message, see streamed response chunks, stop generation and see errors.
- If the provider returns `thinking`, it is displayed in a separate collapsible section; final response content is rendered as safe Markdown.
- The provider calls live in an adapter module, not directly in React components.
- No fake assistant replies or hardcoded pretend model list remain in production paths.
- `npm run lint`, type checking and `npm run build` pass; any excluded test is documented with a reason.
- README and PROJECT_STATE/ROADMAP are updated with exact setup, implemented features and next steps.
- A Git diff is reviewed and a milestone commit is ready. Push only when remote/SSH configuration has been verified and the user has authorized or requested the push.

Features not required before the first chat checkpoint, and explicit full-product exclusions
========================================================================================

The following capabilities MUST NOT delay the first usable chat checkpoint: agent execution, advanced real-time voice, mobile packaging, automatic updates, local indexing/RAG and research automation. This is a sequencing rule only: capabilities that are included in the SRS and roadmap remain part of the complete target and MUST be implemented before claiming full completion.

Explicitly outside the current full-product target unless the maintainer later adds them: multi-user/cloud chat synchronisation, complex team collaboration, a public plugin marketplace and an Aether-hosted backend. Model/research/provider integrations that do not require an Aether backend remain in scope. iOS is optional/Future and should not drive architecture. Auto-updates may only be enabled after release signing, integrity verification and rollback/trust behavior have been designed and tested; a decorative updater control is not acceptable.

Risks and mitigations
=====================

- Model feature mismatch: dynamically detect/declare capabilities, allow graceful fallback, label inferred capabilities as uncertain.
- RAM/VRAM misestimates: show ranges and live measurements; never guarantee a model will run based only on GGUF size.
- Ollama duplication: explain original GGUF vs Ollama-managed blobs; don't delete internal blobs manually.
- Next.js/Tauri mismatch: static-export constraints from the start; avoid runtime server-only features.
- Browser capability limitations: use explicit capability adapters and feature-detect; don't hide native functionality behind fake web APIs.
- Agent risk: tools disabled by default until permission, workspace and audit systems exist.
- Large scope: implement in dependency-aware, tested vertical slices and continue through all applicable roadmap phases; do not confuse a completed checkpoint with a completed product.
- Branding collisions: working name is Aether, but verify name/domain/repository/license before public launch.
- License complexity: track code, icons, TTS engines, models and model weights separately.

References and implementation-time verification
================================================

Technical references were checked when this specification was prepared. Re-check official docs during implementation because APIs and stable versions change.

- Next.js App Router: https://nextjs.org/docs/app
- Next.js static exports: https://nextjs.org/docs/app/guides/static-exports
- Tauri Next.js guide: https://v2.tauri.app/start/frontend/nextjs/
- Ollama API: https://github.com/ollama/ollama/blob/main/docs/api.md
- Ollama streaming concepts: https://github.com/ollama/ollama/blob/main/docs/capabilities/streaming.mdx
- Ollama thinking: https://docs.ollama.com/capabilities/thinking
- Ollama tool calling: https://docs.ollama.com/capabilities/tool-calling
- PocketPal AI reference project: https://github.com/a-ghorbani/pocketpal-ai
- Lucide icons: https://lucide.dev/
- Kokoro reference repository/license information: https://github.com/hexgrad/Kokoro-82M

End of specification.

Implementation refinement — 2026-11-17
-------------------------------------
The normative setup/runtime/storage supplement is docs/SETUP_RUNTIME_STORAGE.md. It extends FR-001–006, FR-040–052, FR-070–076 and FR-171 without replacing them: adaptive repeatable setup, existing/Aether/remote runtime ownership, consent-gated isolated local installation, OS-data defaults, real storage inspection, original-file preservation and isolated non-destructive testing. A configured client download directory never relocates an external Ollama library. Existing user-managed services remain unchanged unless the user explicitly approves a disruptive operation; no such operation is implemented by setup. Read the supplement for current verified behavior and limits.
