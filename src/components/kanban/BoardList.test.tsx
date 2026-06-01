import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Board } from "@/lib/db/boards";
import { renderWithClient } from "@/test-utils/query";

import { BoardList } from "./BoardList";

vi.mock("@/lib/api/client");
import * as api from "@/lib/api/client";
const mocked = vi.mocked(api);

beforeEach(() => {
    vi.clearAllMocks();
    mocked.createBoard.mockResolvedValue({} as never);
});

describe("BoardList", () => {
    it("lists boards as links to their kanban screens", async () => {
        mocked.fetchBoards.mockResolvedValue([
            { id: "b1", name: "Alpha" } as Board,
            { id: "b2", name: "Beta" } as Board,
        ]);
        renderWithClient(<BoardList />);
        const alpha = await screen.findByRole("link", { name: "Alpha" });
        expect(alpha).toHaveAttribute("href", "/board/b1");
    });

    it("shows an empty state when there are no boards", async () => {
        mocked.fetchBoards.mockResolvedValue([]);
        renderWithClient(<BoardList />);
        expect(
            await screen.findByText("No boards yet — create one below."),
        ).toBeInTheDocument();
    });

    it("shows an error state when the fetch fails", async () => {
        mocked.fetchBoards.mockRejectedValue(new Error("boom"));
        renderWithClient(<BoardList />);
        expect(
            await screen.findByText("Could not load boards."),
        ).toBeInTheDocument();
    });

    it("creates a board through the API client", async () => {
        mocked.fetchBoards.mockResolvedValue([]);
        renderWithClient(<BoardList />);
        await screen.findByText("No boards yet — create one below.");
        await userEvent.click(screen.getByText("+ New board"));
        await userEvent.type(
            screen.getByLabelText("Board name"),
            "Gamma{Enter}",
        );
        await waitFor(() => {
            expect(mocked.createBoard).toHaveBeenCalledWith({ name: "Gamma" });
        });
    });
});
