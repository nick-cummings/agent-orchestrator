import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { defineTool, type ToolRegistry } from "@/lib/agent/tools";
import type { ConversationProvider, ModelEvent } from "@/lib/core/contracts";
import type { ApprovalPolicy } from "@/lib/core/schemas";

import { runTurn, type TurnContext, type TurnEvent } from "./loop";

/** A Brain whose `generate` replays one scripted ModelEvent stream per call. */
const fakeBrain = (scripts: ModelEvent[][]): ConversationProvider => {
    let i = 0;
    return {
        id: "claude",
        caps: {
            streaming: true,
            thinking: true,
            parallelToolCalls: false,
            maxContextTokens: 200_000,
        },
        generate: () => {
            const script = scripts[i] ?? [];
            i += 1;
            return (async function* () {
                await Promise.resolve(); // make it a genuine async stream
                for (const event of script) yield event;
            })();
        },
    };
};

const collect = async (gen: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> => {
    const out: TurnEvent[] = [];
    for await (const event of gen) out.push(event);
    return out;
};

const ctx = (
    brain: ConversationProvider,
    tools: ToolRegistry,
    policy: ApprovalPolicy = {},
): TurnContext => ({ brain, tools, history: [], policy });

describe("runTurn", () => {
    it("streams text and ends a turn with no tool calls", async () => {
        const events = await collect(
            runTurn(
                ctx(
                    fakeBrain([
                        [
                            { type: "text_delta", text: "hi" },
                            { type: "turn_end", stop: "stop" },
                        ],
                    ]),
                    {},
                ),
            ),
        );
        expect(events.map((e) => e.type)).toEqual([
            "text",
            "message",
            "turn_end",
        ]);
        expect(events[1]).toMatchObject({
            role: "assistant",
            contentBlocks: [{ type: "text", text: "hi" }],
        });
    });

    it("runs an auto tool, feeds the result back, and continues", async () => {
        const run = vi.fn((i: { x: number }) => Promise.resolve({ got: i.x }));
        const echo = defineTool({
            name: "echo",
            description: "d",
            category: "read", // auto by default
            schema: z.object({ x: z.number() }),
            run,
        });
        const events = await collect(
            runTurn(
                ctx(
                    fakeBrain([
                        [
                            {
                                type: "tool_call",
                                id: "t1",
                                name: "echo",
                                input: { x: 7 },
                            },
                            { type: "turn_end", stop: "tool_use" },
                        ],
                        [
                            { type: "text_delta", text: "done" },
                            { type: "turn_end", stop: "stop" },
                        ],
                    ]),
                    { echo },
                ),
            ),
        );
        expect(run).toHaveBeenCalledWith({ x: 7 });
        expect(events.map((e) => e.type)).toEqual([
            "tool_call",
            "message", // assistant tool_call
            "message", // tool result
            "text",
            "message", // assistant final text
            "turn_end",
        ]);
        const toolMsg = events[2];
        expect(toolMsg).toMatchObject({
            role: "tool",
            contentBlocks: [{ type: "tool_result", output: { got: 7 } }],
        });
    });

    it("pauses on an ask-category tool without running it", async () => {
        const run = vi.fn(() => Promise.resolve("nope"));
        const danger = defineTool({
            name: "danger",
            description: "d",
            category: "destructive", // ask by default
            schema: z.object({}),
            run,
        });
        const events = await collect(
            runTurn(
                ctx(
                    fakeBrain([
                        [
                            {
                                type: "tool_call",
                                id: "t2",
                                name: "danger",
                                input: {},
                            },
                            { type: "turn_end", stop: "tool_use" },
                        ],
                    ]),
                    { danger },
                ),
            ),
        );
        expect(run).not.toHaveBeenCalled();
        expect(events.map((e) => e.type)).toEqual([
            "tool_call",
            "message",
            "approval_request",
        ]);
        expect(events[2]).toMatchObject({
            toolCallId: "t2",
            name: "danger",
            category: "destructive",
        });
    });

    it("surfaces a Brain error and stops", async () => {
        const events = await collect(
            runTurn(ctx(fakeBrain([[{ type: "error", error: "boom" }]]), {})),
        );
        expect(events).toEqual([{ type: "error", error: "boom" }]);
    });

    it("turns a tool failure into a tool_result error block", async () => {
        const boom = defineTool({
            name: "boom",
            description: "d",
            category: "read",
            schema: z.object({}),
            run: () => Promise.reject(new Error("kaboom")),
        });
        const events = await collect(
            runTurn(
                ctx(
                    fakeBrain([
                        [
                            {
                                type: "tool_call",
                                id: "t3",
                                name: "boom",
                                input: {},
                            },
                            { type: "turn_end", stop: "tool_use" },
                        ],
                        [{ type: "turn_end", stop: "stop" }],
                    ]),
                    { boom },
                ),
            ),
        );
        const toolMsg = events.find(
            (e) => e.type === "message" && e.role === "tool",
        );
        expect(toolMsg).toMatchObject({
            contentBlocks: [
                { type: "tool_result", output: { error: "kaboom" } },
            ],
        });
    });
});
