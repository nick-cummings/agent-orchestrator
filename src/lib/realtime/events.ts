import { z } from "zod";

import { ExecutionState } from "@/lib/core/schemas";

/**
 * Events published on a session's realtime channel. Two kinds: a persisted
 * activity (carries `seq` so the client dedupes against its SSE replay) and an
 * execution state change. Zod-validated because in prod these cross Redis
 * (Increment 4) — a malformed payload fails loudly rather than corrupting a
 * live stream.
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

export const SessionEvent = z.discriminatedUnion("type", [
    ActivityEvent,
    StateEvent,
]);
export type SessionEvent = z.infer<typeof SessionEvent>;
