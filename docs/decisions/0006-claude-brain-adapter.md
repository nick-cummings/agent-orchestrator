# 0006 — Claude Brain adapter

- Status: accepted
- Date: 2026-06-04

## Context

Phase 2 makes the Claude `ConversationProvider` real (`src/lib/adapters/claude/`),
replacing the throwing stub. The app owns the agent loop (ADR 0005), so the
Brain's only job is **one streaming model call**: take the conversation + tools,
stream back text/thinking/tool-calls. Built per the `claude-api` skill (the
authoritative guidance for Anthropic SDK code).

## Decision

- **Official SDK, one streaming call.** `@anthropic-ai/sdk` ^0.100,
  `client.messages.stream(...)` with `claude-opus-4-8`, `thinking:
{type:"adaptive", display:"summarized"}`, `output_config:{effort:"high"}`,
  `max_tokens: 64000`, and `tool_choice:{type:"auto",
disable_parallel_tool_use:true}` (one tool call per turn — the loop assumes it).
  Prompt caching on the system + tools prefix (`cache_control: ephemeral`).
- **`createClaudeBrain(deps)` maps both directions.** `claude/map.ts` (pure):
  domain `Message[]` → Anthropic `MessageParam[]` (tool role → user turn with
  `tool_result`; `thinking` blocks dropped — we don't persist signatures), and
  `ToolSpec[]` → Anthropic tools via Zod 4 `z.toJSONSchema`. `claude/brain.ts`
  maps SDK stream events → our `ModelEvent`: `text_delta`/`thinking_delta`
  deltas; `tool_use` blocks accumulate `input_json_delta` and parse at
  `content_block_stop`; `message_delta.stop_reason` → `turn_end`; a stream
  failure → `error` (or `turn_end{interrupt}` when the signal aborted).
- **Auth is SDK-env-resolved.** `getBrain()` (`src/lib/server/brain.ts`) builds
  `new Anthropic()` — `ANTHROPIC_API_KEY` today, the Max-subscription token
  (`ANTHROPIC_AUTH_TOKEN`) when live, no code change. `getEngine` and `getBrain`
  each compose their own side directly (not through `buildProviders`) so neither
  needs the other's deps.
- **Composition root.** `buildProviders` wires the real `createClaudeBrain`
  (replacing the stub); `ProviderDeps` gained `claude?: ClaudeDeps`. Building the
  Claude brain without `deps.claude` throws a clear error. Gemini stays stubbed.

## Consequences

- The adapter is the only Anthropic-aware code; SDK drift is contained behind
  `map.ts`/`brain.ts`. Tests inject a **fake `client.messages.stream`** yielding
  scripted raw events — no network in CI; the real key drives live verification.
- `disable_parallel_tool_use` keeps the loop's single-call assumption true; the
  loop still tolerates a batch if it's ever relaxed.
- `thinking` blocks aren't replayed to the model (no persisted signatures), so
  multi-turn thinking continuity is display-only in Phase 2 — acceptable for the
  chat surface; revisit if signature continuity becomes valuable.
