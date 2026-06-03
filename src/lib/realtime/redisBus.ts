import type { EventBus } from "@/lib/realtime/bus";
import { SessionEvent } from "@/lib/realtime/events";
import { createEventQueue } from "@/lib/realtime/queue";

/**
 * Redis-backed `EventBus` for multi-instance prod (the poller and the SSE
 * endpoint may run on different Next instances). Publishes JSON to a channel;
 * each subscriber gets a dedicated duplicated connection (ioredis requires a
 * connection in subscriber mode), parses messages through `SessionEvent` (the
 * Redis boundary — malformed payloads are dropped, not streamed), and tears the
 * connection down on close. The minimal `RedisPubSub` shape keeps this
 * unit-testable with a fake client.
 */
export type RedisSubscriber = {
    subscribe: (channel: string) => Promise<unknown>;
    on: (
        event: "message",
        cb: (channel: string, message: string) => void,
    ) => void;
    unsubscribe: (channel: string) => Promise<unknown>;
    quit: () => Promise<unknown>;
};

export type RedisPubSub = {
    publish: (channel: string, message: string) => Promise<unknown>;
    duplicate: () => RedisSubscriber;
};

export const createRedisBus = (redis: RedisPubSub): EventBus => ({
    publish: async (channel, event) => {
        await redis.publish(channel, JSON.stringify(event));
    },

    subscribe: (channel, signal) => {
        const sub = redis.duplicate();
        const queue = createEventQueue(() => {
            void sub.unsubscribe(channel);
            void sub.quit();
        });
        sub.on("message", (incoming, message) => {
            if (incoming !== channel) return;
            let data: unknown;
            try {
                data = JSON.parse(message);
            } catch {
                return; // drop malformed payloads rather than break the stream
            }
            const parsed = SessionEvent.safeParse(data);
            if (parsed.success) queue.push(parsed.data);
        });
        void sub.subscribe(channel);
        signal?.addEventListener("abort", () => {
            queue.close();
        });
        return queue.iterable;
    },
});
