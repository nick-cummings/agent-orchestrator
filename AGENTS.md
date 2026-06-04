# AGENTS.md

Operational guide for AI coding agents working in this repo. Read this first,
then the three source docs it points to. If anything here conflicts with the
source docs, the source docs win — and flag the conflict.

> **Status: Phase 2 complete.** Phases 0–1 (contracts, schemas, persistence,
> static kanban, Jules engine + poller + SSE/Redis) plus Phase 2: the real
> **Claude** `ConversationProvider` (`src/lib/adapters/claude/`), the
> provider-agnostic agent loop + tool registry (`src/lib/agent/`), and the card
> chat UI — Claude drives Jules through intent tools with a persist-and-resume
> approval gate. Set `ANTHROPIC_API_KEY` + `JULES_API_KEY` to go live (see
> `docs/operations/poller-and-realtime.md`). Next: Phase 3 (Connections +
> config inheritance). **Run `npm run verify:fast` before every commit.**

## What this is

**Orchestrator** (working title) — a personal PWA for running many cloud coding
agents kanban-style. Each card is a **conversation (Brain)** that drives cloud
**execution (Engine)**. Default binding: **Claude Brain** (Agent SDK on the Max
5× subscription credit) + **Jules Engine** (Google AI Pro, flat-rate, runs in
Google's cloud computer-off). Single-user, personal scale.

Full context:

- [`docs/agent-orchestrator-spec.md`](./docs/agent-orchestrator-spec.md) — _what & why_ (vision, requirements, data model, phases).
- [`docs/implementation-plan.md`](./docs/implementation-plan.md) — _how_ (contracts, Zod schemas, the agent loop, adapter factories).
- [`docs/CODING_STANDARDS.md`](./docs/CODING_STANDARDS.md) — _the rules_, each wired to a gate.

## The one architectural rule

**Abstract exactly two seams plus credentials — nothing else.** The AI market is
the only source of churn, so the entire portability budget goes into:

- `ConversationProvider` (the **Brain** — one model call, streams text/thinking/tool-calls)
- `ExecutionEngine` (the **Engine** — runs cloud coding work, returns a PR)
- `CredentialProvider` (per-account auth; `VcsProvider` for git hosts)

Everything else — the kanban UI, the DB, SSE transport, the Connections model —
is **not volatile, so build it plainly.** Resist interface-everything. If you
find yourself adding an abstraction outside these seams, stop and justify it.

## Code conventions (load-bearing — every line must follow)

- **No classes, no `this`, no `new`, no `implements`.** Contracts are `type`
  aliases describing a _record of functions_. Adapters are **factory functions**
  (`createClaudeBrain(deps): ConversationProvider`) that capture deps in a
  closure. Logic lives in standalone **pure functions**; side effects (HTTP, DB,
  clock) are injected via `deps`.
- **Zod is the single source of truth** for every validated shape — tool inputs,
  domain entities, config/routing, and _especially_ untrusted vendor responses.
  Define the Zod schema, derive the type with `z.infer`, derive tool JSON
  Schemas with `zodToJsonSchema`, and `.parse()` at **every** boundary. Vendor
  drift (e.g. Jules `v1alpha`) must fail loudly at the adapter, not silently
  three layers down.
- **The app owns the agent loop** (a pure async generator). The Brain does one
  model call; the loop runs generate → execute tools → append → repeat. The
  Engine is exposed to the Brain only as **intent-named tools**
  (`start_coding_task`, `send_instruction`, `check_progress`, `approve_plan`,
  `get_result`) — the Brain never knows which Engine is behind them.
- **Config inherits user → board → card**, most-specific-defined-wins
  (`resolveConfig`). An `ApprovalPolicy` (action category → `auto | ask`) gates
  the tool loop.

## The verification gate (the spine of the standards)

Catch mistakes **mechanically, not in review.** A rule not wired into a gate is
a suggestion, and suggestions rot. Layer by speed:

| Command         | Runs                               | When                |
| --------------- | ---------------------------------- | ------------------- |
| `verify:static` | format check + typecheck + lint    | constantly, on save |
| `verify:fast`   | `verify:static` + unit/integration | before every commit |
| `verify`        | `verify:fast` + E2E                | before push; in CI  |

- **Iterate on `verify:fast`; run full `verify` once before pushing.**
- **Typecheck runs before lint** (type-aware lint is downstream of types).
- A change-aware pre-push hook runs `verify`; docs/meta-only pushes run just
  `verify:static`. **CI is the source of truth** — both gates green before
  anything lands on `main`.

## Hard rules digest (do not violate without an in-code justification)

- **TypeScript `strict` is non-negotiable. No `any` in product code** (relaxed
  only in tests). `@/` path alias for `src/` — no `../../..` chains.
- **Lint tier 3** (`strict-type-checked` + `stylistic-type-checked`, unicorn,
  perfectionist, security, sonarjs). `eqeqeq` always, `no-nested-ternary`,
  `no-param-reassign`, `prefer-template`, `no-unnecessary-condition`,
  `max-lines: 500`. **Every disabled rule carries a `// why` comment.** Relax
  per-context (tests, glue), never globally.
- **`lib/` holds logic; `components/` holds UI.** No computation, storage, or
  side-effects in components. Route handlers and components stay thin and
  delegate. **Feature folders, not type folders.**
- **Test the wiring, not just the units.** If a feature is "X tells Y to do Z,"
  there must be a test asserting the X-tells-Y call — not just X and Y in
  isolation. Cover the happy path, the likeliest edge cases, and the failure
  path. **Tests co-located** next to code; E2E in `tests/e2e/`. Coverage
  thresholds are enforced and tiered — never lower a bar to make red go green.
- **Never write a raw color** in markup — use a semantic token (`bg-card`,
  `text-muted`, …). Undefined color? Add the token to the single source of truth
  first, then use it. **Color encodes meaning, not decoration.**
- **Accessibility is correctness.** Real `<button>`s with labels, visible focus,
  WCAG AA contrast, never signal by color alone, respect `prefers-reduced-motion`.
- **Docs ship with the change.** Anything beyond a typo/CSS tweak lands with an
  ADR (`docs/decisions/NNNN-*.md`, append-only), a feature doc, or a runbook.
- **Conventional Commits**, small working increments (each commit passes the
  gate). Never force-push shared branches or rewrite landed history.
- **Secrets never reach the browser, never get logged.** Decrypt only in the
  backend at use time; pass short-lived scoped creds to the Engine.

## Target stack & layout

Next.js (App Router, single app = frontend + backend) · React + TS · Tailwind ·
dnd-kit · TanStack Query · SSE + Redis (no WebSocket) · Postgres (state +
transcripts) · Vercel + Vercel Cron/QStash poller · Vitest + Playwright.

**Keep the project root clean** — every file sorts into a top-level home; the
root holds only what the toolchain forces there, plus `README.md` + `AGENTS.md`.
See [`docs/CODING_STANDARDS.md` → Project layout](./docs/CODING_STANDARDS.md).

```
.                # root: package.json, tsconfig.json, eslint.config.mjs, next.config.ts, README.md, AGENTS.md
├── src/         # ALL application code
│   ├── app/         # routes + API handlers (thin; delegate to lib)
│   ├── components/  # UI, one folder per feature; co-located tests
│   ├── lib/         # pure logic, Zod schemas, agent loop — no JSX
│   │   ├── core/        # provider-agnostic: contracts (types), schemas, loop, buildProviders
│   │   └── adapters/    # vendor factory fns: createClaudeBrain, createJulesEngine, ...
│   └── test-utils/
├── infra/       # ALL infrastructure: IaC, Docker/Compose, deploy + DB config
├── docs/        # ALL docs: spec, plan, CODING_STANDARDS, ADRs, feature docs, runbooks
├── .config/     # relocatable tool configs (Prettier, Vitest, Playwright, PostCSS as postcssrc.mjs)
└── tests/e2e/   # Playwright (desktop Chromium + mobile WebKit)
```

**Config placement:** a config file goes in `.config/` **unless the tool can't
find it there** — check for a `--config .config/<file>` flag or `.config/`
discovery before defaulting to the root — and check the expected _filename_
there too. PostCSS lives in `.config/` as `postcssrc.mjs` (Turbopack finds
`.config/postcssrc.*`, not `.config/postcss.config.*`). Root configs
(`package.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`) are the
genuinely resolver-pinned exceptions.

The core domain imports **types (contracts) only — never concrete adapters**. A
single composition root (`buildProviders(routing, deps)`) calls the right
factories from config. Adapters are anti-corruption layers.

## Build phases (where we are → where we're going)

0. **Contracts & skeleton** ✅ — contract types, domain Zod schemas,
   `buildProviders`, Next.js app + Postgres + static kanban CRUD (dnd-kit).
1. **Jules Engine, no Brain** ✅ — `createJulesEngine` + poller + SSE/Redis +
   card session view; a card starts a Jules task and shows the activity feed + PR.
2. **Claude Brain + agent loop** ✅ — `createClaudeBrain` + the loop (`lib/agent/`);
   Engine as tools; chat UI; SSE narration; `ApprovalPolicy` gate (persist-and-resume).
3. **Connections, settings inheritance & multi-account** ← _next._ The differentiator.
4. **PWA polish + computer-off UX** — installable, web-push, deep links.
5. **Prove the swap (future)** — `createSandboxEngine` (Claude-only),
   `createGeminiBrain` (Gemini-only). Each = one factory + a routing flip.

## Known sharp edges (see the design review / memory)

- **Brain auth is the subscription Agent SDK credit** (`CLAUDE_CODE_OAUTH_TOKEN`
  via `claude setup-token`). Live June 15 2026; token rotates manually/annually.
  **Multi-user is ToS-blocked on this path** — a second user forces API-key
  billing. Keep it single-user.
- **Approval gate vs. serverless timeout:** don't hold an HTTP request open
  awaiting a human tap. End the turn at the approval point, persist
  `awaiting_approval`, resume as a new turn. (Open design item.)
- **`resolveConfig` array/record merge** (skillIds, defaultRepos, approvalPolicy)
  — union-vs-replace semantics still need pinning down. (Open design item.)
- **Jules is `v1alpha`** — it _will_ change. Contain every Jules detail inside
  `createJulesEngine`; the Zod parse at the boundary is the firewall.
