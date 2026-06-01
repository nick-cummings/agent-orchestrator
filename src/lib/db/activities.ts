import { and, asc, eq, gt, max } from "drizzle-orm";

import type { Db } from "@/lib/db/client";
import { activities } from "@/lib/db/schema";

export type Activity = typeof activities.$inferSelect;

export type NewActivity = {
    at: string;
    source: string;
    kind: string;
    text?: string | null;
    data?: unknown;
    cursor: string;
};

const maxSeq = async (db: Db, executionId: string): Promise<number> => {
    const [row] = await db
        .select({ m: max(activities.seq) })
        .from(activities)
        .where(eq(activities.executionId, executionId));
    return row.m ?? 0;
};

/**
 * Append normalized activities to an execution, assigning monotonic `seq`
 * values after the current maximum. Returns the inserted rows in `seq` order.
 */
export const appendActivities = async (
    db: Db,
    executionId: string,
    items: NewActivity[],
): Promise<Activity[]> => {
    if (items.length === 0) return [];
    const base = await maxSeq(db, executionId);
    const rows = items.map((item, i) => ({
        id: crypto.randomUUID(),
        executionId,
        seq: base + i + 1,
        at: item.at,
        source: item.source,
        kind: item.kind,
        text: item.text ?? null,
        data: item.data ?? null,
        cursor: item.cursor,
    }));
    return db.insert(activities).values(rows).returning();
};

export const listActivities = (
    db: Db,
    executionId: string,
): Promise<Activity[]> =>
    db
        .select()
        .from(activities)
        .where(eq(activities.executionId, executionId))
        .orderBy(asc(activities.seq));

/** Activities after `sinceSeq` — powers SSE replay from a client cursor. */
export const listActivitiesSince = (
    db: Db,
    executionId: string,
    sinceSeq: number,
): Promise<Activity[]> =>
    db
        .select()
        .from(activities)
        .where(
            and(
                eq(activities.executionId, executionId),
                gt(activities.seq, sinceSeq),
            ),
        )
        .orderBy(asc(activities.seq));
