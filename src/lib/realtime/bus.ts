import type { SessionEvent } from "@/lib/realtime/events";

/**
 * The realtime pub/sub seam between the poller (publisher) and the SSE endpoint
 * (subscriber). `subscribe` yields events published to `channel` (a session id)
 * after subscription; pass an `AbortSignal` to end the stream on disconnect.
 * The in-memory impl below serves tests and single-process dev; a Redis-backed
 * impl (Increment 4) is selected in prod.
 */
export type EventBus = {
    publish: (channel: string, event: SessionEvent) => Promise<void>;
    subscribe: (
        channel: string,
        signal?: AbortSignal,
    ) => AsyncIterable<SessionEvent>;
};

type Listener = (event: SessionEvent) => void;

/** Process-local bus: a per-channel listener set, each subscriber draining its
 *  own queue. Lossless for events published while subscribed; no replay (the
 *  SSE endpoint replays missed events from Postgres). */
export const createInMemoryBus = (): EventBus => {
    const channels = new Map<string, Set<Listener>>();

    return {
        publish: (channel, event) => {
            for (const listener of channels.get(channel) ?? []) listener(event);
            return Promise.resolve();
        },

        subscribe: (channel, signal) => {
            const queue: SessionEvent[] = [];
            let pending: ((r: IteratorResult<SessionEvent>) => void) | null =
                null;
            let closed = false;

            const listener: Listener = (event) => {
                if (pending) {
                    pending({ value: event, done: false });
                    pending = null;
                } else {
                    queue.push(event);
                }
            };

            const set = channels.get(channel) ?? new Set<Listener>();
            set.add(listener);
            channels.set(channel, set);

            const close = () => {
                if (closed) return;
                closed = true;
                set.delete(listener);
                if (pending) {
                    pending({ value: undefined, done: true });
                    pending = null;
                }
            };
            signal?.addEventListener("abort", close);

            return {
                [Symbol.asyncIterator]: () => ({
                    next: () => {
                        const queued = queue.shift();
                        if (queued !== undefined) {
                            return Promise.resolve({
                                value: queued,
                                done: false,
                            });
                        }
                        if (closed) {
                            return Promise.resolve({
                                value: undefined,
                                done: true,
                            });
                        }
                        return new Promise<IteratorResult<SessionEvent>>(
                            (resolve) => {
                                pending = resolve;
                            },
                        );
                    },
                    return: () => {
                        close();
                        return Promise.resolve({
                            value: undefined,
                            done: true,
                        });
                    },
                }),
            };
        },
    };
};
