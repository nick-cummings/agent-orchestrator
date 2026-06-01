import { CreateColumnBody } from "@/lib/api/requests";
import { json, parseBody } from "@/lib/api/respond";
import { getDb } from "@/lib/db/client";
import { createColumn, listColumnsByBoard } from "@/lib/db/columns";
import { nextRank } from "@/lib/ordering";

export const POST = async (request: Request): Promise<Response> => {
    const db = getDb();
    const parsed = await parseBody(request, CreateColumnBody);
    if (!parsed.ok) return parsed.response;

    const existing = await listColumnsByBoard(db, parsed.data.boardId);
    const column = await createColumn(db, {
        boardId: parsed.data.boardId,
        name: parsed.data.name,
        position: nextRank(existing.map((c) => c.position)),
    });
    return json(column, 201);
};
