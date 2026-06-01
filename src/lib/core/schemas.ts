import { z } from "zod";

/**
 * Domain Zod schemas — the single source of truth for every validated shape
 * (spec §10, implementation-plan §7). Static types are derived with `z.infer`;
 * vendor payloads are parsed through these at the adapter boundary. No vendor
 * fields leak in here.
 */

// ── Primitives ──────────────────────────────────────────────────────────────

export const Id = z.string().min(1);
/** ISO-8601 timestamp string. */
export const Timestamp = z.iso.datetime();
/** A float rank used for ordering (reorders are single-row updates). */
export const Position = z.number();

// ── Routing & policy ─────────────────────────────────────────────────────────

export const BrainId = z.enum(["claude", "gemini"]);
export type BrainId = z.infer<typeof BrainId>;

export const ExecutorId = z.enum(["jules", "sandbox-claude", "sandbox-gemini"]);
export type ExecutorId = z.infer<typeof ExecutorId>;

export const ProviderRouting = z.object({
    brain: BrainId,
    executor: ExecutorId,
    model: z.string().optional(),
});
export type ProviderRouting = z.infer<typeof ProviderRouting>;

/** Action categories the approval gate keys off (implementation-plan §5). */
export const ActionCategory = z.enum([
    "read",
    "branch_write",
    "destructive",
    "network",
    "merge_deploy",
    "spend",
]);
export type ActionCategory = z.infer<typeof ActionCategory>;

export const ApprovalDecision = z.enum(["auto", "ask"]);
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

/** Action category → auto | ask. Partial: a tier sets only what it overrides. */
export const ApprovalPolicy = z.partialRecord(ActionCategory, ApprovalDecision);
export type ApprovalPolicy = z.infer<typeof ApprovalPolicy>;

export const Verbosity = z.enum(["verbose", "normal", "quiet"]);
export type Verbosity = z.infer<typeof Verbosity>;

// ── Repos & config ────────────────────────────────────────────────────────────

export const RepoRef = z.object({
    connectionId: Id,
    repoUrl: z.url(),
    branch: z.string(),
    clonePath: z.string().optional(),
});
export type RepoRef = z.infer<typeof RepoRef>;

/**
 * Settings embedded at user/board/card. Every field optional → unset inherits
 * from the tier above (implementation-plan §6). Effective config is the merge,
 * most-specific-defined-wins.
 */
export const Config = z
    .object({
        routing: ProviderRouting.partial(),
        approvalPolicy: ApprovalPolicy,
        skillIds: z.array(Id),
        verbosity: Verbosity,
        systemPrompt: z.string(),
        defaultRepos: z.array(RepoRef),
        requirePlanApproval: z.boolean(),
    })
    .partial();
export type Config = z.infer<typeof Config>;

// ── Skills ──────────────────────────────────────────────────────────────────

export const Skill = z.object({
    id: Id,
    ownerLevel: z.enum(["user", "board"]),
    ownerId: Id,
    name: z.string(),
    instructions: z.string(),
    toolRefs: z.array(z.string()).default([]),
});
export type Skill = z.infer<typeof Skill>;

// ── Credentials & connections ─────────────────────────────────────────────────

export const CredKind = z.enum([
    "anthropic_subscription",
    "anthropic_api_key",
    "gemini_api_key",
    "google_oauth",
    "jules_api_key",
    "github_oauth",
    "github_pat",
    "atlassian_oauth",
    "gmail_oauth",
]);
export type CredKind = z.infer<typeof CredKind>;

export const Connection = z.object({
    id: Id,
    userId: Id,
    provider: z.enum(["github", "atlassian", "gmail", "google"]),
    label: z.string(),
    authType: z.enum(["oauth", "pat"]),
    encryptedCredential: z.string(),
    scopes: z.array(z.string()),
    expiresAt: Timestamp.nullable(),
    createdAt: Timestamp,
});
export type Connection = z.infer<typeof Connection>;

// ── User / Board / Column ─────────────────────────────────────────────────────

export const User = z.object({
    id: Id,
    email: z.email(),
    createdAt: Timestamp,
    // Encrypted Brain-auth references (resolved server-side at use time).
    anthropicApiKeyRef: z.string().nullable().default(null),
    anthropicSubscriptionRef: z.string().nullable().default(null),
    geminiKeyRef: z.string().nullable().default(null),
    julesKeyRef: z.string().nullable().default(null),
    defaultConfig: Config, // user-tier baseline
});
export type User = z.infer<typeof User>;

export const Board = z.object({
    id: Id,
    userId: Id,
    name: z.string(),
    position: Position,
    sidebarOrder: Position,
    defaultConfig: Config, // board-tier defaults new cards inherit
    version: z.number().int(), // optimistic-concurrency token for config writes
    createdAt: Timestamp,
});
export type Board = z.infer<typeof Board>;

export const Column = z.object({
    id: Id,
    boardId: Id,
    name: z.string(),
    position: Position,
});
export type Column = z.infer<typeof Column>;

// ── Card ──────────────────────────────────────────────────────────────────────

export const CardStatus = z.enum([
    "idle",
    "thinking",
    "awaiting_input",
    "running",
    "awaiting_plan_approval",
    "pr_ready",
    "error",
]);
export type CardStatus = z.infer<typeof CardStatus>;

export const Card = z.object({
    id: Id,
    columnId: Id,
    title: z.string(),
    description: z.string().nullable().default(null),
    position: Position,
    titleSetByUser: z.boolean().default(false),
    status: CardStatus.default("idle"),
    configOverride: Config.nullable().default(null), // card-tier override
    version: z.number().int(),
    archivedAt: Timestamp.nullable().default(null),
    createdAt: Timestamp,
});
export type Card = z.infer<typeof Card>;

// ── Session ────────────────────────────────────────────────────────────────────

export const Session = z.object({
    id: Id,
    cardId: Id,
    brainProvider: BrainId,
    executorEngine: ExecutorId,
    model: z.string(),
    verbosity: Verbosity.default("verbose"),
    systemPrompt: z.string().nullable().default(null),
    skillIds: z.array(Id).default([]),
    connectionIds: z.array(Id).default([]),
    repos: z.array(RepoRef).default([]),
    requirePlanApproval: z.boolean().default(true),
    // sandbox-* engines only — null for the Jules default.
    sandboxId: z.string().nullable().default(null),
    sandboxState: z
        .enum(["active", "paused", "hibernated"])
        .nullable()
        .default(null),
    pauseAfterMinutes: z.number().int().nullable().default(null),
    hibernateAfterDays: z.number().int().nullable().default(null),
    lastActiveAt: Timestamp,
    contextSummary: z.string().nullable().default(null),
    summarizedAt: Timestamp.nullable().default(null),
});
export type Session = z.infer<typeof Session>;

// ── Execution ───────────────────────────────────────────────────────────────────

export const ExecutionState = z.enum([
    "starting",
    "planning",
    "awaiting_plan_approval",
    "running",
    "awaiting_feedback",
    "succeeded",
    "failed",
    "cancelled",
]);
export type ExecutionState = z.infer<typeof ExecutionState>;

export const Execution = z.object({
    id: Id,
    sessionId: Id,
    engine: ExecutorId,
    externalRef: z.string(), // opaque vendor id — the ONLY place it lives
    state: ExecutionState,
    lastActivityCursor: z.string().nullable().default(null),
    deepLinkUrl: z.url(),
    resultPrUrl: z.url().nullable().default(null),
    createdAt: Timestamp,
    updatedAt: Timestamp,
});
export type Execution = z.infer<typeof Execution>;

// ── Messages & activities ─────────────────────────────────────────────────────

export const ContentBlock = z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), text: z.string() }),
    z.object({ type: z.literal("thinking"), text: z.string() }),
    z.object({
        type: z.literal("tool_call"),
        id: z.string(),
        name: z.string(),
        input: z.unknown(),
    }),
    z.object({
        type: z.literal("tool_result"),
        toolCallId: z.string(),
        output: z.unknown(),
    }),
    z.object({
        type: z.literal("image"),
        mimeType: z.string(),
        url: z.url().optional(),
    }),
    z.object({
        type: z.literal("document"),
        mimeType: z.string(),
        name: z.string(),
        url: z.url().optional(),
    }),
]);
export type ContentBlock = z.infer<typeof ContentBlock>;

export const Message = z.object({
    id: Id,
    sessionId: Id,
    role: z.enum(["user", "assistant", "tool"]),
    contentBlocks: z.array(ContentBlock),
    seq: z.number().int(), // monotonic per session — powers SSE replay
    createdAt: Timestamp,
});
export type Message = z.infer<typeof Message>;

/** Normalized Engine event (NOT a vendor shape). Rendered inline-collapsible. */
export const Activity = z.object({
    id: Id,
    executionId: Id,
    at: Timestamp,
    source: z.enum(["agent", "user", "system"]),
    kind: z.enum([
        "plan",
        "message",
        "code_change",
        "tool",
        "progress",
        "result",
    ]),
    text: z.string().optional(),
    data: z.unknown().optional(),
    cursor: z.string(),
});
export type Activity = z.infer<typeof Activity>;
