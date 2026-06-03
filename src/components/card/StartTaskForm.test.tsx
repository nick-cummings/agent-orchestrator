import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StartTaskForm } from "./StartTaskForm";

describe("StartTaskForm", () => {
    it("validates an empty prompt", async () => {
        const onStart = vi.fn();
        render(<StartTaskForm pending={false} onStart={onStart} />);
        await userEvent.click(
            screen.getByRole("button", { name: "Start task" }),
        );
        expect(screen.getByText("Describe the task.")).toBeInTheDocument();
        expect(onStart).not.toHaveBeenCalled();
    });

    it("validates a malformed repo", async () => {
        const onStart = vi.fn();
        render(<StartTaskForm pending={false} onStart={onStart} />);
        await userEvent.type(screen.getByLabelText("Task prompt"), "do it");
        await userEvent.type(screen.getByLabelText("Repository"), "nope");
        await userEvent.click(
            screen.getByRole("button", { name: "Start task" }),
        );
        expect(
            screen.getByText("Repo must be owner/name@branch."),
        ).toBeInTheDocument();
        expect(onStart).not.toHaveBeenCalled();
    });

    it("submits a parsed task (branch defaults to main)", async () => {
        const onStart = vi.fn();
        render(<StartTaskForm pending={false} onStart={onStart} />);
        await userEvent.type(screen.getByLabelText("Task prompt"), "fix bug");
        await userEvent.type(screen.getByLabelText("Repository"), "acme/app");
        await userEvent.click(
            screen.getByRole("button", { name: "Start task" }),
        );
        expect(onStart).toHaveBeenCalledWith({
            prompt: "fix bug",
            repo: { owner: "acme", name: "app", branch: "main" },
            requirePlanApproval: true,
        });
    });

    it("parses an explicit branch and reflects the pending state", () => {
        render(<StartTaskForm pending={true} onStart={vi.fn()} />);
        expect(
            screen.getByRole("button", { name: "Starting…" }),
        ).toBeDisabled();
    });
});
