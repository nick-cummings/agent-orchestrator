import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { Activity } from "@/lib/db/activities";

import { ActivityFeed } from "./ActivityFeed";

const act = (seq: number, kind: string, text?: string): Activity => ({
    id: `a${String(seq)}`,
    executionId: "e1",
    seq,
    at: "2026-06-01T00:00:00Z",
    source: "agent",
    kind,
    text: text ?? null,
    data: null,
    cursor: `c${String(seq)}`,
});

describe("ActivityFeed", () => {
    it("shows an empty state", () => {
        render(<ActivityFeed activities={[]} />);
        expect(screen.getByText("No activity yet.")).toBeInTheDocument();
    });

    it("summarizes the latest activity and expands to the full list", async () => {
        render(
            <ActivityFeed
                activities={[
                    act(1, "plan", "made a plan"),
                    act(2, "progress", "editing 3 files"),
                ]}
            />,
        );
        // Collapsed: latest summary + count.
        expect(screen.getByText("editing 3 files")).toBeInTheDocument();
        expect(screen.getByText("2 events")).toBeInTheDocument();
        expect(screen.queryByText("made a plan")).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("button"));
        expect(screen.getByText("made a plan")).toBeInTheDocument();
    });
});
