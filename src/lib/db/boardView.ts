import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Db } from "@/lib/db/client";
import { boards, cards, columns } from "@/lib/db/schema";

import type { Board } from "@/lib/db/boards";
import type { Card } from "@/lib/db/cards";
import type { Column } from "@/lib/db/columns";

/**
 * The kanban read model: a board with its columns (left→right) and each
 * column's non-archived cards (top→bottom). One aggregate the board route
 * returns whole, so the client renders without a request waterfall. Lives in
 * lib/ (delegated to, tested against PGlite) — the route handler stays thin.
 */

export type ColumnWithCards = Column & { cards: Card[] };
export type BoardView = { board: Board; columns: ColumnWithCards[] };

export const getBoardView = async (
    db: Db,
    boardId: string,
): Promise<BoardView | undefined> => {
    const found = await db.select().from(boards).where(eq(boards.id, boardId));
    if (found.length === 0) return undefined;
    const board = found[0];

    const boardColumns = await db
        .select()
        .from(columns)
        .where(eq(columns.boardId, boardId))
        .orderBy(columns.position);

    const columnIds = boardColumns.map((c) => c.id);
    const boardCards =
        columnIds.length > 0
            ? await db
                  .select()
                  .from(cards)
                  .where(
                      and(
                          inArray(cards.columnId, columnIds),
                          isNull(cards.archivedAt),
                      ),
                  )
                  .orderBy(cards.position)
            : [];

    const byColumn = new Map<string, Card[]>(columnIds.map((id) => [id, []]));
    for (const card of boardCards) byColumn.get(card.columnId)?.push(card);

    return {
        board,
        columns: boardColumns.map((column) => ({
            ...column,
            cards: byColumn.get(column.id) ?? [],
        })),
    };
};
