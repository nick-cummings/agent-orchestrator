# Agent Orchestrator — Implementation Plan

**Hybrid v1, built provider-swappable.** Companion to `agent-orchestrator-spec.md` (v0.6). This document covers *how* to build it; the spec covers *what* and *why*.

*Draft v0.3 — May 2026. Owner: Nick.*
*v0.1 → v0.2: code style is **functional** — pure functions + TypeScript `type`s + Zod schemas, **no classes**. Contracts are types describing records of functions; adapters are factory functions; Zod is the source of truth for every validated shape.*
*v0.2 → v0.3: resolved the open questions. New: a **user → board → card config-inheritance** layer (`resolveConfig` merge) that feeds routing; an **`ApprovalPolicy`** (action category → `auto | ask`) gating the tool loop; reusable **`Skill`s** at user/board levels; `Activity` confirmed as its own entity rendered inline-collapsible; multi-tab reconcile = optimistic broadcast for append/positional state + version-checked writes for config.*

---

## 1. The thesis: two swappable seams

Everything in this build hangs off one idea. A card does two separable things:

1. **Converse and orchestrate** — hold the chat, decide what to do, narrate progress. Call this the **Brain**.
2. **Execute cloud coding work** — run in the cloud (computer-off), edit the repo, open a PR. Call this the **Engine**.

In the hybrid v1, **Brain = Claude** (Agent SDK, on the Max 5× subscription credit) and **Engine = Jules** (Google AI Pro, flat-rate). But those are just *today's* bindings. Every architecture you might switch to is the same two roles pointed at different providers:

| Architecture | Brain | Engine | Why you'd switch |
|---|---|---|---|
| **Hybrid (v1)** | Claude (sub credit) | Jules (Google AI Pro) | Claude-quality chat, flat-rate cloud coding, both subs do double duty |
| **Claude-only** | Claude | Claude-in-sandbox (Agent SDK) | If you want Claude *writing* the code, or Anthropic's billing gets better |
| **Gemini-only** | Gemini (API/CLI) | Jules or Gemini-in-sandbox | If Google's plans get cheaper or you standardize on Gemini |

**Design rule:** abstract *only* these two seams (plus credentials). Resist interface-everything. The kanban UI, the data layer, the SSE transport, the Connections model — those aren't volatile, so build them plainly. The whole portability budget goes into the `ConversationProvider` and `ExecutionEngine` boundaries, because those are the only things the changing AI market will force you to swap.

### Code conventions (load-bearing — every sample below follows these)

No classes, no `this`, no `new`, no `implements`.

- **Contracts are `type` aliases** describing a *record of functions* (a "module object"), never an `interface` implemented by a class.
- **Adapters are factory functions** — `createClaudeBrain(deps): ConversationProvider` — that capture dependencies in a closure and return that record. Dependencies are passed explicitly as a `deps` argument; there is no DI container and no inheritance.
- **Logic lives in standalone pure functions.** The functions inside a provider record delegate to free functions (`claudeGenerate(deps, input)`); side effects (HTTP, DB, clock) are injected via `deps` so the core stays unit-testable.
- **Zod is the single source of truth** for every validated shape — tool inputs, domain entities, config/routing, and *especially* untrusted vendor responses (Jules `v1alpha` activities, model stream chunks). Pattern: define the Zod schema, derive the static type with `z.infer<typeof Schema>`, and for tool params derive the model-facing JSON Schema with `zodToJsonSchema`. Validate at every boundary with `Schema.parse()` so vendor drift fails loudly at the adapter, not silently three layers down.

---

## 2. What the hybrid changes vs. the spec

**Stays the same:** boards/columns/cards/Connections model, the kanban PWA, SSE-to-client streaming, Postgres for state + transcripts, the multi-account credential story (§6 of the spec).

**Simplifies (big one):** the spec's §8 lifecycle and §5.3–5.4 in-sandbox supervisor existed to keep a *durable agent* alive across days, because the Claude Agent SDK loop had to outlive any request. In the hybrid that problem **moves to Jules** — Google hosts the long-running agent. So:

- The **Brain is request-driven**: a chat turn runs, streams, and exits. Nothing needs to outlive a request. Serverless-friendly.
- The **Engine (Jules) is hosted by Google** and runs computer-off by definition.
- ⟹ **No in-sandbox supervisor, no E2B, no pause/hibernate machinery is needed for v1.** That entire subsystem becomes the *implementation of one optional Engine adapter* (the future "Claude/Gemini-coded cards"), not the core path.

**New:** the `ExecutionEngine` abstraction, a server-side **poller** for Engine activity, and the **Brain↔Engine-via-tools** wiring.

---

## 3. Architecture (layered, dependency-inverted)

```
┌─────────────────────────────────────────────────────────────┐
│  PWA (Next.js client) — kanban UI, card chat + activity view  │
│  SSE consumer · POST send/interrupt · deep-link buttons        │
└───────────────┬───────────────────────────────────────────────┘
                │ REST + SSE
┌───────────────▼───────────────────────────────────────────────┐
│  API / Orchestration (Next.js route handlers)                  │
│  - Board/Column/Card/Connection CRUD                           │
│  - Owns the AGENT LOOP (§5)  - SSE relay  - poller triggers    │
└───────────────┬───────────────────────────────────────────────┘
                │ depends on TYPES (contracts) only ▼
┌───────────────────────────────────────────────────────────────┐
│  Core domain (provider-agnostic) — NO vendor imports           │
│  Contracts (types): ConversationProvider · ExecutionEngine ·   │
│    CredentialProvider · VcsProvider                            │
│  Zod schemas (domain entities) · agent loop · tool registry ·  │
│    composition root (buildProviders)                           │
└───────────────┬───────────────────────────────────────────────┘
                │ produced by factory functions ▼  (swap point)
┌───────────────────────────────────────────────────────────────┐
│  Adapters (vendor-specific, swappable) — factory fns           │
│  Brains:  createClaudeBrain · createGeminiBrain (future)       │
│  Engines: createJulesEngine · createSandboxEngine (future)     │
│  VCS: createGitHubVcs · Creds: createCredentialProvider        │
└───────────────┬───────────────────────────────────────────────┘
                ▼
   Postgres · Redis · Vercel Cron/QStash · Anthropic API · Jules REST · Google Cloud
```

**The dependency rule (this is what makes swaps cheap):** the core domain and the orchestration layer import *types* (contracts), never concrete adapters. A single **composition root** (`buildProviders`, §6) calls the right factory functions from config. Adapters are anti-corruption layers — they parse a vendor's shapes through Zod into your domain types, and nothing vendor-specific leaks upward.

---

## 4. The two core contracts

All types and schemas below live in the core domain. Adapters depend on the domain; the domain never depends on adapters.

### 4.1 `ConversationProvider` (the Brain)

The app owns the agent loop, so the provider's only job is **one model call**: take the conversation + available tools, stream back text/thinking/tool-calls. That keeps the loop identical across Claude and Gemini.

```ts
import { z } from "zod";

// Internal streaming events — produced by our own code, so a plain discriminated union type.
type ModelEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "turn_end"; stop: "stop" | "tool_use" | "max_tokens" | "interrupt" }
  | { type: "error"; error: string };

// A tool carries a Zod schema for its params; the model-facing JSON Schema is derived at call time.
type ToolSpec = { name: string; description: string; schema: z.ZodTypeAny };

type GenerateInput = {
  messages: Message[];      // normalized domain messages
  tools: ToolSpec[];
  model?: string;           // optional hint; adapter maps to a concrete model id
  signal?: AbortSignal;     // interruption
};

type BrainCaps = { streaming: boolean; thinking: boolean; parallelToolCalls: boolean; maxContextTokens: number };

// CONTRACT: a record of functions — not a class, not an interface-with-impl.
type ConversationProvider = {
  id: "claude" | "gemini";
  caps: BrainCaps;
  generate: (input: GenerateInput) => AsyncIterable<ModelEvent>;
};

// ADAPTER: a factory function. Deps captured in a closure; logic delegated to free functions.
const createClaudeBrain = (deps: BrainDeps): ConversationProvider => ({
  id: "claude",
  caps: { streaming: true, thinking: true, parallelToolCalls: true, maxContextTokens: 200_000 },
  // claudeGenerate is a standalone async generator; it converts each ToolSpec's Zod schema
  // to JSON Schema (zodToJsonSchema) before calling the Anthropic API, and maps the SDK's
  // stream events into ModelEvent. Auth comes from deps.creds.resolveBrainAuth(...).
  generate: (input) => claudeGenerate(deps, input),
});
```

- **`createClaudeBrain`** — Claude Agent SDK / Anthropic Messages API. Auth via `CredentialProvider` (subscription credit by default; API key alt). Because the Brain isn't doing the token-heavy coding, its token spend is light and the subscription credit stretches far.
- **`createGeminiBrain`** (future) — same `ConversationProvider` type, different free functions inside.

### 4.2 `ExecutionEngine` (the cloud coder)

```ts
import { z } from "zod";

// Zod is the source of truth for boundary data. Vendor responses are parsed through these.
const ExecutionState = z.enum([
  "starting", "planning", "awaiting_plan_approval",
  "running", "awaiting_feedback", "succeeded", "failed", "cancelled",
]);
type ExecutionState = z.infer<typeof ExecutionState>;

const Activity = z.object({                 // NOT Jules's raw shape — the normalized domain shape
  id: z.string(),
  at: z.string(),                            // ISO timestamp
  source: z.enum(["agent", "user", "system"]),
  kind: z.enum(["plan", "message", "code_change", "tool", "progress", "result"]),
  text: z.string().optional(),               // human-readable, for narration/display
  data: z.unknown().optional(),              // normalized structured payload
});
type Activity = z.infer<typeof Activity>;

const ExecutionResult = z.object({
  prUrl: z.string().url().optional(),
  diffSummary: z.string().optional(),
  artifacts: z.array(z.object({ name: z.string(), url: z.string().url().optional() })).optional(),
});
type ExecutionResult = z.infer<typeof ExecutionResult>;

type ExecutionHandle = { id: string; engine: string; externalRef: string; deepLink: string };
type EngineCaps = {
  conversational: boolean;   // accepts follow-up messages mid-run
  planApproval: boolean;     // has a plan-approval gate
  streaming: boolean;        // true push vs. polling
  vcs: ("github" | "gitlab")[];
  selfHosted: boolean;       // your sandbox vs. vendor cloud
};

// CONTRACT: a record of functions.
type ExecutionEngine = {
  id: "jules" | "sandbox-claude" | "sandbox-gemini";
  caps: EngineCaps;
  start: (input: StartTaskInput, cred: ResolvedCredential) => Promise<ExecutionHandle>;
  sendMessage: (ref: string, message: string, cred: ResolvedCredential) => Promise<void>;
  listActivities: (ref: string, since?: string) => Promise<Activity[]>;   // since = cursor/timestamp
  getStatus: (ref: string) => Promise<{ state: ExecutionState; updatedAt: string }>;
  approvePlan?: (ref: string, cred: ResolvedCredential) => Promise<void>;
  getResult: (ref: string) => Promise<ExecutionResult>;
  cancel?: (ref: string) => Promise<void>;
  deepLink: (ref: string) => string;        // link to the vendor's own UI/logs (the backstop)
};

// ADAPTER: a factory. The Jules wire format is validated with Zod at the boundary, then normalized.
const JulesActivitiesResponse = z.object({ activities: z.array(JulesActivity) });   // raw Jules shape

const createJulesEngine = (deps: JulesDeps): ExecutionEngine => ({
  id: "jules",
  caps: { conversational: true, planApproval: true, streaming: false /* poll */, vcs: ["github"], selfHosted: false },
  start: (input, cred) => julesStart(deps, input, cred),
  sendMessage: (ref, msg, cred) => julesSendMessage(deps, ref, msg, cred),
  listActivities: async (ref, since) => {
    const raw = await julesGetActivities(deps, ref, since);          // fetch
    return JulesActivitiesResponse.parse(raw).activities.map(toDomainActivity);   // validate + normalize
  },
  getStatus: (ref) => julesGetStatus(deps, ref),
  approvePlan: (ref, cred) => julesApprovePlan(deps, ref, cred),
  getResult: (ref) => julesGetResult(deps, ref),
  deepLink: (ref) => `https://jules.google/sessions/${ref}`,
});
```

**`createJulesEngine`** maps the v1alpha REST API onto the contract:

| Contract function | Jules endpoint |
|---|---|
| `start` | `POST /v1alpha/sessions` (prompt, source, `requirePlanApproval`) |
| `sendMessage` | `POST /v1alpha/sessions/{id}:sendMessage` |
| `listActivities(since)` | `GET /v1alpha/sessions/{id}/activities?createTime={since}` |
| `getStatus` | derive from session state / latest activity |
| `approvePlan` | `POST /v1alpha/sessions/{id}:approvePlan` |
| `getResult` | scan activities for PR/code-change events |
| `deepLink` | `jules.google` session URL |

`toDomainActivity` is the anti-corruption mapper: Jules's `planGenerated` / `agentMessage` / code-change shapes → the domain `Activity` — so the rest of the app never sees a Jules-specific field.

**`createSandboxEngine`** (future, for Claude-only/Gemini-only) — same `ExecutionEngine` type; its free functions run an Agent SDK or Gemini CLI harness inside an E2B microVM (this is where the spec's §5.3–5.4 design lands, as *one factory*). Caps: `{ conversational: true, planApproval: false, streaming: true, selfHosted: true }`. Only build it when you want a code-writing Claude/Gemini.

---

## 5. The agent loop (pure function, provider-agnostic)

A standalone async generator — no class, no state outside its arguments. Same code for any Brain and any Engine; the Engine only appears as **tools** the Brain can call.

```ts
type TurnCtx = {
  brain: ConversationProvider;
  tools: ToolRegistry;          // name -> { spec, run, category }
  history: Message[];
  policy: ApprovalPolicy;       // effective (merged user→board→card) policy for this card
  awaitApproval: (callId: string) => Promise<void>;  // resolves when the user taps "approve"
  signal?: AbortSignal;
};

async function* runTurn(ctx: TurnCtx): AsyncIterable<TurnEvent> {
  let messages = ctx.history;
  while (true) {
    const calls: ToolCall[] = [];
    for await (const ev of ctx.brain.generate({ messages, tools: specsOf(ctx.tools), signal: ctx.signal })) {
      if (ev.type === "text_delta")          yield { type: "text", text: ev.text };       // → SSE → card
      else if (ev.type === "thinking_delta") yield { type: "thinking", text: ev.text };
      else if (ev.type === "tool_call")      calls.push(ev);
      else if (ev.type === "error")          { yield { type: "error", error: ev.error }; return; }
    }
    if (calls.length === 0) return;                       // final text produced — turn done
    const results: ToolResult[] = [];
    for (const c of calls) {                              // sequential so the approval gate can pause
      const category = ctx.tools[c.name]?.category;       // each tool declares an action category
      if (decideApproval(ctx.policy, category) === "ask") {
        yield { type: "approval_request", call: c };      // surfaced in the card as tap-to-approve
        await ctx.awaitApproval(c.id);                    // resolves on approval (throws on reject)
      }
      results.push({ id: c.id, output: await runTool(ctx.tools, c.name, c.input) });
    }
    messages = appendTurn(messages, calls, results);      // pure: persist + loop so Brain reacts
  }
}
```

**Engine exposed as tools** — a function returning a record. Each tool pairs a **Zod schema** (params) with a handler; the model-facing JSON Schema is derived from the Zod schema, and the handler's input is `Schema.parse`d before it runs. Tools are named for *intent*, never for the vendor, so swapping the Engine changes nothing the Brain sees.

```ts
import { z } from "zod";

const ActionCategory = z.enum(["read", "branch_write", "destructive", "network", "merge_deploy", "spend"]);
type ActionCategory = z.infer<typeof ActionCategory>;

type Tool<I> = { name: string; description: string; category: ActionCategory; schema: z.ZodType<I>; run: (input: I) => Promise<unknown> };
type ToolRegistry = Record<string, Tool<any>>;

const defineTool = <I>(name: string, description: string, category: ActionCategory, schema: z.ZodType<I>, run: (i: I) => Promise<unknown>): Tool<I> =>
  ({ name, description, category, schema, run });

// specsOf() converts each tool's Zod schema to a ToolSpec (JSON Schema derived via zodToJsonSchema).
// runTool() validates input with the tool's Zod schema, then calls run().

const engineTools = (engine: ExecutionEngine, cred: ResolvedCredential, ctx: LinkCtx): ToolRegistry => compact({
  start_coding_task: defineTool(
    "start_coding_task", "Start a cloud coding task on a repo", "branch_write",
    z.object({ repo: RepoRef, prompt: z.string() }),
    async (i) => { const h = await engine.start(i, cred); ctx.linkExecution(h); return { executionId: h.id, deepLink: h.deepLink }; },
  ),
  send_instruction: defineTool(
    "send_instruction", "Send guidance to a running task", "branch_write",
    z.object({ ref: z.string(), text: z.string() }),
    (i) => engine.sendMessage(i.ref, i.text, cred),
  ),
  check_progress: defineTool(
    "check_progress", "Get latest activity for a task", "read",
    z.object({ ref: z.string(), since: z.string().optional() }),
    (i) => engine.listActivities(i.ref, i.since),
  ),
  approve_plan: engine.caps.planApproval
    ? defineTool("approve_plan", "Approve the task's plan", "branch_write", z.object({ ref: z.string() }), (i) => engine.approvePlan!(i.ref, cred))
    : undefined,
  get_result: defineTool(
    "get_result", "Get the PR/result of a task", "read",
    z.object({ ref: z.string() }),
    (i) => engine.getResult(i.ref),
  ),
});
```

So the Brain converses, decides to `start_coding_task`, polls `check_progress`, and narrates results into the chat — never knowing it's Jules underneath. Before any `ask`-category tool runs, the loop pauses for a tap (see the `ApprovalPolicy` + `resolveConfig` in §6).

---

## 6. Supporting abstractions

**`CredentialProvider`** — ties to the spec's `Connection` model and decouples *which kind* of auth from the call site. This is what makes the June-15 billing shifts (and any future ones) a config change.

```ts
import { z } from "zod";

const CredKind = z.enum([
  "anthropic_subscription", "anthropic_api_key", "gemini_api_key",
  "google_oauth", "jules_api_key", "github_oauth", "github_pat", "atlassian_oauth", "gmail_oauth",
]);
type CredKind = z.infer<typeof CredKind>;

type ResolvedCredential = { kind: CredKind; value: SecretRef };   // raw secret never enters the domain layer

type CredentialProvider = {
  resolve: (connectionId: string) => Promise<ResolvedCredential>;       // decrypt at use, backend only
  resolveBrainAuth: (sessionId: string) => Promise<ResolvedCredential>; // subscription credit vs API key vs Gemini
};
const createCredentialProvider = (deps: CredDeps): CredentialProvider => ({
  resolve: (id) => resolveConnectionCred(deps, id),
  resolveBrainAuth: (sid) => resolveBrainCred(deps, sid),
});
```

**`VcsProvider`** — GitHub now (`createGitHubVcs`); abstracted so GitLab is another factory later. Backs the Engine's repo target and the "open in GitHub" deep links.

**Provider routing + composition root** — *the swap mechanism*:

```ts
import { z } from "zod";

const ProviderRouting = z.object({
  brain: z.enum(["claude", "gemini"]),
  executor: z.enum(["jules", "sandbox-claude", "sandbox-gemini"]),
  model: z.string().optional(),
});
type ProviderRouting = z.infer<typeof ProviderRouting>;

// Composition root: a pure selector over config that calls factory functions. No `new`, no `switch`-on-class.
const buildProviders = (r: ProviderRouting, deps: Deps): { brain: ConversationProvider; engine: ExecutionEngine } => ({
  brain:  r.brain === "claude" ? createClaudeBrain(deps) : createGeminiBrain(deps),
  engine: r.executor === "jules"          ? createJulesEngine(deps)
        : r.executor === "sandbox-claude" ? createSandboxEngine({ harness: "claude", ...deps })
        :                                   createSandboxEngine({ harness: "gemini", ...deps }),
});
```

Routing is one field of a card's **effective config** (below), not a standalone setting — `buildProviders` is fed `effectiveConfig.routing`. **Switching the app's architecture = change the default routing + make sure the factory exists.** Switching one card = change its routing. That's the entire cost of a swap.

**Config inheritance (user → board → card)** — *the settings model*:

```ts
import { z } from "zod";

// ActionCategory is defined in §5 (the tool registry).
const ApprovalPolicy = z.record(ActionCategory, z.enum(["auto", "ask"]));
type ApprovalPolicy = z.infer<typeof ApprovalPolicy>;

const DEFAULT_POLICY: ApprovalPolicy = {
  read: "auto", branch_write: "auto",
  destructive: "ask", network: "ask", merge_deploy: "ask", spend: "ask",
};

// What may be set at any tier. .partial() → every field optional, so unset inherits from above.
const Config = z.object({
  routing: ProviderRouting.partial(),
  approvalPolicy: ApprovalPolicy,
  skillIds: z.array(z.string()),          // skills active at this tier
  verbosity: z.enum(["verbose", "normal", "quiet"]),
  systemPrompt: z.string(),
  defaultRepos: z.array(RepoRef),
  requirePlanApproval: z.boolean(),
}).partial();
type Config = z.infer<typeof Config>;

// Pure merge, most-specific-defined-wins. No precedence magic.
const resolveConfig = (user: Config, board: Config, card: Config): Config =>
  deepMergeDefined(user, board, card);

const decideApproval = (p: ApprovalPolicy | undefined, category?: ActionCategory): "auto" | "ask" =>
  !category ? "auto" : (p?.[category] ?? DEFAULT_POLICY[category]);

// Reusable skill, stored at the user or board tier; a card activates a subset.
const Skill = z.object({
  id: z.string(),
  ownerLevel: z.enum(["user", "board"]),
  ownerId: z.string(),
  name: z.string(),
  instructions: z.string(),
  toolRefs: z.array(z.string()).default([]),
});
type Skill = z.infer<typeof Skill>;
```

`resolveConfig` is a pure function over three plain `Config` records; the card Settings UI shows each value as *inherited* or *overridden*, and clearing a card override falls back to board, then user, then `BASE_CONFIG`. A card's active skills resolve the same way — the union of the user/board `skillIds` it has switched on, drawn from the user/board **`Skill`** library. The agent loop (§5) calls `decideApproval` before each tool runs.

---

## 7. Data model deltas vs. the spec

Keep the spec's §10 model. **Every entity is a Zod schema (the source of truth); the TS type is `z.infer`.** Vendor payloads are parsed through Zod at the adapter boundary. Changes:

- **`Session`** gains `brainProvider`, `executorEngine` (it already has `model`). Drop the hard 1:1 "live Claude agent" framing — a Session is now *a conversation (Brain) plus zero-or-more linked Executions*.
- **New `Execution`** (provider-agnostic):
  ```ts
  const Execution = z.object({
    id: z.string(),
    sessionId: z.string(),
    engine: z.enum(["jules", "sandbox-claude", "sandbox-gemini"]),
    externalRef: z.string(),                 // opaque vendor id (e.g. Jules sessionId) — ONLY place it lives
    state: ExecutionState,
    lastActivityCursor: z.string().nullable(),
    deepLinkUrl: z.string().url(),
    resultPrUrl: z.string().url().nullable(),
    createdAt: z.string(), updatedAt: z.string(),
  });
  type Execution = z.infer<typeof Execution>;
  ```
  `externalRef` is the *only* place a vendor id lives — domain logic keys off `Execution.id`.
- **Activities** — kept as their own `Activity` rows (schema in §4.2), *not* folded into messages (Q4): the poller needs a clean per-Execution cursor and activities have a different lifecycle. The client renders them as a **collapsed inline element** in the chat (Q2).
- The spec's sandbox fields (`sandboxId`, `sandboxState`, pause/hibernate) become **nullable / Engine-specific** — only the `sandbox-*` engines use them; Jules executions leave them null.
- **Config entities:** `Config` is embedded on `User` (`defaultConfig`), `Board` (`defaultConfig`), and `Card`/`Session` (`configOverride`); `ApprovalPolicy` and `Skill` per §6. Config-bearing rows carry a **`version`** integer for optimistic-concurrency writes (Q6).
- **`Card.title`** defaults to a placeholder and is renamable anytime; a `titleSetByUser` flag stops auto-suggestions from clobbering a manual title.

---

## 8. Realtime & computer-off (revised)

- **Client SSE is unchanged** from spec §9 — the card subscribes to `GET /api/sessions/:id/stream`, gets replay-from-Postgres + live tail.
- **Event sources** are now two: (a) the Brain's turn stream (request-driven), and (b) a **server-side poller** that polls each active Execution's `listActivities(since)` and publishes normalized activities to the session's Redis channel.
- **Computer-off** is satisfied without any user device: **Vercel** (always-on serverless backend) + **Jules** (Google-hosted agent) + a **poller on Vercel Cron / QStash** (or a small worker) that advances Executions and fires **web-push** notifications on state changes (plan ready, awaiting feedback, PR opened). Open the PWA on your phone → latest state is already there.
- **Hosting note (revises spec §5.6):** because the Brain is request-driven and the durable agent is external, **Vercel is now a clean fit**. Keep Postgres + Redis managed. If/when you add a `sandbox-*` engine, revisit whether that adapter wants a persistent worker.
- **Multi-tab / multi-device reconcile (Q6):** append-only and positional changes (new messages, card moves) write immediately and broadcast over the SSE channel — last-write-wins. **Config/settings writes carry the row's `version`**; a stale write is rejected (409), and the client refetches and reapplies, so inheritance settings are never silently clobbered. Soft locks / CRDTs are deferred until a second user exists.

---

## 9. Build phases

**Phase 0 — Contracts & skeleton.** Write the contract `type`s (`ConversationProvider`, `ExecutionEngine`, `CredentialProvider`, `VcsProvider`), the domain **Zod schemas**, and `buildProviders` with **stub factories that throw**. Stand up the Next.js app, Postgres schema (from the Zod schemas), and a static kanban (boards/columns/cards CRUD + dnd-kit reorder, organizational only). Cards auto-title with a renamable placeholder; define the `Config`, `ApprovalPolicy`, and `Skill` Zod schemas now (only base defaults wired). *The loose-coupling foundation — get the seams right before any provider exists.*

**Phase 1 — Jules engine, no Brain (vertical slice).** Implement `createJulesEngine` + the poller. A card starts a Jules task; the card view shows the normalized activity feed as a **collapsed inline element** + "open in Jules" + the PR link on completion. **A working computer-off cloud-agent kanban on Jules alone** — de-risks the founding requirement before Claude is involved.

**Phase 2 — Claude brain + agent loop.** Implement `createClaudeBrain` and the pure-function loop (§5); expose the Engine as tools; stream the Brain's narration over SSE; wire the **`ApprovalPolicy` gate** into the loop (`auto` runs, `ask` pauses for a tap). The card chat is now Claude talking to you and driving Jules. **Full hybrid working.**

**Phase 3 — Connections, settings inheritance & multi-account.** `createCredentialProvider` + per-card Settings modal (which GitHub account, which Anthropic auth, which Google account), plus the **user → board → card config inheritance** (board/user settings screens, `resolveConfig` merge, inherited-vs-overridden UI), the **user/board skills library**, and **version-checked config writes** (Q6). The differentiator.

**Phase 4 — PWA polish + computer-off UX.** Installable PWA + service worker; web-push on state changes; deep-link buttons (open PR in GitHub, open repo in local IDE via `vscode://` / `github.dev`); idle handling.

**Phase 5 — Prove the swap (optional/future).** Add `createSandboxEngine` (Agent SDK harness in E2B) → unlocks **Claude-only**. Add `createGeminiBrain` → unlocks **Gemini-only**. Each is an additive factory + a routing flip, no rewrite — the payoff of Phase 0.

---

## 10. Risks & judgment calls

- **Jules API is `v1alpha`** → it will change. Contain every Jules detail inside `createJulesEngine`; the **Zod parse at the boundary** (`JulesActivitiesResponse.parse`) plus the normalized `Activity`/`Execution` schemas are your firewall — drift throws at the adapter, not silently downstream.
- **Over-abstraction** → the temptation is to abstract *everything*. Don't. Two seams + credentials. The kanban, the DB, the transport stay concrete.
- **Polling, not streaming, for Engine progress** → Jules is poll-granular (events, not tokens). Acceptable per your own bar (narration + a logs link). The `caps.streaming` flag lets a future `sandbox-*` engine stream tokens without changing callers.
- **The coder is Gemini in the hybrid** → by design. When you want Claude *writing* code, that's the Phase-5 `sandbox-claude` engine on a per-card basis — not a rewrite.
- **Billing keeps moving** → that's the whole reason for `CredentialProvider` + routing. Re-pointing the Brain from subscription credit to API key, or the Engine from Jules to a sandbox, is config, not surgery.

---

## 11. Open questions

**Resolved (v0.3):** routing granularity → part of config inheritance (board default, card override); activity rendering & transcript-vs-activities → `Activity` is its own entity, rendered inline-collapsible; plan approval → `ApprovalPolicy` (category → `auto | ask`), inherited per tier; multi-tab reconcile → optimistic broadcast + version-checked config writes; skills → reusable at user/board levels.

**Still open:**
1. **MCP hosting** *(deferred to Phase 5, `sandbox-*` only)* — per-sandbox vs. shared services. Lean: shared for stateless/expensive tools, per-sandbox for anything needing the card's filesystem or credentials.
2. **Product name** — "Orchestrator" is a placeholder.
