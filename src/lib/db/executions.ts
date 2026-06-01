import { eq, notInArray } from "drizzle-orm";

import type { Db } from "@/lib/db/client";
import { executions } from "@/lib/db/schema";

export type Execution = typeof executions.$inferSelect;

export type NewExecutionInput = {
    sessionId: string;
    engine: string;
    externalRef: string;
    deepLinkUrl: string;
    prompt: string;
    state?: string;
};

/** Execution states the poller no longer needs to advance. */
export const TERMINAL_STATES = ["succeeded", "failed", "cancelled"];

export const createExecution = async (
    db: Db,
    input: NewExecutionInput,
): Promise<Execution | undefined> => {
    const [created] = await db
        .insert(executions)
        .values({ id: crypto.randomUUID(), ...input })
        .returning();
    return created;
};

export const getExecution = async (
    db: Db,
    id: string,
): Promise<Execution | undefined> => {
    const [execution] = await db
        .select()
        .from(executions)
        .where(eq(executions.id, id));
    return execution;
};

export const listExecutionsBySession = (
    db: Db,
    sessionId: string,
): Promise<Execution[]> =>
    db
        .select()
        .from(executions)
        .where(eq(executions.sessionId, sessionId))
        .orderBy(executions.createdAt);

/** Non-terminal executions — the set the poller sweeps. */
export const listActiveExecutions = (db: Db): Promise<Execution[]> =>
    db
        .select()
        .from(executions)
        .where(notInArray(executions.state, TERMINAL_STATES))
        .orderBy(executions.createdAt);

export type ExecutionPatch = {
    state?: string;
    lastActivityCursor?: string | null;
    resultPrUrl?: string | null;
};

/** Apply a state/cursor/result patch and bump `updatedAt`. */
export const updateExecution = async (
    db: Db,
    id: string,
    patch: ExecutionPatch,
): Promise<Execution | undefined> => {
    const [updated] = await db
        .update(executions)
        .set({ ...patch, updatedAt: new Date().toISOString() })
        .where(eq(executions.id, id))
        .returning();
    return updated;
};
