import type Anthropic from "@anthropic-ai/sdk";

import {
    toAnthropicMessages,
    toAnthropicTools,
} from "@/lib/adapters/claude/map";
import type {
    ConversationProvider,
    GenerateInput,
    ModelEvent,
} from "@/lib/core/contracts";

/**
 * `createClaudeBrain` — the real `ConversationProvider` over the Anthropic
 * Messages API (governed by the `claude-api` skill: official SDK,
 * `claude-opus-4-8`, adaptive thinking, prompt caching, one streaming call).
 * The app owns the loop; this only maps our `GenerateInput` to a stream and the
 * SDK's stream events back to our `ModelEvent` union. `deps.client` is injected
 * so it's unit-testable against a fake stream. `disable_parallel_tool_use`
 * keeps one tool call per turn (the loop assumes it).
 */
export type ClaudeDeps = {
    client: Anthropic;
    model?: string;
    system?: string;
};

const DEFAULT_MODEL = "claude-opus-4-8";

export const DEFAULT_SYSTEM_PROMPT =
    "You are the orchestrator for a cloud coding workspace. You converse with " +
    "the user and drive a cloud coding engine (Jules) through tools: " +
    "start_coding_task, send_instruction, check_progress, approve_plan, " +
    "get_result. Use a tool whenever the user asks to start, steer, check, or " +
    "ship work — don't describe doing it, do it. start_coding_task needs a repo " +
    "(owner/name@branch); if the user hasn't named one, ask. Narrate progress " +
    "concisely. For minor choices, pick a reasonable option and note it rather " +
    "than asking.";

const mapStop = (
    reason: string | null | undefined,
): "stop" | "tool_use" | "max_tokens" => {
    if (reason === "tool_use") return "tool_use";
    if (reason === "max_tokens") return "max_tokens";
    return "stop";
};

async function* claudeGenerate(
    deps: ClaudeDeps,
    input: GenerateInput,
): AsyncGenerator<ModelEvent> {
    const stream = deps.client.messages.stream(
        {
            model: input.model ?? deps.model ?? DEFAULT_MODEL,
            max_tokens: 64_000,
            thinking: { type: "adaptive", display: "summarized" },
            output_config: { effort: "high" },
            tool_choice: { type: "auto", disable_parallel_tool_use: true },
            system: [
                {
                    type: "text",
                    text: deps.system ?? DEFAULT_SYSTEM_PROMPT,
                    cache_control: { type: "ephemeral" },
                },
            ],
            tools: toAnthropicTools(input.tools),
            messages: toAnthropicMessages(input.messages),
        },
        { signal: input.signal },
    );

    // Accumulate streamed tool_use input by content-block index.
    const pending = new Map<
        number,
        { id: string; name: string; json: string }
    >();
    let stop: "stop" | "tool_use" | "max_tokens" = "stop";

    try {
        for await (const event of stream) {
            if (event.type === "content_block_start") {
                if (event.content_block.type === "tool_use") {
                    pending.set(event.index, {
                        id: event.content_block.id,
                        name: event.content_block.name,
                        json: "",
                    });
                }
            } else if (event.type === "content_block_delta") {
                const delta = event.delta;
                if (delta.type === "text_delta") {
                    yield { type: "text_delta", text: delta.text };
                } else if (delta.type === "thinking_delta") {
                    yield { type: "thinking_delta", text: delta.thinking };
                } else if (delta.type === "input_json_delta") {
                    const tool = pending.get(event.index);
                    if (tool) tool.json += delta.partial_json;
                }
            } else if (event.type === "content_block_stop") {
                const tool = pending.get(event.index);
                if (tool) {
                    pending.delete(event.index);
                    let parsed: unknown = {};
                    try {
                        if (tool.json.length > 0)
                            parsed = JSON.parse(tool.json);
                    } catch {
                        parsed = {};
                    }
                    yield {
                        type: "tool_call",
                        id: tool.id,
                        name: tool.name,
                        input: parsed,
                    };
                }
            } else if (event.type === "message_delta") {
                stop = mapStop(event.delta.stop_reason);
            }
        }
        yield { type: "turn_end", stop };
    } catch (error) {
        if (input.signal?.aborted) {
            yield { type: "turn_end", stop: "interrupt" };
        } else {
            yield {
                type: "error",
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}

export const createClaudeBrain = (deps: ClaudeDeps): ConversationProvider => ({
    id: "claude",
    caps: {
        streaming: true,
        thinking: true,
        parallelToolCalls: false,
        maxContextTokens: 1_000_000,
    },
    generate: (input) => claudeGenerate(deps, input),
});
