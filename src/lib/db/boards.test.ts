// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import {
    createBoard,
    deleteBoard,
    listBoards,
    moveBoard,
    renameBoard,
} from "@/lib/db/boards";
import type { Db } from "@/lib/db/client";
import { must } from "@/test-utils/assert";
import { createTestDb } from "@/test-utils/db";

let db: Db;
beforeEach(async () => {
    db = await createTestDb();
});

const seed = (name: string, sidebarOrder: number) =>
    createBoard(db, {
        userId: "u1",
        name,
        position: sidebarOrder,
        sidebarOrder,
    });

describe("boards repo", () => {
    it("starts empty", async () => {
        expect(await listBoards(db)).toEqual([]);
    });

    it("creates a board with defaults and lists by sidebar order", async () => {
        await seed("Backend", 2);
        await seed("Side projects", 1);
        const all = await listBoards(db);
        expect(all.map((b) => b.name)).toEqual(["Side projects", "Backend"]);
        expect(all[0]?.version).toBe(0);
        expect(all[0]?.defaultConfig).toEqual({});
    });

    it("renames a board", async () => {
        const created = must(await seed("Old", 1));
        const renamed = await renameBoard(db, created.id, "New");
        expect(renamed?.name).toBe("New");
    });

    it("moves (reorders) a board in the sidebar", async () => {
        const created = must(await seed("B", 1));
        const moved = await moveBoard(db, created.id, 5);
        expect(moved?.sidebarOrder).toBe(5);
    });

    it("deletes a board", async () => {
        const created = must(await seed("Doomed", 1));
        await deleteBoard(db, created.id);
        expect(await listBoards(db)).toEqual([]);
    });
});
