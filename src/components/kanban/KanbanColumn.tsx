"use client";

import {
    SortableContext,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { useState } from "react";

import { InlineCreate } from "@/components/kanban/InlineCreate";
import { KanbanCard } from "@/components/kanban/KanbanCard";
import type { ColumnWithCards } from "@/lib/db/boardView";

type KanbanColumnProps = {
    column: ColumnWithCards;
    onRenameColumn: (id: string, name: string) => void;
    onDeleteColumn: (id: string) => void;
    onAddCard: (columnId: string, title: string) => void;
    onRenameCard: (id: string, title: string) => void;
    onDeleteCard: (id: string) => void;
};

/** One status lane: a droppable target wrapping its sortable cards. */
export const KanbanColumn = ({
    column,
    onRenameColumn,
    onDeleteColumn,
    onAddCard,
    onRenameCard,
    onDeleteCard,
}: KanbanColumnProps) => {
    const { setNodeRef } = useDroppable({ id: column.id });
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(column.name);

    const commit = () => {
        const trimmed = draft.trim();
        if (trimmed.length > 0 && trimmed !== column.name)
            onRenameColumn(column.id, trimmed);
        else setDraft(column.name);
        setEditing(false);
    };

    return (
        <section className="flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-surface p-3">
            <header className="flex items-center justify-between gap-2">
                {editing ? (
                    <input
                        autoFocus
                        aria-label="Column name"
                        value={draft}
                        onChange={(e) => {
                            setDraft(e.target.value);
                        }}
                        onBlur={commit}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commit();
                            if (e.key === "Escape") {
                                setDraft(column.name);
                                setEditing(false);
                            }
                        }}
                        className="w-full rounded border border-line bg-card px-1 text-sm font-medium text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    />
                ) : (
                    <h2
                        onDoubleClick={() => {
                            setEditing(true);
                        }}
                        className="text-sm font-medium text-primary"
                    >
                        {column.name}{" "}
                        <span className="text-muted">
                            {column.cards.length}
                        </span>
                    </h2>
                )}
                <button
                    type="button"
                    aria-label={`Delete column ${column.name}`}
                    onClick={() => {
                        onDeleteColumn(column.id);
                    }}
                    className="shrink-0 rounded px-1 text-xs text-muted hover:text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                    ✕
                </button>
            </header>

            <ul ref={setNodeRef} className="flex min-h-2 flex-col gap-2">
                <SortableContext
                    items={column.cards.map((c) => c.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {column.cards.map((card) => (
                        <KanbanCard
                            key={card.id}
                            card={card}
                            onRename={onRenameCard}
                            onDelete={onDeleteCard}
                        />
                    ))}
                </SortableContext>
            </ul>

            <InlineCreate
                label="+ Add card"
                placeholder="Card title"
                onCreate={(title) => {
                    onAddCard(column.id, title);
                }}
            />
        </section>
    );
};
