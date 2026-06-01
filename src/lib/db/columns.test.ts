// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { type Board, createBoard } from "@/lib/db/boards";
import type { Db } from "@/lib/db/client";
import {
    createColumn,
    deleteColumn,
    listColumnsByBoard,
    moveColumn,
    renameColumn,
} from "@/lib/db/columns";
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

const seed = (name: string, position: number) =>
    createColumn(db, { boardId: board.id, name, position });

describe("columns repo", () => {
    it("creates and lists columns left-to-right", async () => {
        await seed("Done", 3);
        await seed("Backlog", 1);
        await seed("In progress", 2);
        const all = await listColumnsByBoard(db, board.id);
        expect(all.map((c) => c.name)).toEqual([
            "Backlog",
            "In progress",
            "Done",
        ]);
    });

    it("scopes the list to one board", async () => {
        const other = must(
            await createBoard(db, {
                userId: "u1",
                name: "Other",
                position: 2,
                sidebarOrder: 2,
            }),
        );
        await seed("Mine", 1);
        await createColumn(db, {
            boardId: other.id,
            name: "Theirs",
            position: 1,
        });
        expect(await listColumnsByBoard(db, board.id)).toHaveLength(1);
    });

    it("renames, moves, and deletes a column", async () => {
        const col = must(await seed("Old", 1));
        expect((await renameColumn(db, col.id, "New"))?.name).toBe("New");
        expect((await moveColumn(db, col.id, 9))?.position).toBe(9);
        await deleteColumn(db, col.id);
        expect(await listColumnsByBoard(db, board.id)).toEqual([]);
    });
});
