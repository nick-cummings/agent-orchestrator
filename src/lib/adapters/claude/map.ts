import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import type { ToolSpec } from "@/lib/core/contracts";
import type { ContentBlock, Message } from "@/lib/core/schemas";

/**
 * Pure mappers between our domain and the Anthropic Messages API — the
 * anti-corruption boundary for the Brain. Tool-result and tool-call blocks map
 * to Anthropic's `tool_result`/`tool_use`; `thinking` blocks are display-only
 * and dropped from the request (we don't persist their signatures). Tool params
 * become JSON Schema via Zod 4's `z.toJSONSchema`.
 */

const toContent = (blocks: ContentBlock[]): Anthropic.ContentBlockParam[] => {
    const out: Anthropic.ContentBlockParam[] = [];
    for (const block of blocks) {
        if (block.type === "text") {
            out.push({ type: "text", text: block.text });
        } else if (block.type === "tool_call") {
            out.push({
                type: "tool_use",
                id: block.id,
                name: block.name,
                input: block.input,
            });
        } else if (block.type === "tool_result") {
            out.push({
                type: "tool_result",
                tool_use_id: block.toolCallId,
                content:
                    typeof block.output === "string"
                        ? block.output
                        : JSON.stringify(block.output),
            });
        }
        // thinking / image / document: not sent back to the model in Phase 2.
    }
    return out;
};

/** `tool` role results live in an Anthropic user turn; everything non-assistant
 *  maps to `user`. */
export const toAnthropicMessages = (
    messages: Message[],
): Anthropic.MessageParam[] =>
    messages.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: toContent(message.contentBlocks),
    }));

export const toAnthropicTools = (specs: ToolSpec[]): Anthropic.Tool[] =>
    specs.map((spec) => ({
        name: spec.name,
        description: spec.description,
        input_schema: z.toJSONSchema(spec.schema) as Anthropic.Tool.InputSchema,
    }));
