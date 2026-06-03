// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NormalizedActivity } from "@/lib/core/schemas";
import { listActivities } from "@/lib/db/activities";
import { createBoard } from "@/lib/db/boards";
import { createCard, listCardsByColumn } from "@/lib/db/cards";
import type { Db } from "@/lib/db/client";
import { createColumn } from "@/lib/db/columns";
import {
    createExecution,
    type Execution,
    getExecution,
    listActiveExecutions,
} from "@/lib/db/executions";
import { getOrCreateSessionForCard } from "@/lib/db/sessions";
import {
    advanceExecution,
    pollActiveExecutions,
    type PollerDeps,
} from "@/lib/poller/advance";
import { createInMemoryBus } from "@/lib/realtime/bus";
import type { SessionEvent } from "@/lib/realtime/events";
import { must } from "@/test-utils/assert";
import { createTestDb } from "@/test-utils/db";

let db: Db;
let columnId: string;
let sessionId: string;
let execution: Execution;

const listActivitiesMock = vi.fn();
const getStatusMock = vi.fn();
const getResultMock = vi.fn();
const bus = createInMemoryBus();

const deps = (): PollerDeps => ({
    db,
    engine: {
        listActivities: listActivitiesMock,
        getStatus: getStatusMock,
        getResult: getResultMock,
    },
    bus,
});

const norm = (cursor: string, kind = "progress"): NormalizedActivity => ({
    at: "2026-06-01T00:00:00Z",
    source: "agent",
    kind: kind as NormalizedActivity["kind"],
    text: cursor,
    cursor,
});

const drain = async (channel: string, n: number): Promise<SessionEvent[]> => {
    const iter = bus.subscribe(channel)[Symbol.asyncIterator]();
    const out: SessionEvent[] = [];
    for (let i = 0; i < n; i++) {
        const r = await iter.next();
        if (r.done) break;
        out.push(r.value);
    }
    await iter.return?.();
    return out;
};

beforeEach(async () => {
    vi.clearAllMocks();
    db = await createTestDb();
    const board = must(
        await createBoard(db, {
            userId: "u1",
            name: "B",
            position: 1,
            sidebarOrder: 1,
        }),
    );
    columnId = must(
        await createColumn(db, { boardId: board.id, name: "Col", position: 1 }),
    ).id;
    const card = must(await createCard(db, { columnId, position: 1 }));
    sessionId = (await getOrCreateSessionForCard(db, card.id)).id;
    execution = must(
        await createExecution(db, {
            sessionId,
            engine: "jules",
            externalRef: "jules-1",
            deepLinkUrl: "https://jules.google/sessions/jules-1",
            prompt: "do it",
        }),
    );
});

const cardStatus = async (): Promise<string> =>
    (await listCardsByColumn(db, columnId))[0].status;

describe("advanceExecution", () => {
    it("persists new activities, advances the cursor, and publishes them", async () => {
        listActivitiesMock.mockResolvedValue([
            norm("c1"),
            norm("c2", "message"),
        ]);
        getStatusMock.mockResolvedValue({ state: "running", updatedAt: "t" });

        // Subscribe before advancing; expect 2 activity + 1 state event.
        const events = drain(sessionId, 3);
        const result = await advanceExecution(deps(), execution);

        expect(result).toEqual({ newActivities: 2, state: "running" });
        const stored = await listActivities(db, execution.id);
        expect(stored.map((a) => a.seq)).toEqual([1, 2]);
        expect(
            must(await getExecution(db, execution.id)).lastActivityCursor,
        ).toBe("c2");
        expect(await cardStatus()).toBe("running");

        const published = await events;
        expect(published.map((e) => e.type)).toEqual([
            "activity",
            "activity",
            "state",
        ]);
    });

    it("does nothing when there is no new activity and no state change", async () => {
        listActivitiesMock.mockResolvedValue([]);
        getStatusMock.mockResolvedValue({ state: "starting", updatedAt: "t" });
        const result = await advanceExecution(deps(), execution);
        expect(result).toEqual({ newActivities: 0, state: "starting" });
        expect(await listActivities(db, execution.id)).toEqual([]);
        expect(getResultMock).not.toHaveBeenCalled();
    });

    it("records the PR and flips the card to pr_ready on success", async () => {
        listActivitiesMock.mockResolvedValue([]);
        getStatusMock.mockResolvedValue({ state: "succeeded", updatedAt: "t" });
        getResultMock.mockResolvedValue({
            prUrl: "https://github.com/o/r/pull/1",
        });

        const events = drain(sessionId, 1);
        await advanceExecution(deps(), execution);

        const updated = must(await getExecution(db, execution.id));
        expect(updated.state).toBe("succeeded");
        expect(updated.resultPrUrl).toBe("https://github.com/o/r/pull/1");
        expect(await cardStatus()).toBe("pr_ready");
        expect(await listActiveExecutions(db)).toEqual([]);

        const [stateEvent] = await events;
        expect(stateEvent).toMatchObject({
            type: "state",
            state: "succeeded",
            resultPrUrl: "https://github.com/o/r/pull/1",
        });
    });
});

describe("pollActiveExecutions", () => {
    it("advances every active execution", async () => {
        await createExecution(db, {
            sessionId,
            engine: "jules",
            externalRef: "jules-2",
            deepLinkUrl: "https://jules.google/sessions/jules-2",
            prompt: "another",
        });
        listActivitiesMock.mockResolvedValue([]);
        getStatusMock.mockResolvedValue({ state: "running", updatedAt: "t" });

        const results = await pollActiveExecutions(deps());
        expect(results).toHaveLength(2);
        expect(results.every((r) => r.state === "running")).toBe(true);
    });
});
