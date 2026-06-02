import type { ExecutionState, NormalizedActivity } from "@/lib/core/schemas";

import type { JulesActivity, JulesSession } from "./wire";

/**
 * Pure mappers from Jules wire shapes to our domain. The only place Jules
 * vocabulary turns into ours; unit-tested with fixtures so the engine factory
 * stays thin.
 */

const STATE_MAP: Record<string, ExecutionState> = {
    QUEUED: "starting",
    PLANNING: "planning",
    AWAITING_PLAN_APPROVAL: "awaiting_plan_approval",
    AWAITING_USER_FEEDBACK: "awaiting_feedback",
    IN_PROGRESS: "running",
    PAUSED: "running",
    FAILED: "failed",
    COMPLETED: "succeeded",
};

/** Unknown/missing states map to `running` (non-terminal) so the poller keeps
 *  advancing rather than crashing on an unrecognized vendor state. */
export const toExecutionState = (state: string | undefined): ExecutionState =>
    state && state in STATE_MAP ? STATE_MAP[state] : "running";

const sourceOf = (
    originator: string | undefined,
): NormalizedActivity["source"] => {
    if (originator === "user") return "user";
    if (originator === "agent") return "agent";
    return "system";
};

const kindOf = (a: JulesActivity): NormalizedActivity["kind"] => {
    if (a.planGenerated || a.planApproved) return "plan";
    if (a.agentMessaged || a.userMessaged) return "message";
    if (a.progressUpdated) return "progress";
    if (a.sessionCompleted || a.sessionFailed) return "result";
    if (a.artifacts?.some((x) => x.changeSet)) return "code_change";
    if (a.artifacts?.some((x) => x.bashOutput)) return "tool";
    return "progress";
};

const textOf = (a: JulesActivity): string | undefined =>
    a.agentMessaged?.agentMessage ??
    a.userMessaged?.userMessage ??
    a.progressUpdated?.title ??
    a.sessionFailed?.reason ??
    a.description;

/** Compound, lexicographically-orderable cursor (fixed-format ISO time + id),
 *  so the poller can advance past already-seen activities even when several
 *  share a `createTime`. */
const cursorOf = (a: JulesActivity): string =>
    `${a.createTime ?? ""}::${a.id ?? a.name ?? ""}`;

export const toDomainActivity = (a: JulesActivity): NormalizedActivity => ({
    at: a.createTime ?? "",
    source: sourceOf(a.originator),
    kind: kindOf(a),
    text: textOf(a),
    data: a,
    cursor: cursorOf(a),
});

/** The PR URL lives in `session.outputs` once completed; scan for it. */
export const extractPrUrl = (session: JulesSession): string | undefined => {
    if (!session.outputs || session.outputs.length === 0) return undefined;
    const match = /https:\/\/github\.com\/[^"\s]+?\/pull\/\d+/.exec(
        JSON.stringify(session.outputs),
    );
    return match?.[0];
};
