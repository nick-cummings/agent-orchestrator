# 0005 — Agent loop & persist-and-resume approval

- Status: accepted
- Date: 2026-06-04

## Context

Phase 2 introduces the Brain. The app — not the Brain — owns the agent loop
(spec §5.3, implementation-plan §5): the Brain does one streaming model call;
the loop runs generate → execute tools → append → repeat. The `ApprovalPolicy`
gate must pause the loop before an `ask`-category tool runs. AGENTS flags a
sharp edge: **don't hold an HTTP request open awaiting a human tap** — it must
survive serverless timeouts and multi-hour waits.

## Decision

- **`runTurn` is a pure async generator** (`src/lib/agent/loop.ts`) over a
  `TurnContext` (`brain`, `tools`, `history`, `policy`, `signal`). It yields
  `TurnEvent`s (`text`/`thinking` deltas, `tool_call`, completed `message`
  objects to persist, `approval_request`, `turn_end`, `error`). Side effects
  (tool execution) live in the tools; the loop is otherwise pure and tested with
  a scripted fake Brain.
- **Persist-and-resume gate.** On the first `ask`-category tool, the loop yields
  `approval_request` and **returns** — it never awaits the tap. The caller
  (Phase-2 turn service) persists the parked call (`sessions.pendingApproval`)
  and the transcript so far, then ends the request. Approving fires a fresh
  request that runs the tool, appends its `tool_result`, and starts a new
  `runTurn` over the extended history. The durable state is the persisted
  `messages` + `pendingApproval`; nothing in-flight is held.
- **Tool registry erases the param type at the boundary.** `defineTool<I>`
  takes a typed handler but stores a `Tool` whose `run(input: unknown)` validates
  via the Zod schema first — so `ToolRegistry = Record<string, Tool>` carries no
  `any`. `specsOf` derives the model-facing specs; `runTool` guards unknown
  names. Tool failures (incl. unknown tool, bad input) become a `tool_result`
  error block fed back to the Brain, not a turn abort.
- **Messages persisted per session** (`messages` table + repo): `role`,
  `contentBlocks` (jsonb), monotonic `seq` for SSE replay — mirrors the
  activities repo. The loop yields placeholder-field `Message`s to the Brain
  (only `role`/`contentBlocks` are read); the caller persists real rows.

## Consequences

- The loop is provider-agnostic (any `ConversationProvider`) and engine-agnostic
  (tools wrap any `ExecutionEngine` in Increment 3) — Phase 5 swaps need neither.
- Resume correctness rests on the transcript being the source of truth; the
  pause→approve→continue path is integration-tested with a fake Brain.
- Single tool call per turn is assumed for simplicity (the Claude adapter will
  set `disable_parallel_tool_use`); the loop still handles a batch and persists
  partial results before pausing, so enabling parallel calls later is safe.
- Phase-2 policy is `DEFAULT_POLICY` + the session's `requirePlanApproval`; the
  full user→board→card `resolveConfig` inheritance arrives in Phase 3.
