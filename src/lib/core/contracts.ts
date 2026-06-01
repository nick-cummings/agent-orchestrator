import { z } from "zod";

import type {
    Activity,
    BrainId,
    CredKind,
    ExecutionState,
    ExecutorId,
    Message,
    RepoRef,
} from "@/lib/core/schemas";

/**
 * The contracts — the only abstracted seams (implementation-plan §1, §4). Each
 * is a `type` describing a *record of functions* (no classes, no interfaces).
 * Adapters are factory functions that return these records.
 */

// ── Brain (ConversationProvider) ──────────────────────────────────────────────

/** Internal streaming events produced by our own code → a plain union. */
export type ModelEvent =
    | { type: "text_delta"; text: string }
    | { type: "thinking_delta"; text: string }
    | { type: "tool_call"; id: string; name: string; input: unknown }
    | {
          type: "turn_end";
          stop: "stop" | "tool_use" | "max_tokens" | "interrupt";
      }
    | { type: "error"; error: string };

/** A tool carries a Zod schema for its params; JSON Schema is derived at call time. */
export type ToolSpec = {
    name: string;
    description: string;
    schema: z.ZodType;
};

export type GenerateInput = {
    messages: Message[];
    tools: ToolSpec[];
    model?: string;
    signal?: AbortSignal;
};

export type BrainCaps = {
    streaming: boolean;
    thinking: boolean;
    parallelToolCalls: boolean;
    maxContextTokens: number;
};

/** CONTRACT: a record of functions. Its only job is one model call. */
export type ConversationProvider = {
    id: BrainId;
    caps: BrainCaps;
    generate: (input: GenerateInput) => AsyncIterable<ModelEvent>;
};

// ── Engine (ExecutionEngine) ──────────────────────────────────────────────────

export type ExecutionHandle = {
    id: string;
    engine: string;
    externalRef: string;
    deepLink: string;
};

export type StartTaskInput = {
    repo: RepoRef;
    prompt: string;
    requirePlanApproval?: boolean;
};

export const ExecutionResult = z.object({
    prUrl: z.url().optional(),
    diffSummary: z.string().optional(),
    artifacts: z
        .array(z.object({ name: z.string(), url: z.url().optional() }))
        .optional(),
});
export type ExecutionResult = z.infer<typeof ExecutionResult>;

export type EngineCaps = {
    conversational: boolean; // accepts follow-up messages mid-run
    planApproval: boolean; // has a plan-approval gate
    streaming: boolean; // true push vs. polling
    vcs: ("github" | "gitlab")[];
    selfHosted: boolean;
};

/** CONTRACT: a record of functions wrapping a cloud coding agent. */
export type ExecutionEngine = {
    id: ExecutorId;
    caps: EngineCaps;
    start: (
        input: StartTaskInput,
        cred: ResolvedCredential,
    ) => Promise<ExecutionHandle>;
    sendMessage: (
        ref: string,
        message: string,
        cred: ResolvedCredential,
    ) => Promise<void>;
    listActivities: (ref: string, since?: string) => Promise<Activity[]>;
    getStatus: (
        ref: string,
    ) => Promise<{ state: ExecutionState; updatedAt: string }>;
    approvePlan?: (ref: string, cred: ResolvedCredential) => Promise<void>;
    getResult: (ref: string) => Promise<ExecutionResult>;
    cancel?: (ref: string) => Promise<void>;
    deepLink: (ref: string) => string;
};

// ── Credentials ───────────────────────────────────────────────────────────────

/**
 * An opaque handle to a secret — NEVER the raw secret. The domain layer only
 * ever holds the reference; decryption happens server-side at use time.
 */
export type SecretRef = string;

export type ResolvedCredential = { kind: CredKind; value: SecretRef };

export type CredentialProvider = {
    /** Decrypt a Connection's credential at use time (backend only). */
    resolve: (connectionId: string) => Promise<ResolvedCredential>;
    /** Resolve Brain auth: subscription credit vs API key vs Gemini. */
    resolveBrainAuth: (sessionId: string) => Promise<ResolvedCredential>;
};

// ── VCS ─────────────────────────────────────────────────────────────────────

export type VcsProvider = {
    id: "github";
    caps: { host: "github" };
    /** Web URL for a repo — backs the "open in GitHub" deep links. */
    repoWebUrl: (repo: RepoRef) => string;
};
