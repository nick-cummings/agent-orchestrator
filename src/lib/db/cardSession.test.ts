// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { appendActivities } from "@/lib/db/activities";
import { createBoard } from "@/lib/db/boards";
import { getCardSession } from "@/lib/db/cardSession";
import { createCard } from "@/lib/db/cards";
import type { Db } from "@/lib/db/client";
import { createColumn } from "@/lib/db/columns";
import { createExecution } from "@/lib/db/executions";
import { getOrCreateSessionForCard } from "@/lib/db/sessions";
import { must } from "@/test-utils/assert";
import { createTestDb } from "@/test-utils/db";

let db: Db;
let cardId: string;

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
        await createColumn(db, { boardId: board.id, name: "C", position: 1 }),
    );
    cardId = must(
        await createCard(db, { columnId: column.id, position: 1 }),
    ).id;
});

describe("getCardSession", () => {
    it("returns a null session before the first task", async () => {
        expect(await getCardSession(db, cardId)).toEqual({
            session: null,
            executions: [],
        });
    });

    it("nests executions with their activity feeds", async () => {
        const session = await getOrCreateSessionForCard(db, cardId);
        const execution = must(
            await createExecution(db, {
                sessionId: session.id,
                engine: "jules",
                externalRef: "j1",
                deepLinkUrl: "https://jules.google/sessions/j1",
                prompt: "p",
            }),
        );
        await appendActivities(db, execution.id, [
            {
                at: "2026-06-01T00:00:00Z",
                source: "agent",
                kind: "plan",
                cursor: "c1",
            },
        ]);

        const view = await getCardSession(db, cardId);
        expect(view.session?.id).toBe(session.id);
        expect(view.executions).toHaveLength(1);
        expect(view.executions[0].activities.map((a) => a.cursor)).toEqual([
            "c1",
        ]);
    });
});
