import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApprovalPrompt } from "./ApprovalPrompt";

const PENDING = {
    toolCallId: "tc1",
    name: "start_coding_task",
    input: { prompt: "fix the bug" },
    category: "branch_write",
};

describe("ApprovalPrompt", () => {
    it("shows the parked tool and its input", () => {
        render(
            <ApprovalPrompt
                pending={PENDING}
                busy={false}
                onDecide={vi.fn()}
            />,
        );
        expect(screen.getByText("start_coding_task")).toBeInTheDocument();
        expect(screen.getByText(/fix the bug/)).toBeInTheDocument();
    });

    it("reports approve and reject decisions", async () => {
        const onDecide = vi.fn();
        render(
            <ApprovalPrompt
                pending={PENDING}
                busy={false}
                onDecide={onDecide}
            />,
        );
        await userEvent.click(screen.getByRole("button", { name: "Approve" }));
        await userEvent.click(screen.getByRole("button", { name: "Reject" }));
        expect(onDecide).toHaveBeenNthCalledWith(1, "approve");
        expect(onDecide).toHaveBeenNthCalledWith(2, "reject");
    });

    it("disables the buttons while busy", () => {
        render(<ApprovalPrompt pending={PENDING} busy onDecide={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    });
});
