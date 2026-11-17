# Adaptive setup, runtime ownership and model storage

Normative refinement of the original SRS, requested 2026-11-17. Existing requirements remain in scope. The goal is install → connect/configure → select/download a model → verify inference, with no service-file, environment-variable or manifest knowledge required. Existing user-owned data is never silently adopted, migrated, deleted or reset.

## Ownership and architecture

A provider is an endpoint/API, not an installation. `runtimeOwnership` is optional on existing provider records and records `external`, `aether` or `remote` when setup explicitly establishes it. Setup metadata is a versioned `setup:current` record in the existing storage abstraction. No database reset or schema-destructive migration is needed. New installs prefer General Assistant; otherwise app defaults are used instead of choosing a random UUID-sorted profile. Existing `onboarded:true` settings continue to suppress the first-run wizard. Setup is always available through Settings → Setup & storage and Chat → Review setup.

Discovery reads known loopback APIs and configured local endpoints only; it never scans LANs or changes services. Compatible zero-model responses are successful connections, not installation failures. Configured external providers, chats, settings and profiles keep their IDs/content. Remote/compatible providers cannot claim Ollama installation/process/storage capabilities.

The independently testable Rust crate `src-tauri/runtime-core` owns storage inspection/preparation, runtime child processes, official portable installation, GGUF import and metadata-only diagnosis. `src-tauri/src/setup.rs` is the Tauri adapter; it remains uncompiled on this host because WebKitGTK/JavaScriptCoreGTK 4.1 is absent. Core compilation/testing does not certify that adapter or a packaged application.

## Storage rules

Default model-library location derives from Tauri's OS application-data directory, never the executable/install directory or a developer-specific mount. A custom location is permitted. Inspection is read-only and reports actual capacity/available/used volume bytes, mount/filesystem where available, existing state, permission preflight, required bytes and compatibility warnings. Unix preflight checks actual access permissions; the final exclusive write probe occurs only after approval. Missing folders are not created during inspection.

Approval creates a dedicated `aether-data` child with an ownership marker and separate `models`, `downloads`, `imports` folders. Unknown existing `aether-data` folders, symlinked owned roots/subfolders and source/root destinations are rejected. App config, runtime executables and private runtime-home live in app data, separately from model weights. A changed preferred download folder never relocates an Ollama library. Aether-managed reconfiguration requires stopping only Aether's child with explicit consent; old weights remain where they were. Automated migration is not implemented.

External Ollama storage belongs to the server. On Linux, read-only user-service PID/executable/environment inspection may establish the real `OLLAMA_MODELS`/host for a matching service. Unknown, inaccessible, other-service or remote storage stays unknown; never infer it from client preferences. Model storage scans are explicit, bounded, metadata-only and skip links. They report apparent file sizes and `.part` candidates, never guaranteed recoverable space or supposedly unused Ollama blobs.

## Runtime installation and lifetime

Linux x86_64/aarch64 portable installation is implemented behind consent; unsupported platforms show manual/remote setup paths. If an executable exists, connecting to the existing service is recommended first. Explicitly requesting a separate Aether-owned child can reuse that executable read-only, avoiding another installation. No systemd files, system installation, privileged command, global environment or existing service is changed.

For a new executable: review the current official Ollama GitHub release and its real archive size; explicitly approve download/install. Runtime archives may exceed 1 GB. The installer requires the official release SHA-256 digest, bounds size/extraction, rejects traversal/devices/escaping links, uses staging and refuses unrecognized existing installations. Confined internal library links are preserved after extraction. Failures retain private partial staging for diagnosis; retries use new staging. Archive resume/automatic cleanup are not implemented. Cancellation is checked while connecting, downloading and extracting. Only a verified archive can become an installed executable. No downloaded installer script or package manager is executed.

Starting requires separate consent and approved owned storage. It binds an OS-selected loopback port, sets only the child process's model/config environment and private home, disables cloud and pruning, verifies `/api/version`, and keeps a child handle. The parent/system environment is not changed. Stop/drop only affects that child handle/private process group, never an external PID. Privileged setup commands require native confirmation dialogs; browser provider operations use browser confirmation. Configuration survives restart; reconnect/start actions are explicit. Actual inference is marked passed only after nonempty streamed text; users may save a connection without claiming an inference test.

## Models

Installed models come from the selected provider. Small starter choices are candidates until their registry manifests are fetched and real layer sizes checked. Model/license links remain visible. Model downloads use Ollama's supported pull API with progress, stop/error states and retry of runtime-supported partial layers. Before a known-size download, inspect the actual known local runtime model directory; unknown remote capacity is explicitly unknown. No model is downloaded automatically during setup/discovery/testing.

Native local GGUF import opens an OS picker, validates v2/v3 magic/header and hashes the source. Preview and consent precede upload. Blob upload and model creation use supported Ollama APIs; the original is not moved/deleted. Existing model names are rejected before create. This is a preflight check, not an atomic cross-client reservation: concurrent external creation of the same name remains a race to address before release. Remote/authenticated native imports are unsupported and fail explicitly. Upload/hash cancellation is not implemented yet.

Model removal continues to use provider APIs with confirmation. It never directly deletes content-addressed blobs or original sources and never promises immediate disk recovery. Direct native GGUF-file download cancellation works; byte-range resume remains unsupported and disclosed. Gated Hugging Face authentication and full registration/repair workflows remain incomplete requirements.

## Tested vs not tested

| Scenario | Evidence / limitation |
|---|---|
| Existing Ollama, zero models | Live read-only host probe: service active, configured external store, empty API inventory. Wizard browser tests also cover it. |
| Existing service with models | Browser/provider fixtures; no weights added to the user's library to manufacture this scenario. |
| Fresh private model library | Real installed executable launched against temporary home/storage on an ephemeral port, API checked, own child stopped; passed. This is **not** a fresh runtime binary installation. |
| Fresh official binary install | Installer source and extraction/source/cancel safety tests exist; full official archive download/install was **not run**. No claim it passed. |
| Custom, insufficient, read-only storage | Real temporary filesystem tests, actual volume metadata and explicit write probes. Foreign files preserved. |
| Failed install/start | Untrusted-source rejection, pre-cancelled install, malformed/escaping archive and missing-executable cases; real startup incompatibility found/fixed. No simulated success. |
| Interrupted model pull | Provider and browser fixtures detect premature stream end and allow retry; no real large model download was run. |
| Reopen/reconnect/multiple providers | Unit + desktop/mobile browser tests; legacy data preserved and no unnecessary wizard on reopen. |
| GGUF upload/create | Real loopback HTTP fixture with streamed source bytes, supported request paths and original-file preservation; not a live inference runtime import. |
| Metadata discovery | Official GitHub release digest and Ollama starter manifests queried in an explicit network-only native test; no weights/archives downloaded. |
| Packaged native desktop / Windows / Android | Not verified. Native Linux adapter/package blocked by missing WebKitGTK; other platform installers are not supported. |

Run native tests with `cargo test --manifest-path src-tauri/runtime-core/Cargo.toml --offline`. Real loopback tests are opt-in: set `AETHER_TEST_OLLAMA_BINARY` to an inspected existing executable and select the relevant ignored test. Metadata-only network test is separately ignored. Do not run broad ignored tests without reviewing their prerequisites. All filesystem/process integration tests use private temporary paths; never use a real model-store path as a test fixture.

Official references checked during implementation: [Ollama Linux](https://docs.ollama.com/linux), [configuration FAQ](https://docs.ollama.com/faq), [upstream environment configuration](https://github.com/ollama/ollama/blob/main/envconfig/config.go), [Tauri app paths](https://v2.tauri.app/reference/javascript/api/namespacepath/), [Qwen starter model](https://ollama.com/library/qwen3:0.6b), [Gemma starter model](https://ollama.com/library/gemma3:1b). The app's portable installer uses official release assets, not the privileged install.sh flow.
