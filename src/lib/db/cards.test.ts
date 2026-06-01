// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { createBoard } from "@/lib/db/boards";
import {
    archiveCard,
    createCard,
    deleteCard,
    listCardsByColumn,
    moveCard,
    updateCard,
} from "@/lib/db/cards";
import type { Db } from "@/lib/db/client";
import { type Column, createColumn } from "@/lib/db/columns";
import { must } from "@/test-utils/assert";
import { createTestDb } from "@/test-utils/db";

let db: Db;
let column: Column;
let otherColumn: Column;

beforeEach(async () => {
    db = await createTestDb();
    const board = must(
        await createBoard(db, {
            userId: "u1",
            name: "Board",
            position: 1,
            sidebarOrder: 1,
        }),
    );
    column = must(
        await createColumn(db, {
            boardId: board.id,
            name: "Backlog",
            position: 1,
        }),
    );
    otherColumn = must(
        await createColumn(db, {
            boardId: board.id,
            name: "Done",
            position: 2,
        }),
    );
});

describe("cards repo", () => {
    it("uses a renamable placeholder title when none is given", async () => {
        const card = must(
            await createCard(db, { columnId: column.id, position: 1 }),
        );
        expect(card.title).toBe("New task");
        expect(card.titleSetByUser).toBe(false);
        expect(card.status).toBe("idle");
    });

    it("keeps an explicit opening title", async () => {
        const card = must(
            await createCard(db, {
                columnId: column.id,
                title: "  Fix poller  ",
                position: 1,
            }),
        );
        expect(card.title).toBe("Fix poller");
        expect(card.titleSetByUser).toBe(false);
    });

    it("lists non-archived cards by position", async () => {
        await createCard(db, { columnId: column.id, title: "B", position: 2 });
        await createCard(db, { columnId: column.id, title: "A", position: 1 });
        const all = await listCardsByColumn(db, column.id);
        expect(all.map((c) => c.title)).toEqual(["A", "B"]);
    });

    it("marks the title user-set on rename and updates the description", async () => {
        const card = must(
            await createCard(db, { columnId: column.id, position: 1 }),
        );
        const renamed = await updateCard(db, card.id, { title: "Real title" });
        expect(renamed?.title).toBe("Real title");
        expect(renamed?.titleSetByUser).toBe(true);

        const described = await updateCard(db, card.id, {
            description: "notes",
        });
        expect(described?.description).toBe("notes");
    });

    it("moves a card to another column", async () => {
        const card = must(
            await createCard(db, { columnId: column.id, position: 1 }),
        );
        const moved = await moveCard(db, card.id, otherColumn.id, 1);
        expect(moved?.columnId).toBe(otherColumn.id);
        expect(await listCardsByColumn(db, column.id)).toEqual([]);
    });

    it("archives a card so it drops out of the list, then deletes it", async () => {
        const card = must(
            await createCard(db, { columnId: column.id, position: 1 }),
        );
        await archiveCard(db, card.id, "2026-06-01T12:00:00.000Z");
        expect(await listCardsByColumn(db, column.id)).toEqual([]);
        await deleteCard(db, card.id);
    });
});
