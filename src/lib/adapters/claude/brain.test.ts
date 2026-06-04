import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import type { GenerateInput, ModelEvent } from "@/lib/core/contracts";

import { createClaudeBrain } from "./brain";

// Build a fake SDK stream from scripted raw events (shapes the mapper reads).
const ev = (o: object): Anthropic.RawMessageStreamEvent =>
    o as unknown as Anthropic.RawMessageStreamEvent;

const streamOf = (
    events: Anthropic.RawMessageStreamEvent[],
    throwAtEnd = false,
) =>
    (async function* () {
        await Promise.resolve();
        for (const event of events) yield event;
        if (throwAtEnd) throw new Error("stream blew up");
    })();

const brainWith = (
    events: Anthropic.RawMessageStreamEvent[],
    throwAtEnd = false,
) => {
    const client = {
        messages: { stream: () => streamOf(events, throwAtEnd) },
    } as unknown as Anthropic;
    return createClaudeBrain({ client });
};

const collect = async (
    input: GenerateInput,
    brain: ReturnType<typeof brainWith>,
) => {
    const out: ModelEvent[] = [];
    for await (const event of brain.generate(input)) out.push(event);
    return out;
};

const INPUT: GenerateInput = { messages: [], tools: [] };

describe("createClaudeBrain.generate", () => {
    it("maps text deltas and a normal stop", async () => {
        const brain = brainWith([
            ev({
                type: "content_block_start",
                index: 0,
                content_block: { type: "text", text: "" },
            }),
            ev({
                type: "content_block_delta",
                index: 0,
                delta: { type: "text_delta", text: "hi" },
            }),
            ev({ type: "content_block_stop", index: 0 }),
            ev({ type: "message_delta", delta: { stop_reason: "end_turn" } }),
        ]);
        expect(await collect(INPUT, brain)).toEqual([
            { type: "text_delta", text: "hi" },
            { type: "turn_end", stop: "stop" },
        ]);
    });

    it("accumulates streamed tool_use input and emits one tool_call", async () => {
        const brain = brainWith([
            ev({
                type: "content_block_start",
                index: 0,
                content_block: {
                    type: "tool_use",
                    id: "t1",
                    name: "echo",
                    input: {},
                },
            }),
            ev({
                type: "content_block_delta",
                index: 0,
                delta: { type: "input_json_delta", partial_json: '{"x":' },
            }),
            ev({
                type: "content_block_delta",
                index: 0,
                delta: { type: "input_json_delta", partial_json: "5}" },
            }),
            ev({ type: "content_block_stop", index: 0 }),
            ev({ type: "message_delta", delta: { stop_reason: "tool_use" } }),
        ]);
        expect(await collect(INPUT, brain)).toEqual([
            { type: "tool_call", id: "t1", name: "echo", input: { x: 5 } },
            { type: "turn_end", stop: "tool_use" },
        ]);
    });

    it("maps thinking deltas", async () => {
        const brain = brainWith([
            ev({
                type: "content_block_delta",
                index: 0,
                delta: { type: "thinking_delta", thinking: "hmm" },
            }),
            ev({ type: "message_delta", delta: { stop_reason: "end_turn" } }),
        ]);
        const out = await collect(INPUT, brain);
        expect(out[0]).toEqual({ type: "thinking_delta", text: "hmm" });
    });

    it("surfaces a stream failure as an error event", async () => {
        const brain = brainWith(
            [
                ev({
                    type: "content_block_delta",
                    index: 0,
                    delta: { type: "text_delta", text: "x" },
                }),
            ],
            true,
        );
        const out = await collect(INPUT, brain);
        expect(out.at(-1)).toEqual({ type: "error", error: "stream blew up" });
    });
});
