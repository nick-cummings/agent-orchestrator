# 0003 — Jules engine adapter (the anti-corruption boundary)

- Status: accepted
- Date: 2026-06-01

## Context

Phase 1 makes the Jules `ExecutionEngine` real (`src/lib/adapters/jules/`),
replacing the throwing Phase-0 stub. Jules is `v1alpha` — it _will_ change — and
its REST shapes don't line up 1:1 with the domain. Verified facts (from the
live docs): create is `POST /sessions` with a `sourceContext`
(`sources/github-{owner}-{repo}` + `githubRepoContext.startingBranch`),
`requirePlanApproval`, and `automationMode: AUTO_CREATE_PR`; steering is
`POST /sessions/{id}:sendMessage`; plan approval is a **dedicated**
`POST /sessions/{id}:approvePlan`; activities are `GET …/activities` paginated
by **`pageToken`** (there is **no** `createTime` filter — the implementation
plan assumed one); activity events are `planGenerated` / `planApproved` /
`agentMessaged` / `userMessaged` / `progressUpdated` / `sessionCompleted` /
`sessionFailed`, plus `artifacts[]` (`changeSet` / `bashOutput` / `media`); the
PR appears in `session.outputs` once completed. Built to docs + Zod-validated
fixtures (no live key yet) per the user's call.

## Decision

- **One adapter dir, three files.** `wire.ts` (Zod schemas for raw Jules shapes
  — the `.parse()` firewall; unknown fields dropped so additive drift is
  tolerated), `normalize.ts` (pure mappers, fixture-tested), `engine.ts`
  (`createJulesEngine(deps)` with injected `fetch`/`baseUrl`/`apiKey`). Nothing
  Jules-specific leaks past `normalize.ts`.
- **`listActivities` returns a new `NormalizedActivity`, not the persisted
  `Activity`.** The engine can't know our DB `executionId`/`seq`; it emits a
  vendor-normalized event `{at, source, kind, text?, data?, cursor}` and the
  poller adds `executionId`/`seq` on persist. The `ExecutionEngine` contract was
  updated accordingly (`src/lib/core/contracts.ts`).
- **Cursor = `"{createTime}::{id}"`, compared lexicographically.** Jules has no
  server-side "since" filter, so the adapter pages through all activities, sorts
  by this compound cursor, and returns those `> since`. The compound key keeps
  ordering stable when several activities share a `createTime`. The poller
  stores the last cursor on `Execution.lastActivityCursor`.
- **State mapping is lenient.** `session.state` is parsed as a plain string and
  mapped to `ExecutionState`; an unknown/missing state falls back to `running`
  (non-terminal) so a new vendor state doesn't crash the poller. (Activity
  _shapes_ still fail loud via Zod — only the operational state enum is lenient.)
- **Auth is the Jules API key in `deps.apiKey`** (Phase-1 stand-in for
  `CredentialProvider`, Phase 3). Write ops accept a per-call `ResolvedCredential`
  that overrides it; reads (which the contract gives no cred) use `deps.apiKey`.
  Sent as the `x-goog-api-key` header, centralized in one `request` helper.

## Consequences

- When a live key lands, only `engine.ts`/`wire.ts` should need touching if the
  wire format differs — callers and the domain are insulated. A few shapes are
  **unverified against live data** and flagged in code: the `:sendMessage` body
  (`{prompt}`), the `outputs` PR location (scanned via regex), and the exact
  `sourceContext.source` string.
- `buildProviders` is now the composition root that imports the adapter;
  `ProviderDeps` gained a typed `jules?: JulesDeps`. Building the Jules engine
  without `deps.jules` throws a clear error.
- Reusable for the future `sandbox-*` engines: same `ExecutionEngine` contract,
  same `NormalizedActivity`, same poller.
