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

const view = (over: Partial<CardSessionView>): CardSessionView => ({
    session: { id: "s1", cardId: "c1" } as CardSessionView["session"],
    messages: [],
    executions: [],
    ...over,
});

const message = (over: Record<string, unknown>) =>
    ({
        id: "m1",
        sessionId: "s1",
        role: "user",
        contentBlocks: [{ type: "text", text: "hello" }],
        seq: 1,
        createdAt: "t",
        ...over,
    }) as CardSessionView["messages"][number];

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
        "EventSource",
        class FakeEventSource {
            addEventListener = vi.fn();
            close = vi.fn();
        },
    );
    mocked.sendChatMessage.mockResolvedValue({ ok: true });
    mocked.respondToApproval.mockResolvedValue({ ok: true });
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe("CardView chat", () => {
    it("renders the transcript and sends a message", async () => {
        mocked.fetchCardSession.mockResolvedValue(
            view({
                messages: [
                    message({ id: "m1", role: "user" }),
                    message({
                        id: "m2",
                        role: "assistant",
                        contentBlocks: [{ type: "text", text: "on it" }],
                    }),
                ],
            }),
        );
        renderWithClient(<CardView cardId="c1" />);

        expect(await screen.findByText("hello")).toBeInTheDocument();
        expect(screen.getByText("on it")).toBeInTheDocument();

        await userEvent.type(screen.getByLabelText("Message"), "do a thing");
        await userEvent.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() => {
            expect(mocked.sendChatMessage).toHaveBeenCalledWith(
                "c1",
                "do a thing",
            );
        });
    });

    it("shows the approval prompt and approves a parked tool", async () => {
        mocked.fetchCardSession.mockResolvedValue(
            view({
                session: {
                    id: "s1",
                    cardId: "c1",
                    pendingApproval: {
                        toolCallId: "tc1",
                        name: "start_coding_task",
                        input: { prompt: "fix it" },
                        category: "branch_write",
                    },
                } as CardSessionView["session"],
            }),
        );
        renderWithClient(<CardView cardId="c1" />);

        await userEvent.click(
            await screen.findByRole("button", { name: "Approve" }),
        );
        await waitFor(() => {
            expect(mocked.respondToApproval).toHaveBeenCalledWith(
                "s1",
                "approve",
            );
        });
    });

    it("renders the latest execution status + PR link", async () => {
        mocked.fetchCardSession.mockResolvedValue(
            view({
                executions: [
                    {
                        id: "e1",
                        state: "succeeded",
                        deepLinkUrl: "https://jules.google/sessions/x",
                        resultPrUrl: "https://github.com/o/r/pull/3",
                        activities: [],
                    } as unknown as CardSessionView["executions"][number],
                ],
            }),
        );
        renderWithClient(<CardView cardId="c1" />);

        expect(await screen.findByText("PR ready")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /View PR/ })).toHaveAttribute(
            "href",
            "https://github.com/o/r/pull/3",
        );
    });
});
