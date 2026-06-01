import { describe, expect, it } from "vitest";

import type { BoardView } from "@/lib/db/boardView";
import { planCardMove, resolveDragMove } from "@/lib/kanban/move";

const card = (id: string, position: number) =>
    ({
        id,
        columnId: "",
        title: id,
        position,
    }) as BoardView["columns"][number]["cards"][number];

const view = (): BoardView => ({
    board: {} as BoardView["board"],
    columns: [
        {
            id: "todo",
            cards: [card("a", 1000), card("b", 2000), card("c", 3000)],
        } as BoardView["columns"][number],
        {
            id: "done",
            cards: [card("x", 1000)],
        } as BoardView["columns"][number],
    ],
});

describe("planCardMove", () => {
    it("returns null when dropped on itself", () => {
        expect(planCardMove(view(), "a", "a")).toBeNull();
    });

    it("returns null for an unknown active card", () => {
        expect(planCardMove(view(), "ghost", "b")).toBeNull();
    });

    it("returns null when the target resolves to nothing", () => {
        expect(planCardMove(view(), "a", "nowhere")).toBeNull();
    });

    it("reorders within a column, dropping before the target card", () => {
        // Move "a" onto "c": others are [b(2000), c(3000)], insert before c → between b and c.
        const move = planCardMove(view(), "a", "c");
        expect(move).toEqual({ columnId: "todo", position: 2500 });
    });

    it("moves across columns onto a card", () => {
        // Move "a" onto "x" in done: others=[x(1000)], index 0 → before x.
        const move = planCardMove(view(), "a", "x");
        expect(move?.columnId).toBe("done");
        expect(move?.position).toBeLessThan(1000);
    });

    it("moves onto an empty/other column id → appended to the end", () => {
        const move = planCardMove(view(), "a", "done");
        expect(move?.columnId).toBe("done");
        expect(move?.position).toBeGreaterThan(1000);
    });

    it("appends to its own column when dropped on the column id", () => {
        const move = planCardMove(view(), "a", "todo");
        // others = [b,c] → append one STEP past 3000.
        expect(move).toEqual({ columnId: "todo", position: 4024 });
    });
});

describe("resolveDragMove", () => {
    it("returns null when the board hasn't loaded", () => {
        expect(resolveDragMove(undefined, "a", "b")).toBeNull();
    });

    it("returns null when nothing is hovered", () => {
        expect(resolveDragMove(view(), "a", null)).toBeNull();
    });

    it("returns null for a no-op drop", () => {
        expect(resolveDragMove(view(), "a", "a")).toBeNull();
    });

    it("resolves a real drag to the moved card and its target", () => {
        const result = resolveDragMove(view(), "a", "done");
        expect(result?.cardId).toBe("a");
        expect(result?.move.columnId).toBe("done");
    });
});
