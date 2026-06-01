import { eq } from "drizzle-orm";

import type { Config } from "@/lib/core/schemas";
import type { Db } from "@/lib/db/client";
import { boards } from "@/lib/db/schema";

export type Board = typeof boards.$inferSelect;

export type NewBoardInput = {
    userId: string;
    name: string;
    position: number;
    sidebarOrder: number;
    defaultConfig?: Config;
};

/** Boards for the sidebar, in display order. */
export const listBoards = (db: Db): Promise<Board[]> =>
    db.select().from(boards).orderBy(boards.sidebarOrder);

export const createBoard = async (
    db: Db,
    input: NewBoardInput,
): Promise<Board | undefined> => {
    const [created] = await db
        .insert(boards)
        .values({
            id: crypto.randomUUID(),
            userId: input.userId,
            name: input.name,
            position: input.position,
            sidebarOrder: input.sidebarOrder,
            defaultConfig: input.defaultConfig ?? {},
        })
        .returning();
    return created;
};

export const renameBoard = async (
    db: Db,
    id: string,
    name: string,
): Promise<Board | undefined> => {
    const [updated] = await db
        .update(boards)
        .set({ name })
        .where(eq(boards.id, id))
        .returning();
    return updated;
};

/** Reposition a board within the sidebar (drag = a single-row update). */
export const moveBoard = async (
    db: Db,
    id: string,
    sidebarOrder: number,
): Promise<Board | undefined> => {
    const [updated] = await db
        .update(boards)
        .set({ sidebarOrder })
        .where(eq(boards.id, id))
        .returning();
    return updated;
};

export const deleteBoard = async (db: Db, id: string): Promise<void> => {
    await db.delete(boards).where(eq(boards.id, id));
};
