import { z } from "zod";

import { ExecutionState } from "@/lib/core/schemas";

/**
 * Events published on a session's realtime channel. Two families share the
 * channel: Engine events from the poller (`activity`, `state`) and Brain events
 * from the agent loop (`text`/`thinking` deltas, `tool_call`, `approval_request`,
 * a persisted `message`, `turn_end`). Zod-validated because in prod these cross
 * Redis — a malformed payload is dropped, not streamed.
 */

export const ActivityEvent = z.object({
    type: z.literal("activity"),
    executionId: z.string(),
    id: z.string(),
    seq: z.number().int(),
    at: z.string(),
    source: z.string(),
    kind: z.string(),
    text: z.string().nullable().optional(),
    data: z.unknown().optional(),
    cursor: z.string(),
});
export type ActivityEvent = z.infer<typeof ActivityEvent>;

export const StateEvent = z.object({
    type: z.literal("state"),
    executionId: z.string(),
    state: ExecutionState,
    resultPrUrl: z.string().nullable().optional(),
});
export type StateEvent = z.infer<typeof StateEvent>;

// ── Brain (agent loop) events ─────────────────────────────────────────────────

export const TextEvent = z.object({
    type: z.literal("text"),
    text: z.string(),
});
export const ThinkingEvent = z.object({
    type: z.literal("thinking"),
    text: z.string(),
});
export const ToolCallEvent = z.object({
    type: z.literal("tool_call"),
    id: z.string(),
    name: z.string(),
    input: z.unknown(),
});
export const ApprovalRequestEvent = z.object({
    type: z.literal("approval_request"),
    toolCallId: z.string(),
    name: z.string(),
    input: z.unknown(),
    category: z.string(),
});
/** A persisted message for the client to render (deduped by `id`). Blocks are
 *  carried loosely — the client renders defensively. */
export const MessageEvent = z.object({
    type: z.literal("message"),
    id: z.string(),
    role: z.string(),
    seq: z.number().int(),
    contentBlocks: z.array(z.unknown()),
});
export const TurnEndEvent = z.object({
    type: z.literal("turn_end"),
    stop: z.string(),
});

export const SessionEvent = z.discriminatedUnion("type", [
    ActivityEvent,
    StateEvent,
    TextEvent,
    ThinkingEvent,
    ToolCallEvent,
    ApprovalRequestEvent,
    MessageEvent,
    TurnEndEvent,
]);
export type SessionEvent = z.infer<typeof SessionEvent>;
