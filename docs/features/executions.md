# Feature: Card executions (Phase 1)

A card can launch a **cloud coding task** on the **Jules** engine and watch it
progress in near-real-time — plan → progress → code change → PR — with no Brain
involved yet (Phase 2 adds Claude driving this). This is the de-risking vertical
slice for the "computer-off cloud agent" requirement.

## What it does

- **Open a card** (`↗` on the board card → `/card/[cardId]`) to its session view.
- **Start a task** — describe it, point at a repo (`owner/name@branch`), choose
  whether plans need approval. Kicks off a Jules session.
- **Watch the activity feed** — a collapsed inline element (one-line summary,
  expandable) fed by the server-side poller and live SSE updates.
- **Steer** a running task (sends guidance to Jules), **approve a plan** when it
  is awaiting one, open it **in Jules**, and follow the **PR** link on success.
- The board card face reflects the execution's lifecycle (`running`,
  `awaiting_plan_approval`, `pr_ready`, `error`).

## Data model

`Card` →(1:1)→ `Session` →(0..N)→ `Execution` →(N)→ `Activity`
(`src/lib/db/{sessions,executions,activities}.ts`). `Execution.externalRef` is
the only place the Jules session id lives; `Activity.seq` is monotonic per
execution and powers SSE replay. Read model: `getCardSession`
(`src/lib/db/cardSession.ts`).

## How it flows

```
StartTaskForm ─POST /api/cards/:id/executions─▶ JulesEngine.start ─▶ Execution row
Vercel Cron ─GET /api/poll─▶ pollActiveExecutions ─▶ JulesEngine.listActivities/getStatus
                                   │ persist activities + mirror state to card
                                   ▼ publish SessionEvent
EventBus (Redis/in-mem) ─▶ GET /api/sessions/:id/stream (SSE) ─▶ CardView refresh
```

The engine is the only Jules-aware code (`src/lib/adapters/jules/`,
[ADR 0003](../decisions/0003-jules-engine-adapter.md)); the realtime transport
is [ADR 0004](../decisions/0004-realtime-sse-redis-poller.md). Credentials are a
Phase-1 env-var stand-in (`JULES_API_KEY`) for the Phase-3 `CredentialProvider`.

## API

| Method & path                            | Purpose                                               |
| ---------------------------------------- | ----------------------------------------------------- |
| `POST /api/cards/{id}/executions`        | Start a task (prompt + repo)                          |
| `GET /api/cards/{id}/session`            | Session read model (executions + activities)          |
| `POST /api/executions/{id}/messages`     | Steer (`sendMessage`)                                 |
| `POST /api/executions/{id}/approve-plan` | Approve a pending plan                                |
| `GET /api/sessions/{id}/stream`          | SSE: replay-from-Postgres then tail the bus           |
| `GET /api/poll`                          | Cron sweep of active executions (CRON_SECRET-guarded) |

## How it's tested

- **Unit/integration** — Jules adapter over a mocked `fetch` + fixtures; poller
  over a fake engine + PGlite + in-memory bus; repos + read model + routes over
  PGlite; bus/SSE/normalize pure helpers.
- **Component** — `CardView` (start / running / approve / succeeded / steer)
  with a mocked API client + fake `EventSource`; `StartTaskForm`, `ActivityFeed`.
- **E2E** — opening a card's session view from the board.

## Not yet

Live Jules verification (build is to docs + fixtures — set `JULES_API_KEY` to go
live; see the [runbook](../operations/poller-and-realtime.md)); the serverless
SSE story (Phase 4 deploy); multiple concurrent executions per card; the Brain
(Phase 2). See the runbook for running it locally.
