import { describe, expect, it, vi } from "vitest";

import type { RedisPubSub } from "./redisBus";
import { getBus, selectBus } from "./index";

describe("selectBus", () => {
    it("uses the in-memory bus when no REDIS_URL is set", () => {
        const makeRedis = vi.fn();
        const bus = selectBus(undefined, makeRedis as never);
        expect(typeof bus.subscribe).toBe("function");
        expect(makeRedis).not.toHaveBeenCalled();
    });

    it("builds a Redis bus from the URL when set", async () => {
        const redis: RedisPubSub = {
            publish: vi.fn().mockResolvedValue(1),
            duplicate: vi.fn(),
        };
        const makeRedis = vi.fn(() => redis);
        const bus = selectBus("redis://localhost:6379", makeRedis);
        expect(makeRedis).toHaveBeenCalledWith("redis://localhost:6379");
        await bus.publish("s1", {
            type: "state",
            executionId: "e",
            state: "running",
        });
        expect(redis.publish).toHaveBeenCalled();
    });
});

describe("getBus", () => {
    it("memoizes one bus per process", () => {
        expect(getBus()).toBe(getBus());
    });
});
