import type { ExecutionEngine } from "@/lib/core/contracts";
import type { ExecutionState } from "@/lib/core/schemas";
import { appendActivities } from "@/lib/db/activities";
import { setCardStatus } from "@/lib/db/cards";
import type { Db } from "@/lib/db/client";
import {
    type Execution,
    listActiveExecutions,
    updateExecution,
} from "@/lib/db/executions";
import { getSessionById } from "@/lib/db/sessions";
import type { EventBus } from "@/lib/realtime/bus";

/**
 * The poller: advance an Execution by pulling new activity from its Engine,
 * persisting it, mirroring state onto the card face, and publishing to the
 * session's realtime channel. Pure over injected deps (db/engine/bus) so it's
 * fully testable with a fake engine + in-memory bus. A cron route sweeps all
 * active executions via `pollActiveExecutions` (Increment 5).
 */

/** Execution lifecycle → card-face status (board view). */
const EXEC_TO_CARD: Record<ExecutionState, string> = {
    starting: "running",
    planning: "running",
    awaiting_plan_approval: "awaiting_plan_approval",
    running: "running",
    awaiting_feedback: "awaiting_input",
    succeeded: "pr_ready",
    failed: "error",
    cancelled: "idle",
};

// The poller only reads from the engine.
export type PollerEngine = Pick<
    ExecutionEngine,
    "listActivities" | "getStatus" | "getResult"
>;
export type PollerDeps = { db: Db; engine: PollerEngine; bus: EventBus };
export type AdvanceResult = { newActivities: number; state: ExecutionState };

export const advanceExecution = async (
    deps: PollerDeps,
    execution: Execution,
): Promise<AdvanceResult> => {
    const { db, engine, bus } = deps;
    const channel = execution.sessionId;

    // 1. Pull + persist + publish new activities since the stored cursor.
    const incoming = await engine.listActivities(
        execution.externalRef,
        execution.lastActivityCursor ?? undefined,
    );
    if (incoming.length > 0) {
        const persisted = await appendActivities(db, execution.id, incoming);
        for (const a of persisted) {
            await bus.publish(channel, {
                type: "activity",
                executionId: execution.id,
                id: a.id,
                seq: a.seq,
                at: a.at,
                source: a.source,
                kind: a.kind,
                text: a.text,
                data: a.data,
                cursor: a.cursor,
            });
        }
        await updateExecution(db, execution.id, {
            lastActivityCursor: persisted[persisted.length - 1].cursor,
        });
    }

    // 2. Apply any state transition (mirror to card + publish).
    const { state } = await engine.getStatus(execution.externalRef);
    if (state !== execution.state) {
        const resultPrUrl =
            state === "succeeded"
                ? ((await engine.getResult(execution.externalRef)).prUrl ??
                  null)
                : undefined;
        await updateExecution(db, execution.id, {
            state,
            ...(resultPrUrl === undefined ? {} : { resultPrUrl }),
        });
        const session = await getSessionById(db, execution.sessionId);
        if (session)
            await setCardStatus(db, session.cardId, EXEC_TO_CARD[state]);
        await bus.publish(channel, {
            type: "state",
            executionId: execution.id,
            state,
            resultPrUrl,
        });
    }

    return { newActivities: incoming.length, state };
};

export const pollActiveExecutions = async (
    deps: PollerDeps,
): Promise<AdvanceResult[]> => {
    const active = await listActiveExecutions(deps.db);
    const results: AdvanceResult[] = [];
    for (const execution of active) {
        results.push(await advanceExecution(deps, execution));
    }
    return results;
};
