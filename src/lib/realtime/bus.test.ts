import { describe, expect, it } from "vitest";

import { createInMemoryBus } from "./bus";
import type { SessionEvent } from "./events";

const evt = (executionId: string): SessionEvent => ({
    type: "state",
    executionId,
    state: "running",
});

const idOf = (r: IteratorResult<SessionEvent>): string =>
    r.done ? "<done>" : r.value.executionId;

describe("in-memory event bus", () => {
    it("delivers events published after subscription, in order", async () => {
        const bus = createInMemoryBus();
        const iter = bus.subscribe("s1")[Symbol.asyncIterator]();
        await bus.publish("s1", evt("e1"));
        await bus.publish("s1", evt("e2"));
        expect(idOf(await iter.next())).toBe("e1");
        expect(idOf(await iter.next())).toBe("e2");
    });

    it("does not replay events published before subscription", async () => {
        const bus = createInMemoryBus();
        await bus.publish("s1", evt("early"));
        const iter = bus.subscribe("s1")[Symbol.asyncIterator]();
        await bus.publish("s1", evt("late"));
        expect(idOf(await iter.next())).toBe("late");
    });

    it("isolates channels", async () => {
        const bus = createInMemoryBus();
        const iter = bus.subscribe("s1")[Symbol.asyncIterator]();
        await bus.publish("s2", evt("other"));
        await bus.publish("s1", evt("mine"));
        expect(idOf(await iter.next())).toBe("mine");
    });

    it("ends the stream when the signal aborts", async () => {
        const bus = createInMemoryBus();
        const controller = new AbortController();
        const iter = bus
            .subscribe("s1", controller.signal)
            [Symbol.asyncIterator]();
        controller.abort();
        expect((await iter.next()).done).toBe(true);
    });

    it("resolves a waiting next() when an event later arrives", async () => {
        const bus = createInMemoryBus();
        const iter = bus.subscribe("s1")[Symbol.asyncIterator]();
        const waiting = iter.next(); // no event queued yet → pending
        await bus.publish("s1", evt("live"));
        expect(idOf(await waiting)).toBe("live");
    });

    it("resolves a waiting next() as done when aborted mid-wait", async () => {
        const bus = createInMemoryBus();
        const controller = new AbortController();
        const iter = bus
            .subscribe("s1", controller.signal)
            [Symbol.asyncIterator]();
        const waiting = iter.next(); // pending
        controller.abort();
        expect((await waiting).done).toBe(true);
    });

    it("stops delivering after return()", async () => {
        const bus = createInMemoryBus();
        const iterable = bus.subscribe("s1");
        const iter = iterable[Symbol.asyncIterator]();
        await iter.return?.();
        await bus.publish("s1", evt("ignored"));
        expect((await iter.next()).done).toBe(true);
    });
});
