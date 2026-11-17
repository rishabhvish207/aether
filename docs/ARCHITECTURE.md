# Architecture

`src/app` is a static-export App Router entry. `components/workspace.tsx` coordinates application state; feature panels call service modules, never Ollama protocols inline. Markdown rendering blocks raw HTML and turns remote images into explicit links so model output cannot trigger invisible image fetches.

`core/domain.ts` owns brand metadata, domain types and Zod import schemas. `providers.ts` separates endpoint/provider from model/runtime: Ollama and compatible APIs share a client interface, with no invented feature support. NDJSON/SSE parsing uses streaming TextDecoder; missing termination produces an error while retaining partial output. API keys are intentionally memory-only pending native keychain support. Compatible image/tool/audio requests are not yet implemented.

`core/storage.ts` defines Store. BrowserStore uses IndexedDB v1 indexed keys. NativeStore uses the Tauri SQL plugin; a Rust migration creates structured records. The current coarse JSON-record schema will need explicit migrations as richer data is normalized. It is not yet verified natively. Attachments currently reside in records and must move to external blob storage before large-file use.

`portable.ts` provides versioned profile and selective backup serialization, SHA-256 checksums and conflict-safe restore. Restore is JSON, not an archive: no extracted paths or symlinks. Restore is not yet atomic across sections, so backups should be retained for recovery. Core, research and agent-run sections are schema-validated and normalized; unknown non-empty future categories are rejected. Atomicity and full migration coverage still need strengthening before release.

`research.ts` calls explicit SearXNG instances and CORS-enabled HTML sources. Extracted content is untrusted text, not executable HTML. Notes and excerpts remain separate; no automatic model synthesis or unsupported citations are generated. Voice has STT/TTS interfaces, whisper.cpp HTTP integration and local-only system synthesis. No model engines are bundled.

`src-tauri` contains the native shell, SQL migration, file-selection authorities and a bounded download command. Downloads can only target the folder selected by a Rust dialog this session. Source-repository/root destinations and existing files are rejected. HTTPS transfers use unique create-new partial files, incremental SHA-256, size/header checks, cancellation flags and non-overwriting hard-link finalization. Resume, hash checks of existing files, mobile support and full native security review remain necessary.

Browser workspace tools now use a user-selected directory handle, immutable path/schema policies, per-operation approval and persisted audit events (`core/agents.ts`, `workspace-files.ts`, `agent-provider.ts`). Native filesystem agents and rollback remain unimplemented. No shell execution is exposed. No updater exists until signing/trust/rollback design is validated.

## Rename checklist

Change `core/domain.ts` brand; package.json name/version; Cargo.toml name/version; Rust main library symbol; tauri.conf.json productName/identifier/window title; SQLite filename and IndexedDB name only with an explicit user-data migration. Bundle identifier `app.aether.workspace` is provisional and must be reviewed before distribution.
