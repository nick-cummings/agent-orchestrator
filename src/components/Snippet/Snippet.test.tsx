import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Snippet } from "./Snippet";

describe("Snippet", () => {
    it("renders short text unchanged", () => {
        render(<Snippet text="hello" />);
        expect(screen.getByText("hello")).toBeInTheDocument();
    });

    it("truncates text past the max with an ellipsis (wired to truncate)", () => {
        render(<Snippet text={"a".repeat(20)} max={5} />);
        expect(screen.getByText("aaaaa…")).toBeInTheDocument();
    });
});
