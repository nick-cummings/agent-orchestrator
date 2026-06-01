import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InlineCreate } from "./InlineCreate";

describe("InlineCreate", () => {
    it("opens an input from the collapsed trigger", async () => {
        render(
            <InlineCreate
                label="+ Add card"
                placeholder="Card title"
                onCreate={vi.fn()}
            />,
        );
        await userEvent.click(screen.getByText("+ Add card"));
        expect(screen.getByLabelText("Card title")).toBeInTheDocument();
    });

    it("submits the trimmed text on Enter", async () => {
        const onCreate = vi.fn();
        render(
            <InlineCreate
                label="+ Add"
                placeholder="Name"
                onCreate={onCreate}
            />,
        );
        await userEvent.click(screen.getByText("+ Add"));
        await userEvent.type(screen.getByLabelText("Name"), "  Todo  {Enter}");
        expect(onCreate).toHaveBeenCalledWith("Todo");
    });

    it("ignores a blank submit", async () => {
        const onCreate = vi.fn();
        render(
            <InlineCreate
                label="+ Add"
                placeholder="Name"
                onCreate={onCreate}
            />,
        );
        await userEvent.click(screen.getByText("+ Add"));
        await userEvent.type(screen.getByLabelText("Name"), "   {Enter}");
        expect(onCreate).not.toHaveBeenCalled();
    });

    it("closes on Escape without submitting", async () => {
        const onCreate = vi.fn();
        render(
            <InlineCreate
                label="+ Add"
                placeholder="Name"
                onCreate={onCreate}
            />,
        );
        await userEvent.click(screen.getByText("+ Add"));
        await userEvent.type(screen.getByLabelText("Name"), "x{Escape}");
        expect(onCreate).not.toHaveBeenCalled();
        expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    });
});
