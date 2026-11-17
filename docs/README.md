> Repository adaptation (2026-11-17): Codex is the implementation agent. This repository began empty except for these documents; references below to an existing UI/screenshot/Claude are historical context. Follow root AGENTS.md, current PROJECT_STATE.md and IMPLEMENTATION_TRACKER.md for actual implementation evidence. The complete target remains unchanged.

Aether Complete Build Pack
==========================

This pack is designed to prevent a common failure: Claude Code produces an attractive shell and a basic chat demo, while core modules are missing or labelled “soon”. The maintainer explicitly requested the complete Aether application, so the full build directive replaces the old first-vertical-slice-only prompt.

Files
-----

- `FULL_BUILD_PROMPT.md`: the main prompt to give Claude Code in the existing Aether repository. It demands a complete implementation of the full SRS and roadmap, not just an MVP.
- `CLAUDE.md`: persistent repository-level instructions for every Claude Code session. Copy it to the repository root.
- `AETHER_SRS.md`: authoritative detailed product requirements, interfaces, safety requirements and acceptance criteria.
- `ROADMAP.md`: dependency-aware implementation phases. All applicable phases are part of the complete target; phase boundaries are not stop conditions.
- `IMPLEMENTATION_TRACKER.md`: requirement-to-code/test traceability ledger. Claude must inspect the actual repository and fill in per-requirement evidence/status.
- `LOCAL_AI_SETUP.md`: previous snapshot of the developer's Arch/Ollama/model-storage environment. Verify before changing system state; never assume all details are current.
- `PROJECT_STATE.md`: current handoff/status file to update as implementation progresses.

Recommended integration
-----------------------

1. Open the repository that Claude already modified. Do not create a new empty project unless the actual repository is genuinely missing and the maintainer authorizes that step.
2. Copy the revised `CLAUDE.md` to the repo root and `FULL_BUILD_PROMPT.md` to the repo root. Put `AETHER_SRS.md`, `ROADMAP.md`, `LOCAL_AI_SETUP.md`, `PROJECT_STATE.md` and `IMPLEMENTATION_TRACKER.md` under `docs/`, then check that the paths in `CLAUDE.md` match. Merge with existing project documentation carefully.
3. Do not replace the application code or overwrite the app’s real user-facing README with this pack’s `README.md`; this README describes the planning pack. Preserve the existing app and its README, except for deliberate documentation updates that accurately describe implemented behavior.
4. Start Claude Code from the repository root so it can inspect and change the actual code. Give it the full contents of `FULL_BUILD_PROMPT.md` (or tell it to read that file after placing it in the repository).
4. Require Claude to audit the existing app, create/update the implementation tracker, then begin implementation immediately. The audit alone is not completion.
5. Let Claude work through the phases continuously, testing each internal slice, rather than stopping after the initial chat. A context limit should produce a durable handoff and continuation, not a claim of completion.
6. Review any destructive or irreversible operation. Do not authorize force-push, history rewrite, destructive reset/clean, publication or release signing without a deliberate decision.

Definition of complete
----------------------

The app is not complete because the UI looks polished or because one local model responds. All applicable SRS requirements must be implemented with real behavior, persistent state where required, failure/cancellation/permission states, automated tests and honest platform/provider capability handling. Every top-level navigation item must open a functional module; no “soon” tags, fake results, inert controls or unimplemented settings. The tracker must provide code and test evidence before status is marked verified.
