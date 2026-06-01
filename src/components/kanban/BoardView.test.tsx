import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BoardView as BoardViewData } from "@/lib/db/boardView";
import { renderWithClient } from "@/test-utils/query";

import { BoardView } from "./BoardView";

vi.mock("@/lib/api/client");
import * as api from "@/lib/api/client";
const mocked = vi.mocked(api);

const view: BoardViewData = {
    board: { id: "b1", name: "My Board" } as BoardViewData["board"],
    columns: [
        {
            id: "todo",
            boardId: "b1",
            name: "Todo",
            position: 1,
            cards: [
                {
                    id: "c1",
                    columnId: "todo",
                    title: "First",
                    position: 1,
                } as BoardViewData["columns"][number]["cards"][number],
            ],
        },
    ],
};

beforeEach(() => {
    vi.clearAllMocks();
    mocked.fetchBoardView.mockResolvedValue(view);
    mocked.createColumn.mockResolvedValue({} as never);
    mocked.updateColumn.mockResolvedValue({} as never);
    mocked.deleteColumn.mockResolvedValue();
    mocked.createCard.mockResolvedValue({} as never);
    mocked.updateCard.mockResolvedValue({} as never);
    mocked.deleteCard.mockResolvedValue();
});

describe("BoardView", () => {
    it("shows a loading state, then the board with its columns and cards", async () => {
        renderWithClient(<BoardView boardId="b1" />);
        expect(screen.getByText("Loading board…")).toBeInTheDocument();
        expect(await screen.findByText("My Board")).toBeInTheDocument();
        expect(screen.getByText("Todo")).toBeInTheDocument();
        expect(screen.getByText("First")).toBeInTheDocument();
    });

    it("renders an error state when the fetch fails", async () => {
        mocked.fetchBoardView.mockRejectedValue(new Error("boom"));
        renderWithClient(<BoardView boardId="b1" />);
        expect(
            await screen.findByText("Could not load this board."),
        ).toBeInTheDocument();
    });

    it("adds a column through the API client", async () => {
        renderWithClient(<BoardView boardId="b1" />);
        await screen.findByText("My Board");
        await userEvent.click(screen.getByText("+ Add column"));
        await userEvent.type(
            screen.getByLabelText("Column name"),
            "Doing{Enter}",
        );
        await waitFor(() => {
            expect(mocked.createColumn).toHaveBeenCalledWith({
                boardId: "b1",
                name: "Doing",
            });
        });
    });

    it("adds a card to a column through the API client", async () => {
        renderWithClient(<BoardView boardId="b1" />);
        await screen.findByText("My Board");
        await userEvent.click(screen.getByText("+ Add card"));
        await userEvent.type(
            screen.getByLabelText("Card title"),
            "Task{Enter}",
        );
        await waitFor(() => {
            expect(mocked.createCard).toHaveBeenCalledWith({
                columnId: "todo",
                title: "Task",
            });
        });
    });

    it("deletes a card through the API client", async () => {
        renderWithClient(<BoardView boardId="b1" />);
        await screen.findByText("First");
        await userEvent.click(screen.getByLabelText("Delete First"));
        await waitFor(() => {
            expect(mocked.deleteCard).toHaveBeenCalledWith("c1");
        });
    });

    it("renames a column through the API client", async () => {
        renderWithClient(<BoardView boardId="b1" />);
        await screen.findByText("Todo");
        await userEvent.dblClick(screen.getByText("Todo"));
        const input = screen.getByLabelText("Column name");
        await userEvent.clear(input);
        await userEvent.type(input, "Doing{Enter}");
        await waitFor(() => {
            expect(mocked.updateColumn).toHaveBeenCalledWith("todo", {
                name: "Doing",
            });
        });
    });

    it("deletes a column through the API client", async () => {
        renderWithClient(<BoardView boardId="b1" />);
        await screen.findByText("Todo");
        await userEvent.click(screen.getByLabelText("Delete column Todo"));
        await waitFor(() => {
            expect(mocked.deleteColumn).toHaveBeenCalledWith("todo");
        });
    });

    it("renames a card through the API client", async () => {
        renderWithClient(<BoardView boardId="b1" />);
        await userEvent.dblClick(await screen.findByText("First"));
        const input = screen.getByLabelText("Card title");
        await userEvent.clear(input);
        await userEvent.type(input, "Renamed{Enter}");
        await waitFor(() => {
            expect(mocked.updateCard).toHaveBeenCalledWith("c1", {
                title: "Renamed",
            });
        });
    });
});
