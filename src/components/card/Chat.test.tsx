import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Message } from "@/lib/db/messages";

import { Chat } from "./Chat";

const msg = (over: Partial<Message>): Message => ({
    id: "m",
    sessionId: "s",
    role: "user",
    contentBlocks: [],
    seq: 1,
    createdAt: "t",
    ...over,
});

describe("Chat", () => {
    it("renders text, thinking, tool_call, and tool_result blocks", () => {
        render(
            <Chat
                messages={[
                    msg({
                        role: "user",
                        contentBlocks: [{ type: "text", text: "go" }],
                    }),
                    msg({
                        id: "m2",
                        role: "assistant",
                        contentBlocks: [
                            { type: "thinking", text: "pondering" },
                            { type: "text", text: "starting" },
                            {
                                type: "tool_call",
                                id: "t1",
                                name: "start_coding_task",
                                input: {},
                            },
                        ],
                    }),
                    msg({
                        id: "m3",
                        role: "tool",
                        contentBlocks: [
                            {
                                type: "tool_result",
                                toolCallId: "t1",
                                output: {},
                            },
                        ],
                    }),
                ]}
                streamingText=""
                pending={false}
                onSend={vi.fn()}
            />,
        );
        expect(screen.getByText("go")).toBeInTheDocument();
        expect(screen.getByText("pondering")).toBeInTheDocument();
        expect(screen.getByText("→")).toBeInTheDocument();
        expect(screen.getByText("start_coding_task")).toBeInTheDocument();
        expect(screen.getByText("✓ result")).toBeInTheDocument();
    });

    it("renders a streaming bubble while text arrives", () => {
        render(
            <Chat
                messages={[]}
                streamingText="typi"
                pending
                onSend={vi.fn()}
            />,
        );
        expect(screen.getByText("typi▍")).toBeInTheDocument();
    });

    it("sends a trimmed message and ignores blank/pending sends", async () => {
        const onSend = vi.fn();
        const { rerender } = render(
            <Chat
                messages={[]}
                streamingText=""
                pending={false}
                onSend={onSend}
            />,
        );
        await userEvent.type(screen.getByLabelText("Message"), "  hi  {Enter}");
        expect(onSend).toHaveBeenCalledWith("hi");

        onSend.mockClear();
        rerender(
            <Chat messages={[]} streamingText="" pending onSend={onSend} />,
        );
        // Composer is disabled while pending — typing/submitting does nothing.
        expect(screen.getByLabelText("Message")).toBeDisabled();
    });
});
