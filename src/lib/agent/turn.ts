import { runTurn } from "@/lib/agent/loop";
import { runTool, type ToolRegistry } from "@/lib/agent/tools";
import type { ConversationProvider } from "@/lib/core/contracts";
import type { ApprovalPolicy, ContentBlock, Message } from "@/lib/core/schemas";
import { setCardStatus } from "@/lib/db/cards";
import type { Db } from "@/lib/db/client";
import {
    appendMessage,
    listMessages,
    type Message as MessageRow,
} from "@/lib/db/messages";
import {
    clearPendingApproval,
    getSessionById,
    type Session,
    setPendingApproval,
} from "@/lib/db/sessions";
import type { EventBus } from "@/lib/realtime/bus";

/**
 * The turn service: persist the user message, run the agent loop, stream
 * `SessionEvent`s to the bus, and persist each produced message. On an
 * `ask`-category tool it parks the call (`pendingApproval`) and stops;
 * `resumeTurn` runs/skips the parked tool and continues from the extended
 * transcript (persist-and-resume — ADR 0005).
 */
export type TurnDeps = {
    db: Db;
    bus: EventBus;
    brain: ConversationProvider;
    tools: ToolRegistry;
};

const policyFor = (session: Session): ApprovalPolicy =>
    session.requirePlanApproval ? { branch_write: "ask" } : {};

const toDomain = (row: MessageRow): Message => ({
    id: row.id,
    sessionId: row.sessionId,
    role: row.role as Message["role"],
    contentBlocks: row.contentBlocks,
    seq: row.seq,
    createdAt: row.createdAt,
});

const persist = async (
    deps: TurnDeps,
    sessionId: string,
    role: string,
    contentBlocks: ContentBlock[],
): Promise<void> => {
    const row = await appendMessage(deps.db, sessionId, {
        role,
        contentBlocks,
    });
    await deps.bus.publish(sessionId, {
        type: "message",
        id: row.id,
        role: row.role,
        seq: row.seq,
        contentBlocks: row.contentBlocks,
    });
};

/** Run the loop from the current transcript, publishing + persisting, until it
 *  ends, pauses for approval, or errors. */
const drive = async (
    deps: TurnDeps,
    session: Session,
    policy: ApprovalPolicy,
): Promise<void> => {
    const history = (await listMessages(deps.db, session.id)).map(toDomain);
    for await (const event of runTurn({
        brain: deps.brain,
        tools: deps.tools,
        history,
        policy,
    })) {
        if (event.type === "text") {
            await deps.bus.publish(session.id, {
                type: "text",
                text: event.text,
            });
        } else if (event.type === "thinking") {
            await deps.bus.publish(session.id, {
                type: "thinking",
                text: event.text,
            });
        } else if (event.type === "tool_call") {
            await deps.bus.publish(session.id, {
                type: "tool_call",
                id: event.id,
                name: event.name,
                input: event.input,
            });
        } else if (event.type === "message") {
            await persist(deps, session.id, event.role, event.contentBlocks);
        } else if (event.type === "approval_request") {
            await setPendingApproval(deps.db, session.id, {
                toolCallId: event.toolCallId,
                name: event.name,
                input: event.input,
                category: event.category,
            });
            await setCardStatus(deps.db, session.cardId, "awaiting_input");
            await deps.bus.publish(session.id, {
                type: "approval_request",
                toolCallId: event.toolCallId,
                name: event.name,
                input: event.input,
                category: event.category,
            });
            return;
        } else if (event.type === "turn_end") {
            await setCardStatus(deps.db, session.cardId, "idle");
            await deps.bus.publish(session.id, {
                type: "turn_end",
                stop: event.stop,
            });
            return;
        } else {
            // error: surface as an assistant message, then end the turn.
            await persist(deps, session.id, "assistant", [
                { type: "text", text: `⚠ ${event.error}` },
            ]);
            await setCardStatus(deps.db, session.cardId, "error");
            await deps.bus.publish(session.id, {
                type: "turn_end",
                stop: "error",
            });
            return;
        }
    }
};

export const runSessionTurn = async (
    deps: TurnDeps,
    sessionId: string,
    userText: string,
): Promise<void> => {
    const session = await getSessionById(deps.db, sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    await persist(deps, sessionId, "user", [{ type: "text", text: userText }]);
    await setCardStatus(deps.db, session.cardId, "thinking");
    await drive(deps, session, policyFor(session));
};

export const resumeTurn = async (
    deps: TurnDeps,
    sessionId: string,
    decision: "approve" | "reject",
): Promise<void> => {
    const session = await getSessionById(deps.db, sessionId);
    if (!session?.pendingApproval) return;
    const pending = session.pendingApproval;

    let output: unknown;
    if (decision === "approve") {
        try {
            output = await runTool(deps.tools, pending.name, pending.input);
        } catch (error) {
            output = {
                error: error instanceof Error ? error.message : String(error),
            };
        }
    } else {
        output = { rejected: true, reason: "Rejected by the user." };
    }

    await persist(deps, sessionId, "tool", [
        { type: "tool_result", toolCallId: pending.toolCallId, output },
    ]);
    await clearPendingApproval(deps.db, sessionId);
    await setCardStatus(deps.db, session.cardId, "thinking");
    await drive(deps, session, policyFor(session));
};
