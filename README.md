# Orchestrator

> A personal PWA for orchestrating cloud coding agents in a kanban-style
> workspace. _(Working title — name TBD.)_

The Claude app today is a flat, linear list of chats: no way to organize
parallel streams of work, and bound to a single GitHub account. Orchestrator
replaces that with a **board-and-card workspace** — Trello-style columns where
**each card is its own agent conversation** that can kick off and steer cloud
coding work. Run many in parallel, jump between them without losing your place,
and point each one at a _different_ set of credentials (a different GitHub
account, Atlassian site, mailbox, …).

It's a thin, opinionated orchestration layer over two **swappable** roles — a
conversational **Brain** and a cloud execution **Engine**. Not a better model or
a better agent; a far better way to _manage many agents at once_.

> **Status: Phase 0 in progress.** The Next.js app is scaffolded with the full
> verification gate wired up — Prettier, type-checked ESLint, Vitest with
> enforced coverage thresholds, and Playwright for E2E. The domain contracts,
> Zod schemas, and the static kanban UI are next. See [Roadmap](#roadmap).

## The idea

A card does two separable things, and each is a **pluggable seam**:

| Role       | What it does                                                  | Default                                                           | Contract               |
| ---------- | ------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------- |
| **Brain**  | Holds the chat, decides what to do, narrates progress         | **Claude** (Agent SDK, on the Max 5× subscription credit)         | `ConversationProvider` |
| **Engine** | Runs the coding task in the cloud, edits the repo, opens a PR | **Jules** (Google AI Pro, flat-rate, GitHub-native, computer-off) | `ExecutionEngine`      |

The default **hybrid** binding is the cheap path: the Brain only converses
(light tokens, rides the subscription credit) while the Engine does the
token-heavy coding at a flat rate. Swapping Claude↔Gemini or Jules↔self-hosted
sandbox is an adapter + a config flip — never a rewrite.

## Design principles

- **Organization is manual and visual.** Dragging a card never triggers a
  workflow — columns are for _you_, not automation.
- **One card = one conversation = one isolated context.**
- **Bring-your-own-credentials, per card.** Multi-account is first-class.
- **Transparent by default.** See the Brain's narration _and_ the Engine's
  activity feed; steer or interrupt the moment it drifts.
- **Context is durable.** History always lives in Postgres; a card reopens
  exactly where you left off, even after days.
- **Provider-agnostic by construction.** The Brain and Engine are the only
  abstracted seams.
- **Functional, validated code.** Pure functions + TypeScript types + Zod
  schemas, no classes; Zod validates every boundary.
- **Config inherits, never repeats.** Settings cascade **user → board → card**.
- **Phone and desktop, same app.** Installable PWA, works computer-off.

## Core concepts

| Concept            | Definition                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| **Board**          | A top-level workspace; contains ordered columns.                                                        |
| **Column**         | A user-defined status lane (Backlog, In progress, …).                                                   |
| **Card**           | A unit of work in one column; has exactly one **Session**.                                              |
| **Session**        | The card's conversation: history, provider routing, config, Connections, linked Executions.             |
| **Execution**      | One unit of cloud coding work run by an Engine (e.g. a Jules session).                                  |
| **Connection**     | A named, authenticated account profile (GitHub · personal, Atlassian · work, …), reusable across cards. |
| **Config**         | Settings defined at user / board / card; effective config = most-specific-wins merge.                   |
| **ApprovalPolicy** | Action category → `auto` / `ask`, governing what runs without a tap.                                    |
| **Skill**          | A reusable Agent Skill stored at user/board level, activated per card.                                  |

## Architecture

One **Next.js (App Router)** app holds frontend and backend. The Brain is
**request-driven** (a turn runs, streams, exits — serverless-friendly); the
durable long-running agent is the **Engine**, hosted externally (Jules, in
Google's cloud), so there's no in-sandbox supervisor in v1.

```
PWA (Next.js client)  ─ kanban UI · card chat + activity · SSE consumer
        │ REST + SSE
API / Orchestration   ─ CRUD · owns the AGENT LOOP · SSE relay · poller · OAuth · vault
        │ depends on TYPES (contracts) only
Core domain           ─ ConversationProvider · ExecutionEngine · CredentialProvider ·
 (no vendor imports)    VcsProvider · agent loop · tool registry · buildProviders
        │ produced by factory functions (the swap point)
Adapters              ─ Brains: Claude · Gemini(future)   Engines: Jules · Sandbox(future)
        │
Postgres (state + transcripts) · Redis (event pub/sub) · Vercel Cron/QStash (poller + push)
```

The core domain imports **types, never concrete adapters**; a single
composition root (`buildProviders`) wires the right factories from config.
**Switching architecture = change the default routing + ensure the adapter
exists.** That's the whole cost of a swap.

**Stack:** Next.js · React + TypeScript · Tailwind · dnd-kit · TanStack Query ·
SSE + Redis (no WebSocket) · Postgres · Vercel + Cron/QStash · Vitest +
Playwright · `next-pwa`.

## Repo layout

The project root is kept deliberately clean — code in `src/`, infrastructure in
`infra/`, documentation in `docs/`, and as many tool configs as possible in
`.config/`. Only files the toolchain pins to the root (`package.json`,
`tsconfig.json`, the ESLint flat config) live there, alongside `README.md` and
`AGENTS.md`.

```
README.md                 # this file
AGENTS.md                 # operational guide for AI coding agents
docs/
├── agent-orchestrator-spec.md   # what & why — vision, requirements, data model, phases
├── implementation-plan.md       # how — contracts, Zod schemas, agent loop, adapter factories
├── CODING_STANDARDS.md          # the engineering rules, each wired to a gate
├── decisions/                   # ADRs (append-only)
├── features/                    # feature docs
└── operations/                  # runbooks
src/                      # application code (once scaffolded)
infra/                    # infrastructure definitions
.config/                  # relocatable tool configs
tests/e2e/                # Playwright
```

Once scaffolded, source follows the layout in
[`docs/CODING_STANDARDS.md` → Code organization](./docs/CODING_STANDARDS.md).

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000

npm run verify:fast  # format check + typecheck + lint + tests w/ coverage
npm run verify       # adds Playwright E2E (run `npx playwright install` once first)
```

The verification gate is the entry point (see
[`docs/CODING_STANDARDS.md`](./docs/CODING_STANDARDS.md)). Iterate on
`verify:fast`; run the full `verify` before pushing — and CI runs it on every
PR. Tool configs live in [`.config/`](./.config); only resolver-pinned files
(`package.json`, `tsconfig.json`, `eslint.config.mjs`) sit at the root.

## Roadmap

| Phase | Deliverable                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------ |
| **0** | Contracts & skeleton — contract types, Zod schemas, `buildProviders` stubs, Next.js app + Postgres + static kanban CRUD. |
| **1** | Jules Engine, no Brain — a working computer-off cloud-agent kanban on Jules alone.                                       |
| **2** | Claude Brain + agent loop — full hybrid; Engine exposed as tools; `ApprovalPolicy` gate.                                 |
| **3** | Connections, settings inheritance & multi-account — _the differentiator_.                                                |
| **4** | PWA polish + computer-off UX — installable, web-push, deep links.                                                        |
| **5** | Prove the swap (future) — `createSandboxEngine` (Claude-only), `createGeminiBrain` (Gemini-only).                        |

## Contributing

Read [`AGENTS.md`](./AGENTS.md) and [`docs/CODING_STANDARDS.md`](./docs/CODING_STANDARDS.md)
before writing code. The non-negotiables: functional style (no classes), Zod at
every boundary, abstract only the two seams, and **every standard is enforced by
a gate** — `npm run verify` is the source of truth.

---

_Personal project. Owner: Nick. Spec v0.6 · Plan v0.3 — May 2026._
