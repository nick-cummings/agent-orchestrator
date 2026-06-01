import Link from "next/link";

import { BoardView } from "@/components/kanban/BoardView";

type PageProps = { params: Promise<{ boardId: string }> };

export default async function BoardPage({ params }: PageProps) {
    const { boardId } = await params;
    return (
        <div className="flex flex-col">
            <nav className="px-6 pt-4">
                <Link
                    href="/"
                    className="text-sm text-muted hover:text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                    ← Boards
                </Link>
            </nav>
            <BoardView boardId={boardId} />
        </div>
    );
}
