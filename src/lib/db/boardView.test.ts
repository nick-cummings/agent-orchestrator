// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { type Board, createBoard } from "@/lib/db/boards";
import { getBoardView } from "@/lib/db/boardView";
import { archiveCard, createCard } from "@/lib/db/cards";
import type { Db } from "@/lib/db/client";
import { createColumn } from "@/lib/db/columns";
import { must } from "@/test-utils/assert";
import { createTestDb } from "@/test-utils/db";

let db: Db;
let board: Board;

beforeEach(async () => {
    db = await createTestDb();
    board = must(
        await createBoard(db, {
            userId: "u1",
            name: "Board",
            position: 1,
            sidebarOrder: 1,
        }),
    );
});

describe("getBoardView", () => {
    it("returns undefined for an unknown board", async () => {
        expect(await getBoardView(db, "nope")).toBeUndefined();
    });

    it("returns a board with no columns", async () => {
        const view = must(await getBoardView(db, board.id));
        expect(view.board.id).toBe(board.id);
        expect(view.columns).toEqual([]);
    });

    it("nests columns (by position) and their non-archived cards (by position)", async () => {
        const todo = must(
            await createColumn(db, {
                boardId: board.id,
                name: "Todo",
                position: 1,
            }),
        );
        const done = must(
            await createColumn(db, {
                boardId: board.id,
                name: "Done",
                position: 2,
            }),
        );
        await createCard(db, { columnId: todo.id, title: "B", position: 2 });
        await createCard(db, { columnId: todo.id, title: "A", position: 1 });
        const archived = must(
            await createCard(db, {
                columnId: done.id,
                title: "gone",
                position: 1,
            }),
        );
        await archiveCard(db, archived.id, "2026-06-01T00:00:00.000Z");

        const view = must(await getBoardView(db, board.id));
        expect(view.columns.map((c) => c.name)).toEqual(["Todo", "Done"]);
        expect(view.columns[0].cards.map((c) => c.title)).toEqual(["A", "B"]);
        expect(view.columns[1].cards).toEqual([]);
    });
});
