import { asc, eq, max } from "drizzle-orm";

import type { ContentBlock } from "@/lib/core/schemas";
import type { Db } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";

export type Message = typeof messages.$inferSelect;

export type NewMessage = {
    role: string;
    contentBlocks: ContentBlock[];
};

const maxSeq = async (db: Db, sessionId: string): Promise<number> => {
    const [row] = await db
        .select({ m: max(messages.seq) })
        .from(messages)
        .where(eq(messages.sessionId, sessionId));
    return row.m ?? 0;
};

/** Append a message to a session's transcript, assigning the next `seq`. */
export const appendMessage = async (
    db: Db,
    sessionId: string,
    message: NewMessage,
): Promise<Message> => {
    const seq = (await maxSeq(db, sessionId)) + 1;
    const [created] = await db
        .insert(messages)
        .values({
            id: crypto.randomUUID(),
            sessionId,
            role: message.role,
            contentBlocks: message.contentBlocks,
            seq,
        })
        .returning();
    return created;
};

export const listMessages = (db: Db, sessionId: string): Promise<Message[]> =>
    db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(asc(messages.seq));
