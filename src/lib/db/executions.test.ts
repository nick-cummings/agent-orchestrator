// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { createBoard } from "@/lib/db/boards";
import { createCard } from "@/lib/db/cards";
import type { Db } from "@/lib/db/client";
import { createColumn } from "@/lib/db/columns";
import {
    createExecution,
    getExecution,
    listActiveExecutions,
    listExecutionsBySession,
    updateExecution,
} from "@/lib/db/executions";
import { getOrCreateSessionForCard } from "@/lib/db/sessions";
import { must } from "@/test-utils/assert";
import { createTestDb } from "@/test-utils/db";

let db: Db;
let sessionId: string;

const seedExecution = (ref: string, state?: string) =>
    createExecution(db, {
        sessionId,
        engine: "jules",
        externalRef: ref,
        deepLinkUrl: `https://jules.google/sessions/${ref}`,
        prompt: "do the thing",
        state,
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
    sessionId = (await getOrCreateSessionForCard(db, card.id)).id;
});

describe("executions repo", () => {
    it("creates with a default starting state and reads back", async () => {
        const created = must(await seedExecution("jules-1"));
        expect(created.state).toBe("starting");
        expect(created.externalRef).toBe("jules-1");
        const fetched = must(await getExecution(db, created.id));
        expect(fetched.id).toBe(created.id);
    });

    it("lists executions by session in creation order", async () => {
        await seedExecution("a");
        await seedExecution("b");
        const all = await listExecutionsBySession(db, sessionId);
        expect(all.map((e) => e.externalRef)).toEqual(["a", "b"]);
    });

    it("lists only non-terminal executions as active", async () => {
        await seedExecution("running", "running");
        await seedExecution("done", "succeeded");
        const active = await listActiveExecutions(db);
        expect(active.map((e) => e.externalRef)).toEqual(["running"]);
    });

    it("patches state, cursor, and result", async () => {
        const created = must(await seedExecution("e1"));
        const updated = must(
            await updateExecution(db, created.id, {
                state: "succeeded",
                lastActivityCursor: "c-9",
                resultPrUrl: "https://github.com/o/r/pull/1",
            }),
        );
        expect(updated.state).toBe("succeeded");
        expect(updated.lastActivityCursor).toBe("c-9");
        expect(updated.resultPrUrl).toBe("https://github.com/o/r/pull/1");
        expect(await listActiveExecutions(db)).toEqual([]);
    });
});
