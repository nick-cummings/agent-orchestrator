import { and, eq, isNull } from "drizzle-orm";

import { cardTitle } from "@/lib/format";
import type { Db } from "@/lib/db/client";
import { cards } from "@/lib/db/schema";

export type Card = typeof cards.$inferSelect;

export type NewCardInput = {
    columnId: string;
    /** Optional opening title; falls back to a renamable placeholder. */
    title?: string;
    position: number;
};

export type CardEdit = {
    title?: string;
    description?: string | null;
};

/** Non-archived cards of a column, top to bottom. */
export const listCardsByColumn = (db: Db, columnId: string): Promise<Card[]> =>
    db
        .select()
        .from(cards)
        .where(and(eq(cards.columnId, columnId), isNull(cards.archivedAt)))
        .orderBy(cards.position);

export const createCard = async (
    db: Db,
    input: NewCardInput,
): Promise<Card | undefined> => {
    const [created] = await db
        .insert(cards)
        .values({
            id: crypto.randomUUID(),
            columnId: input.columnId,
            title: cardTitle(input.title ?? ""),
            position: input.position,
        })
        .returning();
    return created;
};

/** Edit a card. Setting a title marks it user-set (stops auto-suggestions). */
export const updateCard = async (
    db: Db,
    id: string,
    edit: CardEdit,
): Promise<Card | undefined> => {
    const patch: Partial<typeof cards.$inferInsert> = {};
    if (edit.title !== undefined) {
        patch.title = edit.title;
        patch.titleSetByUser = true;
    }
    if (edit.description !== undefined) patch.description = edit.description;

    const [updated] = await db
        .update(cards)
        .set(patch)
        .where(eq(cards.id, id))
        .returning();
    return updated;
};

/** Move a card between/within columns (re-status or reorder). */
export const moveCard = async (
    db: Db,
    id: string,
    columnId: string,
    position: number,
): Promise<Card | undefined> => {
    const [updated] = await db
        .update(cards)
        .set({ columnId, position })
        .where(eq(cards.id, id))
        .returning();
    return updated;
};

export const archiveCard = async (
    db: Db,
    id: string,
    at: string,
): Promise<Card | undefined> => {
    const [updated] = await db
        .update(cards)
        .set({ archivedAt: at })
        .where(eq(cards.id, id))
        .returning();
    return updated;
};

export const deleteCard = async (db: Db, id: string): Promise<void> => {
    await db.delete(cards).where(eq(cards.id, id));
};
