import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    createBoard,
    createCard,
    createColumn,
    deleteCard,
    deleteColumn,
    fetchBoardView,
    fetchBoards,
    moveCard,
    updateCard,
    updateColumn,
} from "@/lib/api/client";

const fetchMock = vi.fn();

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

const okJson = (data: unknown): Response =>
    new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-type": "application/json" },
    });

describe("api client", () => {
    it("GETs a board view from the right URL", async () => {
        fetchMock.mockResolvedValue(
            okJson({ board: { id: "b1" }, columns: [] }),
        );
        const view = await fetchBoardView("b1");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/boards/b1",
            expect.objectContaining({ method: "GET" }),
        );
        expect(view.board.id).toBe("b1");
    });

    it("POSTs a JSON body with a content-type header", async () => {
        fetchMock.mockResolvedValue(okJson({ id: "b2", name: "New" }));
        await createBoard({ name: "New" });
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(init.method).toBe("POST");
        expect(init.headers).toEqual({ "content-type": "application/json" });
        expect(init.body).toBe(JSON.stringify({ name: "New" }));
    });

    it("moves a card to the per-card move endpoint", async () => {
        fetchMock.mockResolvedValue(okJson({ id: "c1" }));
        await moveCard("c1", { columnId: "col2", position: 1500 });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/cards/c1/move",
            expect.objectContaining({ method: "POST" }),
        );
    });

    it("sends no body or content-type on a DELETE", async () => {
        fetchMock.mockResolvedValue(okJson(null));
        await deleteCard("c1");
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(init.method).toBe("DELETE");
        expect(init.body).toBeUndefined();
        expect(init.headers).toBeUndefined();
    });

    it("creates and updates cards", async () => {
        fetchMock.mockImplementation(() =>
            Promise.resolve(okJson({ id: "c9" })),
        );
        await createCard({ columnId: "col1", title: "t" });
        await updateCard("c9", { title: "renamed" });
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            "/api/cards",
            expect.objectContaining({ method: "POST" }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "/api/cards/c9",
            expect.objectContaining({ method: "PATCH" }),
        );
    });

    it("covers the column endpoints", async () => {
        fetchMock.mockImplementation(() => Promise.resolve(okJson([])));
        await fetchBoards();
        await createColumn({ boardId: "b1", name: "Todo" });
        await updateColumn("col1", { name: "WIP" });
        await deleteColumn("col1");
        expect(fetchMock.mock.calls.map((c) => c[0] as string)).toEqual([
            "/api/boards",
            "/api/columns",
            "/api/columns/col1",
            "/api/columns/col1",
        ]);
    });

    it("throws the server error message on a non-2xx", async () => {
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ error: "nope" }), { status: 400 }),
        );
        await expect(createBoard({ name: "" })).rejects.toThrow("nope");
    });

    it("throws a status fallback when the error body is unreadable", async () => {
        fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
        await expect(fetchBoardView("x")).rejects.toThrow("500");
    });
});
