// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { createBoard } from "@/lib/db/boards";
import { createCard } from "@/lib/db/cards";
import type { Db } from "@/lib/db/client";
import { createColumn } from "@/lib/db/columns";
import {
    clearPendingApproval,
    getOrCreateSessionForCard,
    getSessionByCard,
    getSessionById,
    setPendingApproval,
} from "@/lib/db/sessions";
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
        await createColumn(db, { boardId: board.id, name: "Col", position: 1 }),
    );
    const card = must(
        await createCard(db, { columnId: column.id, position: 1 }),
    );
    cardId = card.id;
});

describe("sessions repo", () => {
    it("returns undefined when a card has no session", async () => {
        expect(await getSessionByCard(db, cardId)).toBeUndefined();
    });

    it("creates a session on first use with default routing", async () => {
        const session = await getOrCreateSessionForCard(db, cardId);
        expect(session.cardId).toBe(cardId);
        expect(session.brainProvider).toBe("claude");
        expect(session.executorEngine).toBe("jules");
        expect(session.requirePlanApproval).toBe(true);
    });

    it("is idempotent — one session per card", async () => {
        const first = await getOrCreateSessionForCard(db, cardId);
        const second = await getOrCreateSessionForCard(db, cardId);
        expect(second.id).toBe(first.id);
    });

    it("parks and clears a pending approval", async () => {
        const { id } = await getOrCreateSessionForCard(db, cardId);
        await setPendingApproval(db, id, {
            toolCallId: "t1",
            name: "start_coding_task",
            input: { repo: "o/r" },
            category: "branch_write",
        });
        expect(
            must(await getSessionById(db, id)).pendingApproval,
        ).toMatchObject({
            toolCallId: "t1",
            name: "start_coding_task",
        });

        await clearPendingApproval(db, id);
        expect(must(await getSessionById(db, id)).pendingApproval).toBeNull();
    });
});
