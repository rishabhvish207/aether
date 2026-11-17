# Aether — implementation state and continuation

Updated: 2026-11-17. Primary agent: Codex. **The full product is NOT complete. Resume implementation without asking the maintainer to restate the task or approve routine phases.** Root AGENTS.md is the persistent instruction source; original Claude/existing-UI references are historical. Read the SRS and per-ID tracker for the unchanged complete target.

## Repository and environment

- Started with only untracked docs; there was no AGENTS.md or prior app. Created AGENTS.md from docs/CLAUDE.md with the user's Codex/new-repository override.
- Initial baseline had unborn branch `main` and no remote. GitHub integration on 2026-11-17 configured `origin` as `git@github.com:rishabhvish207/aether.git`; the remote was empty and SSH authenticated as `rishabhvish207`. Initial commit `addd8ac` was pushed and independently matched to remote `main`; local `main` tracks `origin/main`. See Git log/remote refs for the latest checkpoint. Do not reset/clean.
- Source: `/mnt/d/Projects/aether` on NTFS/fuseblk. Initial free space about 120 GiB. Node installation, static export, Rust dependency compilation and Chromium tests worked on this mount. No chmod/chown/mount changes made.
- Node 26.9.0, npm 12.0.2, Rust/Cargo 1.98.1. npm lock and Cargo lock present. Next 16.4.6, React 19.3.1, TypeScript 6.0.3, Tailwind 4.3.5, Tauri JS 2.12.5. Official framework/provider references are in docs/INTEGRATIONS.md.
- Initial `curl` to `127.0.0.1:11434/api/tags` refused connection. Ollama executable exists. No live inference tested; no existing model, service, helper script, driver, boot or model-storage change made.
- Native compile blocked at WebKitGTK/JavaScriptCoreGTK 4.1 pkg-config discovery. No system packages installed. Rust application code has not compiled, and no desktop package or Android APK exists.
- Sandbox DNS prevented first npm fetch; approved dependency downloads succeeded. Sandbox denies Node child processes with EPERM, which Next reports as failure parsing TypeScript --showConfig. Approved `npm run build` succeeds; do not patch node_modules or disable TypeScript to work around that.

## Implemented code

- `src/app`: App Router/static export with no server actions/routes. Responsive tokenized dark/light/system shell, density/font/width, contrast/solid/reduced-motion settings. Navigation opens actual implemented feature panels.
- `core/domain.ts`: brand identity, runtime/provider distinctions in types, structured message parts, profiles/settings/options/backup boundary schemas. Native IDs and rename checklist: ARCHITECTURE.md.
- `core/providers.ts`: configurable Ollama/remote Ollama and OpenAI-compatible/llama.cpp/LM Studio API adapters; inventory/show/loaded/pull/delete; NDJSON/SSE streaming, split UTF-8, supplied thinking, abort, errors, real provider token metrics and client TTFT. No create/GGUF registration yet. Compatible vision/tools/audio chat capability discovery incomplete.
- `components/workspace.tsx`: text chat, cancel/error, profiles/provider/model selection, safe Markdown/code copy, title/content search, folders/pinning, reopen/rename/delete, branching/edit/regenerate, temporary chats, explicit export contents. `markdown.tsx` memoizes rendering, blocks HTML execution and replaces remote images with explicit links. Temporary conversations/attachments remain memory-only; changing conversations/new chat/reload clears their active state.
- `core/storage.ts` Store abstraction, IndexedDB v1 browser store and SQLite Tauri adapter. Native migration in Rust. `bootstrap.ts` avoids reseeding after intentional deletion and concurrent initialization. Native migration not verified. Attachments still stored inside message records, requiring external blob separation.
- `panels.tsx`: profile CRUD/duplicate/import/export/templates/system/options/binding checks; provider CRUD/diagnostics/enabling/session keys; settings; selective checksummed JSON backups/conflict-preview restore; benchmarks with actual provider metrics and local history; model management. Every category is not yet covered by Settings.
- `attachments.ts`: bounded text/code and vision-gated image handling including paste/drop. No PDF/camera yet, and no full image preview or compatible-server vision.
- `huggingface.ts` + panel: public GGUF repo search, file listing, pinned-revision direct URL resolution, model-card/license links, size/hash selection. Gated/private auth, pagination and live service validation remain.
- `src-tauri`: Tauri 2 shell/config/capability, SQL migration, explicit dialog-selected dedicated model folder with free-space check; GGUF header inspection; streamed HTTPS download, progress, cancellation, SHA-256, size/header validation and no-overwrite finalization. All native behavior unverified until build prerequisites. Partial files retained on failures; no resume or job persistence. No keychain or native agent executor yet.
- `research.ts` + panel: explicit SearXNG JSON search consent, direct CORS HTML extraction, real links/excerpts, persisted workspaces/notes and report export. Source text is untrusted and separate from user synthesis. No automatic model synthesis/citation validation yet.
- `voice.ts` + panel: separate STT/TTS interfaces, explicit mic/endpoint consent, recording→mono PCM WAV→whisper.cpp `/inference`, transcription preview to chat, local-only system voices/rate/volume/stop. No bundled engine; no live microphone/engine test, voice persistence or auto-speak yet.
- `agents.ts`, `agent-provider.ts`, `workspace-files.ts` + panel: typed list/read/write tool registry, Ollama/compatible nonstream tool-call loop, browser directory picker capability, path/credential-directory denial, per-tool approvals, complete before/after edit preview, intervening-file-change detection, immutable permissions, timeout/iteration/output-budget limits, cancellation and local audit/step history. No shell tool is exposed. Native executor, visual line diffs and rollback remain; browser picker/live model flow not yet exercised end-to-end. Provider-reported output token budgets have a labeled internal char-based fallback and are not a token accounting guarantee.

## Checks actually run

- `npm run lint`: passed after the final CSS/JSX change.
- `npm run typecheck`: passed; strict TypeScript.
- `npm test`: **28 passed**, three test files. Covers UTF-8/NDJSON/SSE/metrics/error/cancel, persistence/restart, temporary exclusion, checksums/conflict restore/import validation, secret stripping, WAV, HF URL safety, one-time initialization, tool traversal/denial/immutable-policy/edit-conflict/limits/approval-cancel.
- `npm run build`: repeated successful static export; final mobile-layout correction also built successfully.
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/aether-playwright npm run test:e2e`: **8 passed** (4.0 seconds) after provider hardening. Four workflows each at desktop 1440×1000 and mobile 390×844: chat/history/temporary exclusion, profile/navigation/themes, Markdown HTML/remote-image/code controls, and stale-inventory rejection during provider switching. Uses explicit mock provider intercepts, not a live model. Final rebuild and rerun completed successfully.
- Chromium downloaded to `/tmp/aether-playwright` (not repository). Screenshots `/tmp/aether-mobile.png`, `/tmp/aether-desktop.png` were inspected; discovered/fixed selector overlap and sticky-composer obstruction. Updated mobile screenshot inspected after final build: selectors no longer overlap and messages are unobscured; page scrolls normally.
- `cargo fmt --manifest-path src-tauri/Cargo.toml`: passed. `cargo check --manifest-path src-tauri/Cargo.toml`: downloaded/locked deps, blocked before application compilation on missing `webkit2gtk-4.1`/`javascriptcoregtk-4.1`. No native test/package/launch success claim.
- npm dependency installs reported zero vulnerabilities. No full transitive license/security audit yet. Git ignore inspection found no model/database/partial/screenshot files among eligible additions.

## Exact next implementation steps

1. All final checks have completed; no commands or failed tests are pending. Resume with the browser/service correctness tasks below, then the remaining model/native work. Do not re-scaffold or redo planning.
2. Add tests and fix outstanding browser/service correctness: profile selection order currently follows database UUID key ordering; recover interrupted `generating` messages; better scroll/branch visualization; Extend protocol coverage to CR-only SSE framing and additional provider variants; multiline LF/CRLF SSE plus inventory/pull/show validation are now implemented. Audit async UI actions for unhandled storage failures. Large conversations need pagination/virtualization and external attachment storage.
3. Implement versioned native secure credentials, schema migrations and atomic restore/recovery, then compile/package on a host with the deliberately installed Tauri prerequisites. Do not alter system graphics/boot packages. Continue independent browser/services work while native verification is unavailable.
4. Finish model operations: native import hashing/blob upload/create via supported Ollama APIs; structured Modelfile preview/apply with explicit disk duplication warning; persistent resumable downloads/range validators; HF gated auth; selected path/mount/free-space recovery and checksums; safe removal distinction. Do not manually inspect/delete existing Ollama blobs or download real large models during tests.
5. Complete themes/custom import/export, all FR-130 settings categories, per-conversation overrides/configurations and configurable shortcuts with conflicts. Test resets preserve data.
6. Complete PDF/doc/camera, voice setup/licensing/persistence/auto-speak and live tests, source-grounded research synthesis with traceable citations and robust native fetch consent. Review docs/INTEGRATIONS.md.
7. Complete native workspace agent executor, actual diff UI, approvals hardened against stale changes, rollback/snapshots and live tool-loop tests. Keep shell blocked unless a separately tested policy/confirmation executor is implemented. Add prompt-injection, timeout and audit-migration tests.
8. Add resource telemetry, benchmark suites/comparison/export; scheduled backup/retention/restore points; Android toolchain/configuration/network/permissions and device strategy; native Linux packaged launch; release accessibility/security/dependency/license gates. Maintainer license/creator URLs/signing are not supplied—never invent them.
9. Keep every FR/NFR row honest in IMPLEMENTATION_TRACKER.md. No phase boundary is permission to end the full target; update this file whenever context ends so the next Codex session continues autonomously.

## Commands

```sh
npm run dev                 # 127.0.0.1:3000
npm run lint
npm run typecheck
npm test
npm run build               # managed sandbox may require approved execution
PLAYWRIGHT_BROWSERS_PATH=/tmp/aether-playwright npm run test:e2e
npm run preview             # static out/ on 127.0.0.1:4173
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev           # only after host prerequisites
```

No background model process, dev server or application deployment is intentionally left running. Playwright owns/stops its static test server. Model weights, private records, caches and generated bundles are ignored. The maintainer now authorizes automatic meaningful commits and normal pushes of completed, verified work; root AGENTS.md records the standing workflow. No force-push, history overwrite, release/deployment or repository visibility change is authorized.

## GitHub integration checkpoint (2026-11-17)

Remote: https://github.com/rishabhvish207/aether (SSH origin). SSH authentication works; GitHub CLI has no login, which is unnecessary for Git-over-SSH. Existing configured author identity retained. Initial remote refs were empty; no remote history is being overwritten. Git was already initialized, so no reinitialization was needed. Ignore rules cover local agent/cloud configuration, secrets, model formats, databases, backups, generated dependencies and build output. Candidate scan: 60 text files, approximately 846 KB, no private-key/token indicators or files above 2 MiB. Initial verification: lint, strict type checks, 20 unit tests and production static export passed; all 6 baseline desktop/mobile browser cases passed before the initial commit. Native build remains blocked by the previously documented system prerequisites.

After integration, immediately continue project-state step 2: provider stream/protocol and UI correctness, then the rest of the complete tracker. Commit/push each verified slice automatically.

## Resumed development checkpoint — provider hardening

After the initial verified GitHub push, implemented `eventData` to assemble multiline SSE data fields, ignore comment/metadata frames, bound complete event sizes and preserve split UTF-8/CRLF. Compatible chat now parses complete events. Model inventories and capability reports are schema-validated. Pull streams reject invalid/negative/over-total progress and missing final success instead of reporting a completed download. Inventory requests accept cancellation; switching provider/reconnecting cancels superseded requests, and late results cannot replace the active inventory. Capability state is tied to the exact selected provider/model so image/tool eligibility cannot leak between selections.

Evidence: `tests/providers.test.ts` (8 new protocol/boundary cases), `tests/e2e/workspace.spec.ts` (provider-switch race tested at both desktop/mobile widths). Latest checks: lint and strict typecheck passed, 28 unit tests passed, production static export passed, 8 browser tests passed. No models/system configuration changed. Next: deterministic initial profile selection and interrupted-generation recovery, then remaining full-product requirements above. Git push status must be checked from refs after committing this checkpoint; never force-push.
