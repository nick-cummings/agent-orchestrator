"use client";

import {
    DndContext,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { InlineCreate } from "@/components/kanban/InlineCreate";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import * as api from "@/lib/api/client";
import type { BoardView as BoardViewData } from "@/lib/db/boardView";
import { resolveDragMove } from "@/lib/kanban/move";

/**
 * The board screen: fetches the board read model, renders its columns, and
 * turns user actions into API mutations that re-fetch on settle. Drag maths
 * are delegated to `planCardMove` (pure, unit-tested); this component owns the
 * data wiring the integration tests assert.
 */
export const BoardView = ({ boardId }: { boardId: string }) => {
    const queryClient = useQueryClient();
    const key = ["board", boardId];
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    );

    const board = useQuery({
        queryKey: key,
        queryFn: () => api.fetchBoardView(boardId),
    });

    const refetch = () => queryClient.invalidateQueries({ queryKey: key });
    // Custom hook (use-prefixed so rules-of-hooks accepts it): wraps an API
    // call as a mutation that re-fetches the board on success.
    const useAction = <Args extends unknown[]>(
        fn: (...a: Args) => Promise<unknown>,
    ) => useMutation({ mutationFn: (a: Args) => fn(...a), onSuccess: refetch });

    const addColumn = useAction(api.createColumn);
    const renameColumn = useAction(api.updateColumn);
    const removeColumn = useAction(api.deleteColumn);
    const addCard = useAction(api.createCard);
    const renameCard = useAction(api.updateCard);
    const removeCard = useAction(api.deleteCard);
    const move = useAction(api.moveCard);

    const onDragEnd = (event: DragEndEvent) => {
        const overId = event.over ? String(event.over.id) : null;
        const result = resolveDragMove(
            board.data,
            String(event.active.id),
            overId,
        );
        if (result) move.mutate([result.cardId, result.move]);
    };

    if (board.isPending)
        return <p className="p-6 text-muted">Loading board…</p>;
    if (board.isError)
        return <p className="p-6 text-muted">Could not load this board.</p>;

    const data: BoardViewData = board.data;

    return (
        <div className="flex flex-col gap-4 p-6">
            <h1 className="text-xl font-semibold text-primary">
                {data.board.name}
            </h1>
            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                <div className="flex items-start gap-4 overflow-x-auto pb-2">
                    {data.columns.map((column) => (
                        <KanbanColumn
                            key={column.id}
                            column={column}
                            onRenameColumn={(id, name) => {
                                renameColumn.mutate([id, { name }]);
                            }}
                            onDeleteColumn={(id) => {
                                removeColumn.mutate([id]);
                            }}
                            onAddCard={(columnId, title) => {
                                addCard.mutate([{ columnId, title }]);
                            }}
                            onRenameCard={(id, title) => {
                                renameCard.mutate([id, { title }]);
                            }}
                            onDeleteCard={(id) => {
                                removeCard.mutate([id]);
                            }}
                        />
                    ))}
                    <div className="w-72 shrink-0">
                        <InlineCreate
                            label="+ Add column"
                            placeholder="Column name"
                            onCreate={(name) => {
                                addColumn.mutate([{ boardId, name }]);
                            }}
                        />
                    </div>
                </div>
            </DndContext>
        </div>
    );
};
