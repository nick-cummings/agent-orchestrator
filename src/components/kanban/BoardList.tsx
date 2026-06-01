"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { InlineCreate } from "@/components/kanban/InlineCreate";
import * as api from "@/lib/api/client";

/**
 * The boards index (sidebar / home): lists boards and creates new ones. Each
 * board links to its kanban screen. Thin — data access goes through the typed
 * API client, which the integration test mocks.
 */
export const BoardList = () => {
    const queryClient = useQueryClient();
    const boards = useQuery({ queryKey: ["boards"], queryFn: api.fetchBoards });
    const create = useMutation({
        mutationFn: (body: { name: string }) => api.createBoard(body),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: ["boards"] }),
    });

    const renderBoards = () => {
        if (boards.isPending) return <p className="text-muted">Loading…</p>;
        if (boards.isError)
            return <p className="text-muted">Could not load boards.</p>;
        if (boards.data.length === 0)
            return (
                <p className="text-muted">No boards yet — create one below.</p>
            );
        return (
            <ul className="flex flex-col gap-2">
                {boards.data.map((board) => (
                    <li key={board.id}>
                        <Link
                            href={`/board/${board.id}`}
                            className="block rounded-lg border border-line bg-card px-3 py-2 text-primary hover:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                        >
                            {board.name}
                        </Link>
                    </li>
                ))}
            </ul>
        );
    };

    return (
        <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
            <h1 className="text-xl font-semibold text-primary">Boards</h1>

            {renderBoards()}

            <InlineCreate
                label="+ New board"
                placeholder="Board name"
                onCreate={(name) => {
                    create.mutate({ name });
                }}
            />
        </main>
    );
};
