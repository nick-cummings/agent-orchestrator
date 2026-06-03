import type { SessionEvent } from "@/lib/realtime/events";
import { createEventQueue, type EventQueue } from "@/lib/realtime/queue";

/**
 * The realtime pub/sub seam between the poller (publisher) and the SSE endpoint
 * (subscriber). `subscribe` yields events published to `channel` (a session id)
 * after subscription; pass an `AbortSignal` to end the stream on disconnect.
 * The in-memory impl below serves tests and single-process dev; the Redis impl
 * (redisBus.ts) is selected in prod via `getBus` (index.ts).
 */
export type EventBus = {
    publish: (channel: string, event: SessionEvent) => Promise<void>;
    subscribe: (
        channel: string,
        signal?: AbortSignal,
    ) => AsyncIterable<SessionEvent>;
};

/** Process-local bus: a per-channel set of subscriber queues. Lossless for
 *  events published while subscribed; no replay (the SSE endpoint replays
 *  missed events from Postgres). */
export const createInMemoryBus = (): EventBus => {
    const channels = new Map<string, Set<EventQueue>>();

    return {
        publish: (channel, event) => {
            for (const queue of channels.get(channel) ?? []) queue.push(event);
            return Promise.resolve();
        },

        subscribe: (channel, signal) => {
            const set = channels.get(channel) ?? new Set<EventQueue>();
            channels.set(channel, set);
            const queue = createEventQueue(() => set.delete(queue));
            set.add(queue);
            signal?.addEventListener("abort", () => {
                queue.close();
            });
            return queue.iterable;
        },
    };
};
