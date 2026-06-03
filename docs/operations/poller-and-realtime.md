# Runbook — poller, realtime, and going live on Jules

How the Phase-1 cloud-execution machinery runs and how to recover it.

## Moving parts

- **Jules engine** (`src/lib/adapters/jules`) — talks to `jules.googleapis.com/v1alpha`.
- **Poller** (`src/lib/poller/advance.ts`) — pulls activity + state per execution.
- **Cron route** `GET /api/poll` — sweeps active executions; guarded by `CRON_SECRET`.
- **Event bus** (`src/lib/realtime`) — Redis pub/sub in prod, in-memory in dev.
- **SSE** `GET /api/sessions/:id/stream` — replays from Postgres, then tails the bus.

## Local dev

```bash
docker compose -f infra/docker-compose.yml up -d   # Postgres + Redis
cp .env.example .env.local                          # then fill JULES_API_KEY
npm run db:migrate
npm run dev
```

- **Without `REDIS_URL`** the app uses the in-memory bus — fine for a single
  `next dev` process (poller and SSE share it). Set `REDIS_URL` only when running
  multiple processes.
- **Advancing executions locally** (no Vercel Cron): hit the poller yourself on a
  loop —
    ```bash
    while true; do curl -s localhost:3000/api/poll >/dev/null; sleep 5; done
    ```
    (omit auth when `CRON_SECRET` is unset). Or open a card — the SSE stream shows
    whatever the poller has persisted.

## Going live on Jules

1. Get an API key from jules.google → settings; put it in `JULES_API_KEY`.
2. Connect the target GitHub repo to the **Jules GitHub app** (Jules acts on
   repos it's been granted).
3. Start a task from a card (prompt + `owner/name@branch`). Watch the activity
   feed; the poller advances `planning → running → … → succeeded` and surfaces
   the PR link.
4. The wire shapes are built to docs + fixtures. If a call 400s or a field is
   missing, the failure is contained in `createJulesEngine`; check the Zod parse
   error and the live-unverified spots flagged in code (`:sendMessage` body, the
   `outputs` PR location, the `sourceContext.source` string). See ADR 0003.

## Production (Vercel — Phase 4)

- `vercel.json` registers `GET /api/poll` on a cron schedule; set `CRON_SECRET`
  so Vercel's Bearer token is required. (Cron sub-daily cadence needs a paid plan.)
- Managed Postgres + Redis; set `DATABASE_URL` + `REDIS_URL`.
- **Known issue:** a long-lived Redis subscriber per SSE request doesn't fit the
  serverless function model — revisit at deploy (persistent worker / hosted
  fan-out / polling fallback). See ADR 0004.

## Failure modes

| Symptom                             | Likely cause                                                   | Action                                                            |
| ----------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| `JULES_API_KEY is not set` on start | env unset                                                      | add it to `.env.local`                                            |
| Executions never advance            | nothing calls `/api/poll`                                      | run the dev loop / Vercel Cron                                    |
| Activities don't appear live        | `REDIS_URL` set but Redis down, or multi-process without Redis | start Redis, or unset `REDIS_URL` in single-process dev           |
| Jules call throws a Zod parse error | `v1alpha` drift                                                | fix the mapping in `src/lib/adapters/jules` (only place affected) |
