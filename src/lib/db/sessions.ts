import { eq } from "drizzle-orm";

import type { Db } from "@/lib/db/client";
import { type PendingApproval, sessions } from "@/lib/db/schema";

export type Session = typeof sessions.$inferSelect;

export const getSessionByCard = async (
    db: Db,
    cardId: string,
): Promise<Session | undefined> => {
    const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.cardId, cardId));
    return session;
};

export const getSessionById = async (
    db: Db,
    id: string,
): Promise<Session | undefined> => {
    const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, id));
    return session;
};

/** Park a Brain tool call at the approval gate (Phase 2 persist-and-resume). */
export const setPendingApproval = async (
    db: Db,
    sessionId: string,
    pending: PendingApproval,
): Promise<void> => {
    await db
        .update(sessions)
        .set({ pendingApproval: pending })
        .where(eq(sessions.id, sessionId));
};

export const clearPendingApproval = async (
    db: Db,
    sessionId: string,
): Promise<void> => {
    await db
        .update(sessions)
        .set({ pendingApproval: null })
        .where(eq(sessions.id, sessionId));
};

/**
 * A card has exactly one session; create it on first use. Routing and other
 * fields fall back to the schema column defaults (claude/jules) for now —
 * Phase 3 will seed them from the resolved config.
 */
export const getOrCreateSessionForCard = async (
    db: Db,
    cardId: string,
): Promise<Session> => {
    const existing = await getSessionByCard(db, cardId);
    if (existing) return existing;
    const [created] = await db
        .insert(sessions)
        .values({ id: crypto.randomUUID(), cardId })
        .returning();
    return created;
};
