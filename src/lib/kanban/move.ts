import type { BoardView } from "@/lib/db/boardView";
import { rankForIndex } from "@/lib/ordering";

/**
 * Translate a drag-and-drop result into a single card move (target column +
 * new rank). Pure over the current board view, so the dnd-kit `onDragEnd`
 * handler stays a thin call and this is what the tests pin down. `overId` is
 * either a card id (drop relative to that card) or a column id (drop into that
 * column's empty space / end). Returns null when there's nothing to do.
 */

export type CardMove = { columnId: string; position: number };

export const planCardMove = (
    view: BoardView,
    activeId: string,
    overId: string,
): CardMove | null => {
    if (activeId === overId) return null;

    const source = view.columns.find((col) =>
        col.cards.some((c) => c.id === activeId),
    );
    if (!source) return null;

    const overColumn = view.columns.find((col) => col.id === overId);
    const dest =
        overColumn ??
        view.columns.find((col) => col.cards.some((c) => c.id === overId));
    if (!dest) return null;

    // Ranks of the destination's *other* cards (active removed), in order.
    const others = dest.cards.filter((c) => c.id !== activeId);
    const index = overColumn
        ? others.length
        : others.findIndex((c) => c.id === overId);
    const target = index === -1 ? others.length : index;

    return {
        columnId: dest.id,
        position: rankForIndex(
            others.map((c) => c.position),
            target,
        ),
    };
};

/**
 * The wiring a drag end resolves to: which card moves and where. Folds in the
 * "nothing loaded / nothing hovered / no-op" guards so the component's
 * `onDragEnd` is a one-liner. Returns null when there's nothing to persist.
 */
export const resolveDragMove = (
    data: BoardView | undefined,
    activeId: string,
    overId: string | null,
): { cardId: string; move: CardMove } | null => {
    if (!data || overId === null) return null;
    const move = planCardMove(data, activeId, overId);
    return move ? { cardId: activeId, move } : null;
};
