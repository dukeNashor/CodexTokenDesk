---
name: visualize-codex-tokens
description: Open or operate the local Codex Token Desk WebApp for real-time Codex rollout Token, Context, Compaction, and tool usage monitoring.
metadata:
  short-description: Local real-time Codex Token monitoring WebApp
  allow_implicit_invocation: false
---

# Codex Token Desk

This migrated skill is backed by the TypeScript/Next.js application at the repository root.

## Start

```powershell
pnpm install
pnpm dev
```

Open `http://127.0.0.1:3000`. The browser polls `/api/report` every three seconds. The server scans both active and archived Codex session roots, then reparses only files whose size or modification time changed.

## Scope

The dashboard is local-only and read-only. Set `CODEX_PROJECT_ROOT` to the project whose rollout files should be selected. Set `CODEX_SESSIONS_ROOTS` to a semicolon-separated list when using an alternate Codex data root.

The parser preserves the important report semantics from the original Python implementation: cumulative `total_token_usage` deltas between task boundaries, live incomplete turns, Context snapshots, Compaction markers, tool-call attribution, model/effort metadata, daily buckets, and reconciliation warnings.

Do not expose the service beyond loopback or commit real rollout JSONL files.
