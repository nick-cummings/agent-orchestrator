import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ToolSpec } from "@/lib/core/contracts";
import type { Message } from "@/lib/core/schemas";

import { toAnthropicMessages, toAnthropicTools } from "./map";

const msg = (over: Partial<Message>): Message => ({
    id: "m",
    sessionId: "s",
    role: "user",
    contentBlocks: [],
    seq: 1,
    createdAt: "t",
    ...over,
});

describe("toAnthropicMessages", () => {
    it("maps a user text message", () => {
        const out = toAnthropicMessages([
            msg({
                role: "user",
                contentBlocks: [{ type: "text", text: "hi" }],
            }),
        ]);
        expect(out).toEqual([
            { role: "user", content: [{ type: "text", text: "hi" }] },
        ]);
    });

    it("maps an assistant turn with text + tool_call, dropping thinking", () => {
        const out = toAnthropicMessages([
            msg({
                role: "assistant",
                contentBlocks: [
                    { type: "thinking", text: "secret" },
                    { type: "text", text: "starting" },
                    {
                        type: "tool_call",
                        id: "t1",
                        name: "go",
                        input: { x: 1 },
                    },
                ],
            }),
        ]);
        expect(out[0].role).toBe("assistant");
        expect(out[0].content).toEqual([
            { type: "text", text: "starting" },
            { type: "tool_use", id: "t1", name: "go", input: { x: 1 } },
        ]);
    });

    it("maps a tool-result message into a user turn with stringified output", () => {
        const out = toAnthropicMessages([
            msg({
                role: "tool",
                contentBlocks: [
                    {
                        type: "tool_result",
                        toolCallId: "t1",
                        output: { ok: true },
                    },
                ],
            }),
        ]);
        expect(out[0].role).toBe("user");
        expect(out[0].content).toEqual([
            { type: "tool_result", tool_use_id: "t1", content: '{"ok":true}' },
        ]);
    });
});

describe("toAnthropicTools", () => {
    it("derives JSON-schema input_schema from the Zod spec", () => {
        const specs: ToolSpec[] = [
            {
                name: "start_coding_task",
                description: "Start a task",
                schema: z.object({ prompt: z.string() }),
            },
        ];
        const [tool] = toAnthropicTools(specs);
        expect(tool.name).toBe("start_coding_task");
        expect(tool.input_schema.type).toBe("object");
        expect(tool.input_schema.properties).toHaveProperty("prompt");
    });
});
