# Agent Orchestrator — Project Spec

A personal PWA for orchestrating cloud coding agents in a kanban-style workspace. Working title: **Orchestrator** (rename later).

_Draft v0.6 — May 2026. Owner: Nick._
_v0.1 → v0.2: single Next.js app (no NestJS); filesystem-preserving sandboxes; per-card repo lists with on-demand cloning; 3-state session lifecycle with 7-day summary hibernation._
_v0.2 → v0.3: resume seeding = summary + last N turns + `search_transcript` retrieval tool; concurrency cap + token spend cap; clarified Anthropic API key as model auth, distinct from Connections._
_v0.3 → v0.4: **pivot to a hybrid, provider-swappable architecture.** A card is now a **conversation (Brain)** that drives a cloud **coding Engine**. Default binding = **Claude brain** (Agent SDK on the Max 5× subscription credit) + **Jules engine** (Google AI Pro, flat-rate). The two volatile seams (`ConversationProvider`, `ExecutionEngine`) are abstracted so Claude-only / Gemini-only become adapter swaps. The Brain is request-driven (serverless-friendly); the in-sandbox supervisor + E2B + pause/hibernate machinery is demoted to one optional `sandbox-_`Engine adapter; hosting flips to Vercel-friendly. Build details live in`implementation-plan.md`.*
*v0.4 → v0.5: code style is **functional** — pure functions + TypeScript `type`s + Zod schemas, no classes. Contracts are types (records of functions); adapters are factory functions (`createX`); Zod is the source of truth for validated data and parses every vendor boundary.*
*v0.5 → v0.6: resolved the open questions — config inheritance (**user → board → card**) with an `ApprovalPolicy`per tier; reusable **Skills** at user/board levels; the Jules activity feed renders **inline-collapsible**;`Activity`stays its own entity; multi-tab reconcile = optimistic broadcast for append/positional state + version-checked config writes; MCP hosting deferred to the`sandbox-_` engine (Phase 5); cards auto-name with a placeholder, renamable anytime. Product name still TBD._

---

## 1. Vision

The Claude app today is a flat, linear list of chats. There's no good way to organize parallel streams of work, and it binds you to a single GitHub account. This project replaces that with a **board-and-card workspace** — Trello-style columns of cards, where each card is its own agent **conversation** that can kick off and steer **cloud coding work**. You can run many in parallel, jump between them without losing your place, and point each one at a _different_ set of credentials (a different GitHub account, Atlassian site, mailbox, etc.).

The product is a thin, opinionated orchestration layer over two **swappable** roles — a conversational **Brain** and a cloud execution **Engine**. It is not trying to be a better model or a better agent — just a far better way to _manage_ many agents at once. The default binding is a **Claude Brain** (great conversation, runs on the subscription credit) directing a **Jules Engine** (flat-rate, GitHub-native, runs in Google's cloud with your computer off), but the architecture treats those as configuration, not assumptions.

### Design principles

- **Organization is manual and visual.** Dragging a card never triggers a workflow. Columns are for _you_ to track state, not for automation.
- **One card = one conversation = one isolated context.** Cards never share Brain state.
- **Bring-your-own-credentials, per card.** Multi-account is a first-class feature, not a workaround.
- **Transparent by default.** Show the Brain's narration _and_ the Engine's activity feed; let the user steer or interrupt the moment it drifts.
- **Context is durable.** Conversation history always lives in the database; a card you haven't touched in days reopens exactly where you left off.
- **Provider-agnostic by construction.** The Brain and the Engine are abstracted seams; swapping Claude↔Gemini or Jules↔self-hosted is an adapter + a config flip, never a rewrite.
- **Functional, validated code.** Pure functions + TypeScript types + Zod schemas; no classes. Contracts are types (records of functions); adapters are factory functions; Zod validates every boundary, including untrusted vendor responses.
- **Config inherits, never repeats.** Settings cascade **user → board → card**; a card overrides only what it needs and inherits the rest, so new cards are productive with zero setup.
- **Phone and desktop, same app.** PWA, installable, works on mobile with your computer off.

---

## 2. Core concepts

| Concept            | Definition                                                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Board**          | A top-level workspace. Contains ordered columns. Listed in the left sidebar. (e.g. "Cards Platform", "Earthblood tooling", "Side projects".)                                                                                     |
| **Column**         | An ordered, user-defined status lane within a board (e.g. "Backlog", "In progress", "Review", "Done"). Created/renamed/reordered freely.                                                                                         |
| **Card**           | A unit of work living in one column. Has a title, optional description, and exactly one agent **Session**. Drag between columns.                                                                                                 |
| **Session**        | The card's **conversation**: its message history, **provider routing** (which Brain, which Engine), config (model, verbosity, system prompt/skills, repos), selected **Connections**, and zero-or-more linked **Executions**.    |
| **Brain**          | The conversational/orchestration role — holds the chat, decides what to do, narrates progress. Pluggable (`ConversationProvider`). Default: **Claude** (Agent SDK, subscription credit).                                         |
| **Engine**         | The cloud execution role — runs the actual coding task in the cloud, edits the repo, opens a PR. Pluggable (`ExecutionEngine`). Default: **Jules**.                                                                              |
| **Execution**      | One unit of cloud coding work run by an Engine (e.g. a Jules session): its own state machine, activity feed, and result (PR). A Session may spawn several over its life.                                                         |
| **Connection**     | A named, authenticated account profile for an external provider (GitHub, Atlassian, Gmail, …). Reusable across many cards. The core of multi-account support.                                                                    |
| **Config**         | A set of settings — routing, approval policy, active skills, model, verbosity, system prompt, default repos — defined at **user**, **board**, and **card** levels. A card's _effective_ config is the merge, most-specific-wins. |
| **ApprovalPolicy** | Part of Config: a map of action **category → `auto` / `ask`** governing what the agent may do without a tap. Set at any tier and merged.                                                                                         |
| **Skill**          | A reusable Agent Skill (instructions + tools) stored at **user** or **board** level and activated per card.                                                                                                                      |

---

## 3. Functional requirements

### 3.1 Boards & navigation

- Collapsible **left sidebar** listing all boards; click to switch.
- Create / rename / delete / reorder boards.
- Sidebar collapses to icons (or fully) to maximize board space — important on mobile.
- Remember last-open board and sidebar state across sessions.

### 3.2 Columns

- Create / rename / delete / reorder columns within a board.
- Horizontal scroll when columns overflow viewport.
- Column shows card count.

### 3.3 Cards

- Create a card in any column (quick-add at top or bottom of a column).
- New cards get an auto **placeholder title** (e.g. "New task", or the first line of your opening message) and are **renamable inline anytime**; the Brain may propose a title from the first exchange that you can accept or overwrite.
- Drag-and-drop a card **within** a column (reorder) and **between** columns (re-status). Smooth, with touch support for mobile.
- Card face shows: title, a short snippet of the latest Brain message, lifecycle/status indicators (idle / thinking / awaiting input / running task / awaiting plan approval / PR ready / error), and which Connections are attached (small provider icons).
- Click a card to open its **session view** (chat + activity). Desktop = slide-over panel or full screen; mobile = full screen.
- **Three-dot menu** on each card: `Open`, `Settings`, `Duplicate`, `Archive`, `Delete`.

### 3.4 Card Settings modal

Opened from the three-dot menu → `Settings`. Shows the card's **effective config**, each value marked _inherited_ (from board/user) or _overridden_; editing sets a card-level override, clearing it falls back to the inherited value:

- **Connections** — pick which account profile to use for each relevant provider (e.g. GitHub = `personal`, Atlassian = `work`). This is the multi-account selector.
- **Provider routing** — choose the **Brain** (Claude / Gemini) and the **Engine** (Jules / self-hosted) for this card. Inherits the board (then user) default; override per card. (See §3.8, §5, §7.)
- **Repositories** — the repo(s) the Engine targets (source Connection + repo + branch). For Jules these are the connected GitHub repos; for a self-hosted Engine, a list auto-cloned on sandbox creation.
- **Model** — the Brain's model (default newest Claude; override). Engine model is set by the Engine (e.g. Jules runs Gemini).
- **Verbosity** — `Verbose` (default) / `Normal` / `Quiet` (see §3.7).
- **Skills** — activate reusable Agent Skills from the inherited **user/board** library, or attach card-only ones; plus an optional per-card system prompt.
- **Approval policy** — which action **categories auto-run vs. need a tap** (read-only, branch-writes, destructive, network, merge/deploy, spend), inherited from board/user and overridable here; includes whether the Engine surfaces its plan before executing (see §9).

### 3.5 Session / chat

- Standard chat interface inside a card: user messages + Brain responses streamed live, with the Engine's activity feed shown as a **collapsible inline element** (default a one-line summary — "Jules: planning… / editing 3 files / PR opened" — expandable to the full plan/progress/code-change/PR event list).
- Persists full history; reopening a card resumes exactly where you left off (even after days — history always in Postgres).
- Multiple sessions run concurrently; switching cards never kills a running Execution (the Engine runs in the cloud).
- Status surfaced both in the card face (board view) and in the session header.

### 3.6 File input

- **Paste files directly into the chat** (clipboard paste of images/text/files) and drag-drop upload.
- Files attach to the Brain's context (images/PDFs natively; the Claude/Gemini APIs accept these as base64). Where the Engine needs a file, the Brain hands it across via the Engine's inputs.
- Show attached files as chips in the composer with a remove option.

### 3.7 Verbosity & interruption

- **Verbose (default):** render the Brain's full event stream — thinking, tool calls, results, final text — plus the Engine's full activity feed. The "watch it work" mode.
- **Normal:** collapse thinking/tool internals and Engine activities into expandable summaries; show text + a compact "ran N steps" line.
- **Quiet:** show only final Brain text and Execution results (PRs).
- **Interrupt / steer:** an always-available control halts the current **Brain** turn immediately (AbortSignal). To redirect a _running Engine task_, you **send guidance** (the Brain calls the Engine's `send_instruction`; for Jules this is `sendMessage`) rather than hard-killing it. Verbosity is a render-time filter — the full stream is always stored, so switching modes is retroactive and free.

### 3.8 Settings inheritance & skills

- **Three tiers.** Defaults live at the **user** level, are overridden at the **board** level, and overridden again per **card**. Effective config = merge(user, board, card), most-specific-wins; unset values inherit.
- **Inheritable settings:** provider routing (brain/engine/model), approval policy, active skills, verbosity, system prompt, default repos, and plan-approval on/off.
- **Board settings** set the defaults every new card in that board starts from; **user settings** set the global baseline.
- **Skills library:** define reusable Agent Skills at the **user** level (available everywhere) and the **board** level (scoped to that board); each card activates a subset of the inherited skills and may add card-only ones.

---

## 4. Non-functional requirements

- **PWA:** installable on desktop and mobile, app manifest, service worker for the app shell (offline shell + graceful "reconnecting" state — live work needs network).
- **Responsive:** board view adapts to narrow screens; session view is mobile-first full screen.
- **Realtime:** sub-second streaming of Brain events; near-real-time (poll-granular) Engine activity; reconnect transparently after network blips without losing the stream.
- **Computer-off:** creating/triggering/monitoring cards works from the phone with your computer off — the Engine (Jules) runs in Google's cloud and the backend runs always-on (see §5, §8).
- **Push (phase 4):** notify when an Execution needs input, finishes, or errors while the app is backgrounded.
- **Single-user / personal scale** initially: tens of boards, hundreds of cards, single-digit-to-~15 concurrent Executions. Don't preclude multi-user later, but don't build for it yet.
- **Guardrails / budget:** the real cost rails are now **per-provider**: the Brain on the Claude **Agent SDK credit** ($100/mo on Max 5×) is a natural hard cap, and Jules is **flat-rate** (Google AI Pro: ~15 concurrent / 100 daily tasks). A monthly **token spend cap** still applies if the Brain is pointed at an API key instead of the credit. Keep a soft **concurrency cap** as a runaway-provisioning rail (relevant mainly to a self-hosted Engine).
- **Security:** credentials encrypted at rest; never sent to the browser; scoped per session and resolved at use time.

---

## 5. Architecture

**One Next.js (App Router) app** holds frontend and backend. Two roles are abstracted as the only swappable seams: the **Brain** (`ConversationProvider`) and the **Engine** (`ExecutionEngine`). The Brain is **request-driven** (a chat turn runs, streams, exits — it never needs to outlive a request). The durable, long-running agent is the **Engine**, which by default is **Jules, hosted by Google** — so there is no in-sandbox supervisor to operate for v1.

```
┌─────────────────────────────────────────────────────────────┐
│  PWA (Next.js client) — kanban UI, card chat + activity view  │
│  SSE consumer · POST send/interrupt · deep-link buttons        │
└───────────────┬───────────────────────────────────────────────┘
                │ REST + SSE
┌───────────────▼───────────────────────────────────────────────┐
│  API / Orchestration (Next.js route handlers)                  │
│  Board/Column/Card/Connection CRUD · owns the AGENT LOOP        │
│  SSE relay · poller triggers · OAuth callbacks · secret vault   │
└───────────────┬───────────────────────────────────────────────┘
                │ depends on TYPES (contracts) only ▼
┌───────────────────────────────────────────────────────────────┐
│  Core domain (provider-agnostic) — NO vendor imports           │
│  ConversationProvider · ExecutionEngine · CredentialProvider · │
│  VcsProvider · agent loop · tool registry · composition root   │
└───────────────┬───────────────────────────────────────────────┘
                │ produced by factory functions ▼  (the swap point)
┌───────────────────────────────────────────────────────────────┐
│  Adapters (vendor-specific, swappable)                         │
│  Brains:  Claude (Agent SDK) · Gemini (future)                 │
│  Engines: Jules (REST v1alpha) · Sandbox (E2B, future)         │
│  VCS: GitHub · Creds: per-provider auth                        │
└───────┬─────────────────┬───────────────────┬──────────────────┘
        │ Postgres         │ Redis             │ Vercel Cron/QStash
        │ (state +         │ (event pub/sub,   │ (Engine poller +
        │ transcripts)     │ presence)         │ push)
        ▼                  ▼                   ▼
   ┌──────────┐      ┌──────────┐     Anthropic API · Jules REST · Google Cloud
   │ Postgres │      │ Redis    │
   └──────────┘      └──────────┘
```

### 5.0 Code conventions

- **No classes.** Contracts (`ConversationProvider`, `ExecutionEngine`, `CredentialProvider`, `VcsProvider`) are TypeScript `type`s describing a _record of functions_; adapters are **factory functions** (`createClaudeBrain`, `createJulesEngine`, …) that capture deps in a closure. Logic lives in standalone pure functions; the composition root is a pure selector that calls factories.
- **Zod is the source of truth** for every validated shape — tool inputs, domain entities, provider routing, and untrusted vendor payloads. Derive types with `z.infer`, tool JSON Schemas with `zodToJsonSchema`, and `parse()` at every boundary.

### 5.1 The app — Next.js

- **Client:** React + TypeScript, `next-pwa` (or manual manifest + service worker). **dnd-kit** for drag-and-drop (good touch support). TanStack Query for server state. SSE via `EventSource`/fetch streaming. Tailwind for styling.
- **Server:** Route Handlers for CRUD and the session control/stream endpoints. The server **owns the agent loop** (§5.3) but each loop run is a request-scoped, streamed response — not a process that must persist between requests.

### 5.2 Realtime path (SSE + Redis, no WebSocket)

- `GET /api/sessions/:id/stream` (SSE): on connect, replay events from Postgres since the client's last-seen id, then subscribe to the session's **Redis** channel and tail live. Lossless across reconnects and Next instance restarts.
- **Two event sources** feed that channel: (a) the **Brain turn stream** during an active turn, and (b) a **server-side poller** that polls each active Execution's activities and publishes normalized events.
- `POST /messages`: runs a Brain turn (the agent loop), streaming events to Redis + persisting to Postgres.
- `POST /interrupt`: aborts the in-flight Brain turn (AbortSignal). Steering a running Execution is a normal message that triggers the Brain to call the Engine's `send_instruction`.
- Multiple browser tabs can subscribe to the same session safely. Concurrent edits reconcile **optimistically**: append-only and positional changes (new messages, card moves) broadcast over the same channel and apply last-write-wins, while **config/settings writes carry a `version` and are rejected if stale** (refetch-and-retry) so inheritance settings are never silently clobbered. Heavier coordination (soft locks, CRDTs) waits for multi-user.

### 5.3 The Brain (`ConversationProvider`) + agent loop

- The Brain does exactly one thing: **one model call** — given the conversation + available tools, stream back text/thinking/tool-calls. The **app owns the loop** (generate → execute tool calls → append results → repeat → stop), so the loop is identical across Claude and Gemini.
- The **Engine is exposed to the Brain as tools** named for intent (`start_coding_task`, `send_instruction`, `check_progress`, `approve_plan`, `get_result`). The Brain never knows which Engine is behind them.
- Default Brain: **`ClaudeConversationProvider`** — Claude Agent SDK / Anthropic Messages API, auth via `CredentialProvider` (subscription credit by default; API key alt). Because the Brain isn't doing the token-heavy coding, its token spend is light and the subscription credit stretches far.

### 5.4 The Engine (`ExecutionEngine`)

- Default Engine: **`JulesExecutionEngine`** — wraps the Jules REST API (v1alpha): create session, `sendMessage`, list activities (polled), approve plan, fetch result/PR, deep link. Jules runs the coding work in Google Cloud VMs (computer-off), GitHub-native, flat-rate. Caps: `{ conversational, planApproval, streaming: false (poll), vcs: ["github"], selfHosted: false }`.
- Optional Engine: **`SandboxExecutionEngine`** (future) — this is where the prior in-sandbox design (Agent SDK or Gemini CLI harness inside an **E2B** microVM, with the §8 pause/hibernate lifecycle) is provided by **one factory** (`createSandboxEngine`), used only when you want the Brain's provider to _write_ the code (Claude-only / Gemini-only). Caps: `{ streaming: true, selfHosted: true }`.
- The adapter is an **anti-corruption layer**: it normalizes the vendor's shapes (Jules `planGenerated`/`agentMessage`/code-change activities) into domain `Activity` records, so nothing vendor-specific leaks upward.

### 5.5 Composition root & provider routing

- A single function (`buildProviders(routing)`) calls the right Brain + Engine **factory functions** from config. Routing (`{ brain, executor, model }`) is stored per **Session** with a global default.
- **Switching the app's architecture = change the default routing + ensure the adapter exists.** Switching one card = change its routing. That is the entire cost of a swap. (See §7 for the target matrix.)

### 5.6 Data stores & hosting

- **Postgres** for relational state (boards → columns → cards → sessions → executions → messages, connections) **and** durable transcripts/activities.
- **Redis** for per-session event pub/sub and presence.
- **Hosting:** **Vercel is now a clean fit** — the Brain is request-driven and the durable agent is external (Jules), so the reason v0.3 pushed a persistent Node host is gone. Run the app on Vercel; run the **Engine poller** on Vercel Cron / QStash (or a small worker); managed Postgres + Redis. Revisit only if you add a `sandbox-*` Engine that wants a persistent worker.

---

## 6. Credential & multi-account handling

This is the feature that makes the product worth building.

### Model

- A **Connection** = `{ id, provider, label, authType, encryptedCredential, scopes, expiresAt }`.
- Add as many as you want: `GitHub · personal`, `GitHub · work`, `Atlassian · acme`, `Gmail · personal`, …
- A card's session references Connections by id. The orchestrator injects the right credential where it's needed — into the Engine's repo/source config and (for a self-hosted Engine) the sandbox's tool config. The browser never sees the secret.

### `CredentialProvider` abstraction

- One contract — a record of resolver functions — handles **all** auth, decoupling _which kind_ of credential from the call site. Kinds include: `anthropic_subscription`, `anthropic_api_key`, `gemini_api_key`, `google_oauth`, `jules_api_key`, `github_oauth`/`github_pat`, `atlassian_oauth`, `gmail_oauth`.
- It resolves **Brain auth** (`resolveBrainAuth(sessionId)` → subscription credit vs API key vs Gemini) and **provider/tool auth** (`resolve(connectionId)`), decrypting only in the backend at use time.
- This is what makes shifting billing (e.g. the June-15 Agent SDK credit changes, or pointing the Brain at an API key) a config change rather than surgery.

### Auth strategy per provider

- **Prefer OAuth** (GitHub OAuth/GitHub App, Atlassian 3LO, Google OAuth) — cleaner UX, revocable, scoped, refreshable.
- **GitHub multi-account works naturally:** GitHub OAuth is per-account, so you run the flow once per account and store each token as its own Connection. No single-account ceiling like the Claude app.
- **Jules** authenticates with a Jules API key (from `jules.google.com/settings`); the **GitHub repos it acts on** are connected via the Jules GitHub app.
- **Support fine-grained PATs** as a GitHub fallback.

### Secret storage

- Envelope encryption with a KMS-managed data key (AWS/GCP KMS, or `libsodium` sealed boxes if self-managing). Store only ciphertext in Postgres.
- Decrypt **only** in the backend at use time; pass to the Engine/sandbox as short-lived scoped credentials. Never log, never return to the client.
- Token refresh server-side; rotate/revoke from a Connections settings screen.

---

## 7. Brain & Engine options — comparison & recommendation

**Cost reality:** the hybrid is the cheap path. The Brain (Claude) only converses and orchestrates — **light** tokens that ride the **$100/mo Agent SDK credit** you already pay for on Max 5×. The Engine (Jules) does the token-heavy coding on a **flat ~$20/mo** Google AI Pro plan (15 concurrent / 100 daily tasks, no metering). Net incremental over subscriptions you may already hold: roughly **$0**, comfortably under the ~$100/mo cap. Both subs do double duty.

### Default binding (v1)

- **Brain = Claude** via the Agent SDK on the subscription credit (API key as alt).
- **Engine = Jules** — GitHub-native, cloud/computer-off, flat-rate, conversational (`sendMessage`), plan-approval gate, activity feed via polling.

### Swap targets (each is a config flip + one adapter)

| Architecture    | Brain               | Engine                            | What it takes             | Billing lever                                |
| --------------- | ------------------- | --------------------------------- | ------------------------- | -------------------------------------------- |
| **Hybrid (v1)** | Claude (sub credit) | Jules (Google AI Pro)             | —                         | both subs do double duty                     |
| **Claude-only** | Claude              | Sandbox-Claude (Agent SDK in E2B) | add `createSandboxEngine` | Agent SDK credit + sandbox compute (pennies) |
| **Gemini-only** | Gemini (API/CLI)    | Jules or Sandbox-Gemini           | add `createGeminiBrain`   | Google AI Pro / Gemini                       |

### Self-hosted Engine option (for the `sandbox-*` engines only)

If/when you want the Brain's provider to _write_ the code, the Engine runs a harness inside a sandbox. Provider options (per-second PaaS rates, May 2026 — verify before committing):

| Provider           | CPU rate              | Idle / persistence                        | Cold start | Notes                                              |
| ------------------ | --------------------- | ----------------------------------------- | ---------- | -------------------------------------------------- |
| **E2B** ⭐         | ~$0.050/vCPU-hr       | Indefinite **pause, filesystem retained** | ~150ms     | Best TS DX for the Agent SDK; Firecracker microVMs |
| **Daytona**        | ~$0.050/vCPU-hr       | Persistent, per-second                    | sub-90ms   | Unlimited runtime                                  |
| **Fly.io Sprites** | $0.07/CPU-hr          | No idle charge, FS preserved              | —          | Strong idle economics                              |
| **Modal**          | ~$0.071/vCPU-hr equiv | Per-second                                | —          | Python-favored                                     |
| **Northflank**     | $0.0167/vCPU-hr       | Per-second; BYOC                          | —          | Cheapest at scale; more infra                      |

At personal scale sandbox compute is pennies; optimize the `sandbox-*` adapter for filesystem persistence + resume speed + DX (E2B), not headline CPU rate.

---

## 8. Session lifecycle & context retention

**Conversation history always lives in Postgres regardless of state** — summaries are context-window _seeds_, never the only record. The lifecycle now depends on the Engine.

### Default (Jules) Engine — no sandbox to manage

- The **Brain is stateless between turns**: a turn runs request-scoped, then exits. An idle card costs **nothing on your side** — there is no running compute to pause.
- The durable work is the **Execution**, whose lifecycle is a state machine driven by Jules and tracked by the poller:
  `starting → planning → [awaiting_plan_approval] → running → [awaiting_feedback] → succeeded | failed | cancelled`.
- A card "at rest" simply has its conversation in Postgres and zero (or completed) Executions. Reopening it is instant — replay history from Postgres.

### Self-hosted (`sandbox-*`) Engine — the 3-state model applies

For the optional code-writing engine, the prior model carries over as **engine-specific**:
| State | Trigger | What happens | Resume |
|---|---|---|---|
| **Active** | Running | Sandbox running, harness loop live. | n/a |
| **Paused** | Idle ≥ `pauseAfterMinutes` (15) | Sandbox **filesystem retained**; rehydrate on resume. | Sub-second; storage-only cost. |
| **Hibernated** | Idle ≥ `hibernateAfterDays` (7) | Generate a context **summary**, tear down filesystem, flag repos for re-clone. | Re-provision + re-clone + seed with summary + last N turns. |

### Context summary & transcript retrieval (any engine)

- For long conversations, a cheap summary + a `search_transcript(query | turn_range)` tool over stored `Message` rows keeps continuity without bloating the context window. Useful regardless of engine; **required** only for the hibernating `sandbox-*` path.

---

## 9. Streaming & interruption design

- Open card → client hits `GET /api/sessions/:id/stream` (SSE). Server replays missed events from Postgres (since last-seen id), then subscribes to the session's Redis channel and tails live.
- **Brain turns** stream text/thinking/tool events to Redis + Postgres as the agent loop runs. **Engine activity** is published by the server-side poller (normalized `Activity` events).
- Verbosity is a **client-side render filter**; the server always stores the full stream, so switching modes is retroactive and free.
- **Interrupt** → `POST /interrupt` aborts the in-flight Brain turn (AbortSignal); the composer unlocks and your next message resumes.
- **Steer a running task** → a normal message; the Brain calls the Engine's `send_instruction` (Jules `sendMessage`) — you guide rather than hard-kill a cloud Execution.
- **Approval gate** → before the Brain runs an action (or the Engine executes a plan), the **effective `ApprovalPolicy`** decides: `auto` categories run silently, `ask` categories pause and surface a tap-to-approve in the card (the Brain calls `approve_plan` / awaits confirmation) — or you send changes instead. The policy is inherited (user → board → card) and configurable per tier (§3.8).
- Reconnect: on socket drop, client refetches events since last-seen id, then resubscribes — no lost events.

---

## 10. Data model (first cut)

Every entity is a **Zod schema** (the source of truth); the TS type is `z.infer`, and vendor payloads are parsed through Zod at the adapter boundary. The listing below is the readable field summary — concrete Zod schemas live in `implementation-plan.md` (§4.2, §7).

```
User
  id, email, createdAt
  // Brain auth refs (encrypted): anthropicApiKeyRef?, anthropicSubscriptionRef?, geminiKeyRef?, julesKeyRef?
  defaultConfig (Config)            // global baseline (user tier)

Connection
  id, userId, provider ('github'|'atlassian'|'gmail'|...),
  label, authType ('oauth'|'pat'), encryptedCredential, scopes[], expiresAt, createdAt

Config                        // embedded at user/board/card; every field optional → inherit
  routing? ({ brain, executor, model })
  approvalPolicy? (ApprovalPolicy)
  skillIds? (string[])          // skills active at this tier
  verbosity?, systemPrompt?, defaultRepos?, requirePlanApproval?

ApprovalPolicy                // action category -> 'auto' | 'ask'
  read, branch_write, destructive, network, merge_deploy, spend

Skill
  id, ownerLevel ('user'|'board'), ownerId,
  name, instructions, toolRefs[], createdAt

Board
  id, userId, name, position, sidebarOrder, createdAt
  defaultConfig (Config)            // board tier — new cards inherit this
  version                           // optimistic-concurrency token for config writes

Column
  id, boardId, name, position

Card
  id, columnId, title, description, position,
  // title defaults to a placeholder; titleSetByUser guards manual renames
  titleSetByUser (bool),
  status ('idle'|'thinking'|'awaiting_input'|'running'|'awaiting_plan_approval'|'pr_ready'|'error'),
  configOverride (Config?),          // card tier — overrides board/user
  version,                           // optimistic-concurrency token
  archivedAt, createdAt

Session                       // 1:1 with Card
  id, cardId,
  brainProvider ('claude'|'gemini'),        // provider routing
  executorEngine ('jules'|'sandbox-claude'|'sandbox-gemini'),
  model, verbosity ('verbose'|'normal'|'quiet'),
  systemPrompt, skills[],
  connectionIds[],            // selected account profiles
  repos: [ { connectionId, repoUrl, branch, clonePath? } ],
  requirePlanApproval (bool, default true),
  // sandbox-* engines only (nullable otherwise):
  sandboxId?, sandboxState?, pauseAfterMinutes?, hibernateAfterDays?,
  lastActiveAt, contextSummary?, summarizedAt?

Execution                     // 0..N per Session
  id, sessionId,
  engine ('jules'|'sandbox-claude'|...),
  externalRef,                // opaque vendor id (e.g. Jules sessionId) — the ONLY place it lives
  state ('starting'|'planning'|'awaiting_plan_approval'|'running'|'awaiting_feedback'|'succeeded'|'failed'|'cancelled'),
  lastActivityCursor, deepLinkUrl, resultPrUrl?, createdAt, updatedAt

Message
  id, sessionId, role ('user'|'assistant'|'tool'),
  contentBlocks (jsonb: text/thinking/tool_call/tool_result/image/document),
  seq (monotonic per session, for SSE replay), createdAt

Activity                      // normalized Engine events (or fold into Message blocks)
  id, executionId, at, source ('agent'|'user'|'system'),
  kind ('plan'|'message'|'code_change'|'tool'|'progress'|'result'),
  text?, data (jsonb)?, cursor
```

Ordering uses `position` floats (or rank strings) so reorders are single-row updates. `Message.seq` powers lossless SSE replay. `Execution.externalRef` quarantines vendor ids from domain logic. A card's **effective config** is `merge(user.defaultConfig, board.defaultConfig, card.configOverride)` (most-specific-wins); `version` columns back optimistic-concurrency writes for settings (Q6). `Activity` is its own entity but renders as a collapsed inline element in the chat (Q2/Q4).

---

## 11. Build phases

**Phase 0 — Contracts & skeleton.** Define `ConversationProvider`, `ExecutionEngine`, `CredentialProvider`, `VcsProvider`, domain models, and `buildProviders` with stub adapters. Next.js app + Postgres schema + static kanban (boards/columns/cards CRUD + dnd-kit, organizational only). Cards auto-title with a renamable placeholder; define the `Config`, `ApprovalPolicy`, and `Skill` schemas now (only base defaults wired). _The loose-coupling foundation — get the seams right before any provider exists._

**Phase 1 — Jules Engine, no Brain (vertical slice).** `JulesExecutionEngine` + the poller. A card starts a Jules task; the card view shows the normalized activity feed as a **collapsed inline element** + "open in Jules" + the PR link. **A working computer-off cloud-agent kanban on Jules alone** — de-risks the founding requirement before Claude is involved.

**Phase 2 — Claude Brain + agent loop.** `ClaudeConversationProvider` + the provider-agnostic loop; Engine exposed as tools; SSE narration; the **`ApprovalPolicy` gate** wired into the loop (`auto` runs, `ask` pauses for a tap). The card chat is now Claude talking to you and driving Jules. **Full hybrid working.**

**Phase 3 — Connections, settings inheritance & multi-account.** `CredentialProvider` + per-card Settings: which GitHub account, which Anthropic auth (subscription credit vs API key), which Google account. Adds the **user → board → card config inheritance** (board/user settings screens, effective-config merge, inherited-vs-overridden UI), the **user/board skills library**, and **version-checked config writes** (Q6). The differentiator.

**Phase 4 — PWA polish + computer-off UX.** Installable PWA + service worker; web-push on state changes; deep-link buttons (open PR in GitHub, open repo in local IDE via `vscode://` / `github.dev`); idle handling.

**Phase 5 — Prove the swap (optional/future).** `createSandboxEngine` (Agent SDK harness in E2B) → unlocks **Claude-only**. `createGeminiBrain` → unlocks **Gemini-only**. Each is an additive adapter + a routing flip — the payoff of Phase 0.

---

## 12. Open questions / decisions to make

1. **Product name.** "Orchestrator" is a placeholder.
2. **MCP hosting** _(deferred to Phase 5, `sandbox-_` engine only):\* per-sandbox vs. shared services. Lean: shared services for stateless/expensive tools, per-sandbox for anything needing the card's filesystem or credentials. Not needed until the sandbox engine exists.

Everything else from earlier drafts is now resolved — see the logs below.

### Resolved since v0.1

- **Backend framework:** single **Next.js** app (no NestJS).
- **Realtime transport:** **SSE + POST + Redis**, not WebSocket.

### Resolved in v0.3 → v0.4

- **Architecture:** **hybrid, provider-swappable** — a card is a **conversation (Brain)** driving a cloud **Engine**, abstracted behind `ConversationProvider` + `ExecutionEngine`.
- **Default binding:** **Claude Brain** (Agent SDK, subscription credit) + **Jules Engine** (Google AI Pro, flat-rate). Best bang-for-buck and uses both subscriptions.
- **Brain is request-driven** (serverless-friendly); the in-sandbox supervisor + E2B + pause/hibernate machinery is **demoted to one optional `sandbox-*` Engine adapter**.
- **Hosting:** **Vercel-friendly** now (Brain request-driven, durable agent external); poller on Vercel Cron/QStash.
- **Cost rails:** Brain on the **Agent SDK credit** (natural cap) + **flat-rate Jules**; token spend cap only if the Brain uses an API key.

### Resolved in v0.4 → v0.5

- **Code style:** functional — pure functions + TypeScript `type`s + Zod schemas, no classes. Contracts are types (records of functions); adapters are factory functions (`createX`); Zod is the source of truth for validated data and parses every vendor boundary.

### Resolved in v0.5 → v0.6 (open-question sweep)

- **Routing granularity (Q1):** part of config inheritance — board default, card override (within user → board → card).
- **Activity rendering + transcript-vs-activities (Q2, Q4):** `Activity` stays its own entity (clean per-Execution poll cursor) and renders as a **collapsible inline element** in the single chat column — no separate lane.
- **Config inheritance + ApprovalPolicy (Q3):** three tiers **user → board → card**, effective = most-specific-wins merge; `ApprovalPolicy` maps action category → `auto | ask`, set/merged per tier.
- **MCP hosting (Q5):** deferred to the `sandbox-*` engine (Phase 5); not relevant to Jules.
- **Multi-tab reconcile (Q6):** optimistic broadcast (last-write-wins) for append-only/positional state + version-checked writes (409 + refetch) for config; no locks/CRDT until multi-user.
- **Skills (Q7):** reusable Agent Skills at **user** and **board** levels, activated per card.
- **Card naming (Q8):** placeholder title on create, renamable anytime; optional Brain-proposed title.

_Build-level detail (contracts, Zod schemas, the agent loop, adapter factories, phasing): see `implementation-plan.md`._
