import type { Activity } from "@/lib/db/activities";
import type { ActivityEvent, SessionEvent } from "@/lib/realtime/events";

/**
 * Pure SSE-wire formatting, kept out of the route so it's unit-testable. An
 * activity chunk carries `id: <seq>` so the browser sets `Last-Event-ID` and
 * can resume from that cursor after a reconnect.
 */

export const activityRowToEvent = (a: Activity): ActivityEvent => ({
    type: "activity",
    executionId: a.executionId,
    id: a.id,
    seq: a.seq,
    at: a.at,
    source: a.source,
    kind: a.kind,
    text: a.text,
    data: a.data,
    cursor: a.cursor,
});

export const sseChunk = (event: SessionEvent): string => {
    const idLine =
        event.type === "activity" ? `id: ${String(event.seq)}\n` : "";
    return `${idLine}event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
};

export const sseComment = (text = "keepalive"): string => `: ${text}\n\n`;
