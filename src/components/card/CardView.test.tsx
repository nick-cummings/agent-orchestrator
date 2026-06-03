import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardSessionView } from "@/lib/db/cardSession";
import { renderWithClient } from "@/test-utils/query";

import { CardView } from "./CardView";

vi.mock("@/lib/api/client");
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn() }) }));
import * as api from "@/lib/api/client";
const mocked = vi.mocked(api);

const exec = (over: Record<string, unknown>) =>
    ({
        id: "e1",
        sessionId: "s1",
        engine: "jules",
        externalRef: "ext1",
        prompt: "do the thing",
        lastActivityCursor: null,
        deepLinkUrl: "https://jules.google/sessions/ext1",
        resultPrUrl: null,
        createdAt: "t",
        updatedAt: "t",
        activities: [],
        state: "running",
        ...over,
    }) as CardSessionView["executions"][number];

const view = (executions: CardSessionView["executions"]): CardSessionView => ({
    session: executions.length
        ? ({ id: "s1", cardId: "c1" } as CardSessionView["session"])
        : null,
    executions,
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
        "EventSource",
        class FakeEventSource {
            addEventListener = vi.fn();
            close = vi.fn();
        },
    );
    mocked.startExecution.mockResolvedValue({} as never);
    mocked.sendExecutionMessage.mockResolvedValue({ ok: true });
    mocked.approveExecutionPlan.mockResolvedValue({ ok: true });
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe("CardView", () => {
    it("shows the start form and starts a task when there's no execution", async () => {
        mocked.fetchCardSession.mockResolvedValue(view([]));
        renderWithClient(<CardView cardId="c1" />);

        await userEvent.type(
            await screen.findByLabelText("Task prompt"),
            "fix it",
        );
        await userEvent.type(screen.getByLabelText("Repository"), "acme/app");
        await userEvent.click(
            screen.getByRole("button", { name: "Start task" }),
        );
        await waitFor(() => {
            expect(mocked.startExecution).toHaveBeenCalledWith("c1", {
                prompt: "fix it",
                repo: { owner: "acme", name: "app", branch: "main" },
                requirePlanApproval: true,
            });
        });
    });

    it("renders a running execution with status, deep link, and steer", async () => {
        mocked.fetchCardSession.mockResolvedValue(view([exec({})]));
        renderWithClient(<CardView cardId="c1" />);

        expect(await screen.findByText("Running")).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: /Open in Jules/ }),
        ).toHaveAttribute("href", "https://jules.google/sessions/ext1");

        await userEvent.type(
            screen.getByLabelText("Send guidance"),
            "use TypeScript",
        );
        await userEvent.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() => {
            expect(mocked.sendExecutionMessage).toHaveBeenCalledWith(
                "e1",
                "use TypeScript",
            );
        });
    });

    it("shows Approve plan only when awaiting approval and approves", async () => {
        mocked.fetchCardSession.mockResolvedValue(
            view([exec({ state: "awaiting_plan_approval" })]),
        );
        renderWithClient(<CardView cardId="c1" />);

        await userEvent.click(
            await screen.findByRole("button", { name: "Approve plan" }),
        );
        await waitFor(() => {
            expect(mocked.approveExecutionPlan).toHaveBeenCalledWith("e1");
        });
    });

    it("shows the PR link and hides steer when succeeded", async () => {
        mocked.fetchCardSession.mockResolvedValue(
            view([
                exec({
                    state: "succeeded",
                    resultPrUrl: "https://github.com/acme/app/pull/9",
                }),
            ]),
        );
        renderWithClient(<CardView cardId="c1" />);

        expect(await screen.findByText("PR ready")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /View PR/ })).toHaveAttribute(
            "href",
            "https://github.com/acme/app/pull/9",
        );
        expect(
            screen.queryByLabelText("Send guidance"),
        ).not.toBeInTheDocument();
    });
});
