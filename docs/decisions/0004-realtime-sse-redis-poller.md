# 0004 — Realtime: SSE + Redis + scheduled poller

- Status: accepted
- Date: 2026-06-03

## Context

Jules is poll-granular (no push), so Engine progress reaches the UI via a
server-side poller. The spec (§5.2, §9) mandates SSE + Redis with
replay-from-Postgres. Phase 1 has no Brain (no token streaming), but we build
the final-shape transport now rather than a throwaway (user's call) so Phase 2
only adds the Brain turn-stream as a second publisher.

## Decision

- **Two event sources, one channel per session.** A poller
  (`poller/advance.ts`) pulls each active Execution's new activities, persists
  them (monotonic `seq`), mirrors state onto the card, and publishes normalized
  `SessionEvent`s; the SSE endpoint subscribes to the session channel and tails.
- **`EventBus` seam with two impls.** `createInMemoryBus` (process-local,
  tests + single-process dev — no infra) and `createRedisBus` (ioredis pub/sub,
  multi-instance prod). `getBus()` picks Redis when `REDIS_URL` is set, else
  in-memory, memoized per process. The shared async-queue iterator
  (`realtime/queue.ts`) backs both, so the tricky buffering/pending/teardown
  logic is written and tested once.
- **Zod at the Redis boundary.** Events are JSON on the wire; the subscriber
  `SessionEvent.safeParse`s each message and drops malformed/foreign-channel
  payloads rather than breaking a live stream. `createRedisBus` takes a minimal
  `RedisPubSub` shape so it's unit-tested with a fake (no Redis in CI).
- **SSE replays from Postgres, then tails.** `GET
/api/sessions/[sessionId]/stream` replays activities with `seq > since`
  (`?since=` / `Last-Event-ID`) across the session's executions, emits a
  `connected` comment, then streams bus events; activity chunks carry `id:
<seq>` so the browser resumes correctly after a reconnect. Heartbeat comments
  keep proxies open; the request abort signal tears down the bus subscription.
  Pure SSE formatting lives in `realtime/sse.ts` (tested); the route stays thin.

## Consequences

- Dev and CI need **no Redis** — the in-memory bus + PGlite cover everything;
  the Redis path is exercised via a fake client. `docker-compose` gains a
  `redis` service for opt-in local multi-process testing.
- **Serverless SSE caveat (deferred to Phase 4 deploy):** a long-lived Redis
  subscriber per SSE request doesn't fit Vercel's function model cleanly. Local
  dev (single Node process) works directly; on Vercel we'll revisit (a
  persistent worker, a hosted SSE/fan-out, or polling fallback). Recorded here
  so it isn't a surprise at deploy time.
- The `?since=` cursor is a single seq across a session's executions; with the
  typical one-execution-per-card it's exact, and the client dedupes by activity
  `id` regardless. Revisit if a card runs many concurrent executions.
- The poller still needs a scheduler (cron) to advance executions when no client
  is watching — that route lands in Increment 5 (`POST /api/poll`).
