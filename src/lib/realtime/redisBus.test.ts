import { describe, expect, it, vi } from "vitest";

import { createRedisBus, type RedisPubSub } from "./redisBus";
import type { SessionEvent } from "./events";

/** A fake ioredis: capture publishes, and let tests emit messages to the
 *  duplicated subscriber. */
const makeFakeRedis = () => {
    let handler: ((channel: string, message: string) => void) | undefined;
    const sub = {
        subscribe: vi.fn().mockResolvedValue(undefined),
        on: vi.fn((_event: "message", cb: typeof handler) => {
            handler = cb;
        }),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
        quit: vi.fn().mockResolvedValue(undefined),
    };
    const redis: RedisPubSub = {
        publish: vi.fn().mockResolvedValue(1),
        duplicate: () => sub,
    };
    return {
        redis,
        sub,
        emit: (ch: string, msg: string) => handler?.(ch, msg),
    };
};

const evt: SessionEvent = {
    type: "state",
    executionId: "e1",
    state: "running",
};

describe("createRedisBus", () => {
    it("publishes events as JSON to the channel", async () => {
        const { redis } = makeFakeRedis();
        await createRedisBus(redis).publish("s1", evt);
        expect(redis.publish).toHaveBeenCalledWith("s1", JSON.stringify(evt));
    });

    it("subscribes on a duplicated connection and yields parsed events", async () => {
        const fake = makeFakeRedis();
        const iter = createRedisBus(fake.redis)
            .subscribe("s1")
            [Symbol.asyncIterator]();
        expect(fake.sub.subscribe).toHaveBeenCalledWith("s1");

        fake.emit("s1", JSON.stringify(evt));
        const r = await iter.next();
        expect(r.value).toMatchObject({ type: "state", executionId: "e1" });
    });

    it("ignores messages for other channels and malformed payloads", async () => {
        const fake = makeFakeRedis();
        const iter = createRedisBus(fake.redis)
            .subscribe("s1")
            [Symbol.asyncIterator]();
        fake.emit("s2", JSON.stringify(evt)); // wrong channel
        fake.emit("s1", "{not json"); // malformed → dropped
        fake.emit("s1", JSON.stringify(evt)); // valid
        const r = await iter.next();
        expect(r.value).toMatchObject({ executionId: "e1" });
    });

    it("tears down the connection on abort", () => {
        const fake = makeFakeRedis();
        const controller = new AbortController();
        createRedisBus(fake.redis).subscribe("s1", controller.signal);
        controller.abort();
        expect(fake.sub.unsubscribe).toHaveBeenCalledWith("s1");
        expect(fake.sub.quit).toHaveBeenCalled();
    });
});
