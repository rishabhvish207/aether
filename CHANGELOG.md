# Changelog

## 0.1.0 — 2026-11-17 (development, not a release)

- Created application from document-only repository.
- Added static frontend, provider adapters, streaming chat, local history, profiles, settings, benchmarks, model API operations and backups.
- Added opt-in source collections, voice integrations, public Hugging Face discovery and approval-controlled browser workspace tool loops.
- Added native SQLite/dialog/download source; build blocked by missing WebKitGTK 4.1.
- 28 unit tests and 8 desktop/mobile browser workflow tests pass. Lint, strict TypeScript and static production export pass. Consult project state for native blockers and remaining scope.

- Configured SSH GitHub origin and initial main push; standing verified commit/push authorization persisted in AGENTS.md.
- Fixed multiline SSE parsing, malformed model/capability/download responses, truncated-pull success reporting and provider-switch inventory/capability races.

- Added adaptive repeatable setup, zero-model discovery, remote/custom/skip flows, ownership records and backward-compatible setup persistence.
- Added an independently tested Rust runtime/storage/installer/import core, real capacity/permission/mount inspection, explicit directory approval, owned child lifecycle and read-only partial-file diagnostics.
- Added official starter-model size lookup and original-preserving local GGUF API upload/create. Full portable installation and packaged native setup remain unverified.
- Fixed backup checksum instability across object-key ordering; existing v1 checksums remain accepted.
- Verification: 35 TypeScript unit tests, 16 browser cases, 10 default native-core tests and 3 explicitly exercised native integration/metadata cases (see setup supplement for exact scope).
