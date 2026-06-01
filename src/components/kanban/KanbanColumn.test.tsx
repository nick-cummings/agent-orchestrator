import { DndContext } from "@dnd-kit/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ColumnWithCards } from "@/lib/db/boardView";

import { KanbanColumn } from "./KanbanColumn";

const card = (id: string, title: string) =>
    ({
        id,
        columnId: "col",
        title,
        position: 1,
    }) as ColumnWithCards["cards"][number];

const column: ColumnWithCards = {
    id: "col",
    boardId: "b",
    name: "Todo",
    position: 1,
    cards: [card("c1", "First"), card("c2", "Second")],
};

const handlers = {
    onRenameColumn: vi.fn(),
    onDeleteColumn: vi.fn(),
    onAddCard: vi.fn(),
    onRenameCard: vi.fn(),
    onDeleteCard: vi.fn(),
};

const renderColumn = () =>
    render(
        <DndContext>
            <KanbanColumn column={column} {...handlers} />
        </DndContext>,
    );

beforeEach(() => {
    vi.clearAllMocks();
});

describe("KanbanColumn", () => {
    it("renders the column name, count, and its cards", () => {
        renderColumn();
        expect(screen.getByText("Todo")).toBeInTheDocument();
        expect(screen.getByText("2")).toBeInTheDocument();
        expect(screen.getByText("First")).toBeInTheDocument();
        expect(screen.getByText("Second")).toBeInTheDocument();
    });

    it("renames the column on double-click + Enter", async () => {
        renderColumn();
        await userEvent.dblClick(screen.getByText("Todo"));
        const input = screen.getByLabelText("Column name");
        await userEvent.clear(input);
        await userEvent.type(input, "In progress{Enter}");
        expect(handlers.onRenameColumn).toHaveBeenCalledWith(
            "col",
            "In progress",
        );
    });

    it("deletes the column", async () => {
        renderColumn();
        await userEvent.click(screen.getByLabelText("Delete column Todo"));
        expect(handlers.onDeleteColumn).toHaveBeenCalledWith("col");
    });

    it("adds a card through the inline form", async () => {
        renderColumn();
        await userEvent.click(screen.getByText("+ Add card"));
        await userEvent.type(
            screen.getByLabelText("Card title"),
            "Third{Enter}",
        );
        expect(handlers.onAddCard).toHaveBeenCalledWith("col", "Third");
    });

    it("renames a card on double-click + Enter", async () => {
        renderColumn();
        await userEvent.dblClick(screen.getByText("First"));
        const input = screen.getByLabelText("Card title");
        await userEvent.clear(input);
        await userEvent.type(input, "Renamed{Enter}");
        expect(handlers.onRenameCard).toHaveBeenCalledWith("c1", "Renamed");
    });

    it("deletes a card", async () => {
        renderColumn();
        await userEvent.click(screen.getByLabelText("Delete First"));
        expect(handlers.onDeleteCard).toHaveBeenCalledWith("c1");
    });
});
