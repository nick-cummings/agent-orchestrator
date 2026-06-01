import { CreateBoardBody } from "@/lib/api/requests";
import { json, parseBody } from "@/lib/api/respond";
import { createBoard, listBoards } from "@/lib/db/boards";
import { getDb } from "@/lib/db/client";
import { nextRank } from "@/lib/ordering";

// Single-user for now — a fixed owner id is the seam auth replaces later.
const USER_ID = "local";

export const GET = async (): Promise<Response> =>
    json(await listBoards(getDb()));

export const POST = async (request: Request): Promise<Response> => {
    const db = getDb();
    const parsed = await parseBody(request, CreateBoardBody);
    if (!parsed.ok) return parsed.response;

    const existing = await listBoards(db);
    const board = await createBoard(db, {
        userId: USER_ID,
        name: parsed.data.name,
        position: nextRank(existing.map((b) => b.position)),
        sidebarOrder: nextRank(existing.map((b) => b.sidebarOrder)),
    });
    return json(board, 201);
};
