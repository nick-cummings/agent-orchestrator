// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { createBoard } from "@/lib/db/boards";
import { createCard } from "@/lib/db/cards";
import type { Db } from "@/lib/db/client";
import { createColumn } from "@/lib/db/columns";
import { appendMessage, listMessages } from "@/lib/db/messages";
import { getOrCreateSessionForCard } from "@/lib/db/sessions";
import { must } from "@/test-utils/assert";
import { createTestDb } from "@/test-utils/db";

let db: Db;
let sessionId: string;

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
    const card = must(
        await createCard(db, { columnId: column.id, position: 1 }),
    );
    sessionId = (await getOrCreateSessionForCard(db, card.id)).id;
});

describe("messages repo", () => {
    it("appends with monotonic seq and lists in order", async () => {
        const first = await appendMessage(db, sessionId, {
            role: "user",
            contentBlocks: [{ type: "text", text: "start a task" }],
        });
        const second = await appendMessage(db, sessionId, {
            role: "assistant",
            contentBlocks: [
                { type: "text", text: "on it" },
                {
                    type: "tool_call",
                    id: "c1",
                    name: "start_coding_task",
                    input: {},
                },
            ],
        });
        expect([first.seq, second.seq]).toEqual([1, 2]);

        const all = await listMessages(db, sessionId);
        expect(all.map((m) => m.role)).toEqual(["user", "assistant"]);
        expect(all[1].contentBlocks).toHaveLength(2);
    });
});
