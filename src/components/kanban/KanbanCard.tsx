"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";

import type { Card } from "@/lib/db/cards";

type KanbanCardProps = {
    card: Card;
    onRename: (id: string, title: string) => void;
    onDelete: (id: string) => void;
};

/**
 * A draggable card face. Double-click the title to rename inline; the drag
 * listeners attach to the card body, so the edit input and delete button stay
 * usable without starting a drag. Movement maths live in lib/kanban — this
 * component only renders and reports intent.
 */
export const KanbanCard = ({ card, onRename, onDelete }: KanbanCardProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: card.id });
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(card.title);

    const commit = () => {
        const trimmed = draft.trim();
        if (trimmed.length > 0 && trimmed !== card.title)
            onRename(card.id, trimmed);
        else setDraft(card.title);
        setEditing(false);
    };

    return (
        <li
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? 0.5 : 1,
            }}
            className="group flex items-start justify-between gap-2 rounded-lg border border-line bg-card p-2 shadow-sm"
        >
            {editing ? (
                <input
                    autoFocus
                    aria-label="Card title"
                    value={draft}
                    onChange={(e) => {
                        setDraft(e.target.value);
                    }}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") commit();
                        if (e.key === "Escape") {
                            setDraft(card.title);
                            setEditing(false);
                        }
                    }}
                    className="w-full rounded border border-line bg-card px-1 text-sm text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                />
            ) : (
                <span
                    {...attributes}
                    {...listeners}
                    onDoubleClick={() => {
                        setEditing(true);
                    }}
                    className="flex-1 cursor-grab text-sm text-primary"
                >
                    {card.title}
                </span>
            )}
            <button
                type="button"
                aria-label={`Delete ${card.title}`}
                onClick={() => {
                    onDelete(card.id);
                }}
                className="shrink-0 rounded px-1 text-xs text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
                ✕
            </button>
        </li>
    );
};
