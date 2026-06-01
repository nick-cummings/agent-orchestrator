import { eq } from "drizzle-orm";

import type { Db } from "@/lib/db/client";
import { columns } from "@/lib/db/schema";

export type Column = typeof columns.$inferSelect;

export type NewColumnInput = {
    boardId: string;
    name: string;
    position: number;
};

/** Columns of a board, left to right. */
export const listColumnsByBoard = (
    db: Db,
    boardId: string,
): Promise<Column[]> =>
    db
        .select()
        .from(columns)
        .where(eq(columns.boardId, boardId))
        .orderBy(columns.position);

export const createColumn = async (
    db: Db,
    input: NewColumnInput,
): Promise<Column | undefined> => {
    const [created] = await db
        .insert(columns)
        .values({ id: crypto.randomUUID(), ...input })
        .returning();
    return created;
};

export const renameColumn = async (
    db: Db,
    id: string,
    name: string,
): Promise<Column | undefined> => {
    const [updated] = await db
        .update(columns)
        .set({ name })
        .where(eq(columns.id, id))
        .returning();
    return updated;
};

/** Reorder a column within its board (drag = single-row update). */
export const moveColumn = async (
    db: Db,
    id: string,
    position: number,
): Promise<Column | undefined> => {
    const [updated] = await db
        .update(columns)
        .set({ position })
        .where(eq(columns.id, id))
        .returning();
    return updated;
};

export const deleteColumn = async (db: Db, id: string): Promise<void> => {
    await db.delete(columns).where(eq(columns.id, id));
};
