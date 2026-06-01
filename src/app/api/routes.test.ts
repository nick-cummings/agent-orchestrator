// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db/client";
import type { BoardView } from "@/lib/db/boardView";
import { createTestDb } from "@/test-utils/db";

// Swap the runtime Postgres handle for a fresh PGlite db per test.
const holder = vi.hoisted(() => ({ db: undefined as Db | undefined }));
vi.mock("@/lib/db/client", () => ({ getDb: () => holder.db }));

import * as boards from "@/app/api/boards/route";
import * as board from "@/app/api/boards/[boardId]/route";
import * as cards from "@/app/api/cards/route";
import * as card from "@/app/api/cards/[cardId]/route";
import * as cardMove from "@/app/api/cards/[cardId]/move/route";
import * as columns from "@/app/api/columns/route";
import * as column from "@/app/api/columns/[columnId]/route";

const post = (body: unknown): Request =>
    new Request("http://test", { method: "POST", body: JSON.stringify(body) });
const patch = (body: unknown): Request =>
    new Request("http://test", { method: "PATCH", body: JSON.stringify(body) });
const ctx = <T extends object>(params: T) => ({
    params: Promise.resolve(params),
});

beforeEach(async () => {
    holder.db = await createTestDb();
});

const seedBoard = async (name = "Board"): Promise<string> => {
    const res = await boards.POST(post({ name }));
    return ((await res.json()) as { id: string }).id;
};

describe("boards routes", () => {
    it("creates, lists, and fetches an empty board view", async () => {
        const id = await seedBoard("My board");
        expect((await boards.POST(post({ name: "x" }))).status).toBe(201);

        const list = (await (await boards.GET()).json()) as { id: string }[];
        expect(list).toHaveLength(2);

        const view = (await (
            await board.GET(new Request("http://test"), ctx({ boardId: id }))
        ).json()) as BoardView;
        expect(view.board.name).toBe("My board");
        expect(view.columns).toEqual([]);
    });

    it("rejects a blank board name with a 400", async () => {
        expect((await boards.POST(post({ name: "" }))).status).toBe(400);
    });

    it("404s an unknown board view", async () => {
        const res = await board.GET(
            new Request("http://test"),
            ctx({ boardId: "missing" }),
        );
        expect(res.status).toBe(404);
    });

    it("renames a board", async () => {
        const id = await seedBoard();
        const res = await board.PATCH(
            patch({ name: "Renamed" }),
            ctx({ boardId: id }),
        );
        expect(((await res.json()) as { name: string }).name).toBe("Renamed");
    });
});

describe("kanban flow through the routes", () => {
    it("creates a column and card, then moves the card across columns", async () => {
        const boardId = await seedBoard();
        const todo = (await (
            await columns.POST(post({ boardId, name: "Todo" }))
        ).json()) as { id: string };
        const done = (await (
            await columns.POST(post({ boardId, name: "Done" }))
        ).json()) as { id: string };

        const created = (await (
            await cards.POST(post({ columnId: todo.id, title: "Task" }))
        ).json()) as { id: string };

        const moved = await cardMove.POST(
            post({ columnId: done.id, position: 1024 }),
            ctx({ cardId: created.id }),
        );
        expect(((await moved.json()) as { columnId: string }).columnId).toBe(
            done.id,
        );

        const view = (await (
            await board.GET(new Request("http://test"), ctx({ boardId }))
        ).json()) as BoardView;
        expect(view.columns[0].cards).toEqual([]);
        expect(view.columns[1].cards[0].title).toBe("Task");
    });

    it("renames a card, renames and deletes a column", async () => {
        const boardId = await seedBoard();
        const col = (await (
            await columns.POST(post({ boardId, name: "Todo" }))
        ).json()) as { id: string };
        const c = (await (
            await cards.POST(post({ columnId: col.id }))
        ).json()) as { id: string };

        const renamed = await card.PATCH(
            patch({ title: "Named" }),
            ctx({ cardId: c.id }),
        );
        expect(((await renamed.json()) as { title: string }).title).toBe(
            "Named",
        );

        await column.PATCH(patch({ name: "WIP" }), ctx({ columnId: col.id }));
        const del = await column.DELETE(
            new Request("http://test"),
            ctx({ columnId: col.id }),
        );
        expect(del.status).toBe(200);

        const view = (await (
            await board.GET(new Request("http://test"), ctx({ boardId }))
        ).json()) as BoardView;
        expect(view.columns).toEqual([]);
    });

    it("404s a move of an unknown card and rejects a bad move body", async () => {
        const missing = await cardMove.POST(
            post({ columnId: "c", position: 1 }),
            ctx({ cardId: "nope" }),
        );
        expect(missing.status).toBe(404);

        const bad = await cardMove.POST(
            post({ columnId: "c" }),
            ctx({ cardId: "x" }),
        );
        expect(bad.status).toBe(400);
    });
});
