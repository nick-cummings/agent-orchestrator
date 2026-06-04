import { runTool, specsOf, type ToolRegistry } from "@/lib/agent/tools";
import { decideApproval } from "@/lib/core/config";
import type { ConversationProvider } from "@/lib/core/contracts";
import type {
    ActionCategory,
    ApprovalPolicy,
    ContentBlock,
    Message,
} from "@/lib/core/schemas";

/**
 * The provider-agnostic agent loop (implementation-plan §5), shaped for
 * persist-and-resume. `runTurn` streams the Brain, runs `auto`-category tools
 * inline, and yields `message` events (completed assistant/tool messages) for
 * the caller to persist. On the first `ask`-category tool it yields an
 * `approval_request` and RETURNS — it never awaits a human tap in-process. The
 * caller parks the pending call and, on approval, runs the tool and starts a
 * fresh `runTurn` with the extended history. Side effects (tool runs) are the
 * tools'; the loop itself is pure over its context.
 */

export type TurnEvent =
    | { type: "text"; text: string }
    | { type: "thinking"; text: string }
    | { type: "tool_call"; id: string; name: string; input: unknown }
    | {
          type: "message";
          role: "assistant" | "tool";
          contentBlocks: ContentBlock[];
      }
    | {
          type: "approval_request";
          toolCallId: string;
          name: string;
          input: unknown;
          category: string;
      }
    | { type: "turn_end"; stop: string }
    | { type: "error"; error: string };

export type TurnContext = {
    brain: ConversationProvider;
    tools: ToolRegistry;
    history: Message[];
    policy: ApprovalPolicy;
    signal?: AbortSignal;
};

type Call = { id: string; name: string; input: unknown };

// The Brain's map only reads role + contentBlocks; the other domain fields are
// assigned for real when the caller persists the yielded `message` event.
const asMessage = (
    role: Message["role"],
    contentBlocks: ContentBlock[],
): Message => ({
    id: "",
    sessionId: "",
    role,
    contentBlocks,
    seq: 0,
    createdAt: "",
});

const runOne = async (
    tools: ToolRegistry,
    call: Call,
): Promise<ContentBlock> => {
    try {
        return {
            type: "tool_result",
            toolCallId: call.id,
            output: await runTool(tools, call.name, call.input),
        };
    } catch (error) {
        // Tool failures feed back to the Brain as a result, not a turn abort.
        return {
            type: "tool_result",
            toolCallId: call.id,
            output: {
                error: error instanceof Error ? error.message : String(error),
            },
        };
    }
};

export async function* runTurn(ctx: TurnContext): AsyncGenerator<TurnEvent> {
    const messages: Message[] = [...ctx.history];
    const specs = specsOf(ctx.tools);

    for (;;) {
        const calls: Call[] = [];
        let text = "";
        let stop = "stop";

        for await (const event of ctx.brain.generate({
            messages,
            tools: specs,
            signal: ctx.signal,
        })) {
            if (event.type === "text_delta") {
                text += event.text;
                yield { type: "text", text: event.text };
            } else if (event.type === "thinking_delta") {
                yield { type: "thinking", text: event.text };
            } else if (event.type === "tool_call") {
                calls.push({
                    id: event.id,
                    name: event.name,
                    input: event.input,
                });
                yield {
                    type: "tool_call",
                    id: event.id,
                    name: event.name,
                    input: event.input,
                };
            } else if (event.type === "turn_end") {
                stop = event.stop;
            } else {
                yield { type: "error", error: event.error };
                return;
            }
        }

        // Persist the assistant turn (text + any tool-call blocks).
        const assistantBlocks: ContentBlock[] = [];
        if (text.length > 0) assistantBlocks.push({ type: "text", text });
        for (const call of calls) {
            assistantBlocks.push({
                type: "tool_call",
                id: call.id,
                name: call.name,
                input: call.input,
            });
        }
        if (assistantBlocks.length > 0) {
            yield {
                type: "message",
                role: "assistant",
                contentBlocks: assistantBlocks,
            };
            messages.push(asMessage("assistant", assistantBlocks));
        }

        if (calls.length === 0) {
            yield { type: "turn_end", stop };
            return;
        }

        // Run tools in order; pause at the first that needs approval.
        const results: ContentBlock[] = [];
        for (const call of calls) {
            // Record index is typed non-nullable, so guard with `in`; an
            // unknown tool has no category (gate → auto) and `runTool` then
            // surfaces the error as a tool_result.
            const category: ActionCategory | undefined =
                call.name in ctx.tools
                    ? ctx.tools[call.name].category
                    : undefined;
            if (decideApproval(ctx.policy, category) === "ask") {
                if (results.length > 0) {
                    yield {
                        type: "message",
                        role: "tool",
                        contentBlocks: results,
                    };
                }
                yield {
                    type: "approval_request",
                    toolCallId: call.id,
                    name: call.name,
                    input: call.input,
                    category: category ?? "branch_write",
                };
                return;
            }
            results.push(await runOne(ctx.tools, call));
        }

        yield { type: "message", role: "tool", contentBlocks: results };
        messages.push(asMessage("tool", results));
    }
}
