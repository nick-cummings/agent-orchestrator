// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import {
    appendActivities,
    listActivities,
    listActivitiesSince,
    type NewActivity,
} from "@/lib/db/activities";
import { createBoard } from "@/lib/db/boards";
import { createCard } from "@/lib/db/cards";
import type { Db } from "@/lib/db/client";
import { createColumn } from "@/lib/db/columns";
import { createExecution } from "@/lib/db/executions";
import { getOrCreateSessionForCard } from "@/lib/db/sessions";
import { must } from "@/test-utils/assert";
import { createTestDb } from "@/test-utils/db";

let db: Db;
let executionId: string;

const activity = (cursor: string, kind = "progress"): NewActivity => ({
    at: "2026-06-01T00:00:00.000Z",
    source: "agent",
    kind,
    text: `at ${cursor}`,
    cursor,
});

beforeEach(async () => {
    db = await createTestDb();
    const board = must(
        await createBoard(db, {
            userId: "u1",
            name: "B",
            position: 1,
            sidebarOrder: 1,
        }),
    );
    const column = must(
        await createColumn(db, { boardId: board.id, name: "Col", position: 1 }),
    );
    const card = must(
        await createCard(db, { columnId: column.id, position: 1 }),
    );
    const sessionId = (await getOrCreateSessionForCard(db, card.id)).id;
    executionId = must(
        await createExecution(db, {
            sessionId,
            engine: "jules",
            externalRef: "j1",
            deepLinkUrl: "https://jules.google/sessions/j1",
            prompt: "p",
        }),
    ).id;
});

describe("activities repo", () => {
    it("returns nothing to append as an empty list", async () => {
        expect(await appendActivities(db, executionId, [])).toEqual([]);
    });

    it("assigns monotonic seq across multiple appends", async () => {
        const first = await appendActivities(db, executionId, [
            activity("c1"),
            activity("c2"),
        ]);
        expect(first.map((a) => a.seq)).toEqual([1, 2]);
        const second = await appendActivities(db, executionId, [
            activity("c3"),
        ]);
        expect(second[0].seq).toBe(3);

        const all = await listActivities(db, executionId);
        expect(all.map((a) => a.cursor)).toEqual(["c1", "c2", "c3"]);
    });

    it("lists only activities after a cursor seq", async () => {
        await appendActivities(db, executionId, [
            activity("c1"),
            activity("c2"),
            activity("c3"),
        ]);
        const tail = await listActivitiesSince(db, executionId, 1);
        expect(tail.map((a) => a.cursor)).toEqual(["c2", "c3"]);
    });
});
