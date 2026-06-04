# Feature: Brain chat (Phase 2)

A card is now a **Claude conversation that drives Jules**. You chat; Claude
decides what to do and calls engine tools (start a task, steer it, check
progress, approve a plan, fetch the PR), narrating as it goes. The app owns the
agent loop; Claude does one streaming model call per step. No structured
start-form anymore — you just talk.

## What it does

- **Chat** with Claude on a card (`/card/[cardId]`). Assistant text streams live;
  tool calls and results show as muted chips; the engine activity feed (Phase 1)
  stays below, now narrated by Claude.
- **Claude drives Jules** through intent-named tools — `start_coding_task`,
  `send_instruction`, `check_progress`, `approve_plan`, `get_result` — never
  knowing the engine is Jules.
- **Approval gate.** Before an `ask`-category tool runs, the loop pauses and the
  card shows tap-to-approve/reject. Approving resumes the turn. (Phase 2:
  `branch_write` asks when the session's `requirePlanApproval` is on.)

## How it flows

```
Chat composer ─POST /api/cards/:id/messages─▶ runSessionTurn
   persist user msg → runTurn(brain, tools, history, policy):
     Brain.generate (stream) ─▶ text/thinking/tool_call ─▶ bus ─▶ SSE ─▶ Chat
     auto tool → run + append result → loop
     ask tool  → park pendingApproval, emit approval_request, STOP
ApprovalPrompt ─POST /api/sessions/:id/approve─▶ resumeTurn → run/skip tool → continue
```

- Loop + persist-and-resume: [ADR 0005](../decisions/0005-agent-loop-and-approval-resume.md).
- Claude adapter (the one streaming call): [ADR 0006](../decisions/0006-claude-brain-adapter.md).
- Realtime transport reuses the Phase-1 session channel + SSE
  ([ADR 0004](../decisions/0004-realtime-sse-redis-poller.md)); the `SessionEvent`
  union gained Brain variants (`text`/`thinking`/`tool_call`/`approval_request`/
  `message`/`turn_end`).

## Data model

The Brain transcript persists to a `messages` table (`role`, `contentBlocks`,
monotonic `seq`); a parked tool call lives on `sessions.pendingApproval`. The
card-session read model (`getCardSession`) returns `{ session, messages,
executions }`.

## API

| Method & path                     | Purpose                                         |
| --------------------------------- | ----------------------------------------------- |
| `POST /api/cards/{id}/messages`   | A chat turn (runs the loop)                     |
| `POST /api/sessions/{id}/approve` | Approve/reject a parked tool, resume            |
| `GET /api/sessions/{id}/stream`   | SSE — now also carries Brain events             |
| `GET /api/cards/{id}/session`     | Read model (messages + executions + activities) |

## Auth

`new Anthropic()` resolves auth from the environment — `ANTHROPIC_API_KEY` today,
the Max-subscription token (`ANTHROPIC_AUTH_TOKEN`) when that path is live, with
no code change. `JULES_API_KEY` is still required (Claude drives Jules).

## How it's tested

- **Unit/integration** — the loop with a scripted fake Brain (text → auto tool →
  pause on ask → resume → done); the Claude adapter over a fake SDK stream;
  engineTools + turn (pause→approve/reject→resume) over PGlite; map.ts pure;
  thin route wiring.
- **Component** — `Chat` (block variants, streaming bubble, send), `CardView`
  (transcript, approval prompt, execution status), `ApprovalPrompt`; mocked API
  client + fake `EventSource`.
- **E2E** — opening a card shows the chat composer.

## Not yet

Live multi-turn thinking continuity (thinking blocks aren't replayed); per-card
`resolveConfig` policy + system prompt (Phase 3); token-level SSE replay after
reconnect (the client refetches the read model instead). See the runbook for
running it live with `ANTHROPIC_API_KEY`.
