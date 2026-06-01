import { UpdateBoardBody } from "@/lib/api/requests";
import { json, notFound, parseBody } from "@/lib/api/respond";
import { deleteBoard, moveBoard, renameBoard } from "@/lib/db/boards";
import { getBoardView } from "@/lib/db/boardView";
import { getDb } from "@/lib/db/client";

type Ctx = { params: Promise<{ boardId: string }> };

export const GET = async (
    _request: Request,
    { params }: Ctx,
): Promise<Response> => {
    const { boardId } = await params;
    const view = await getBoardView(getDb(), boardId);
    return view ? json(view) : notFound("Board not found");
};

export const PATCH = async (
    request: Request,
    { params }: Ctx,
): Promise<Response> => {
    const db = getDb();
    const { boardId } = await params;
    const parsed = await parseBody(request, UpdateBoardBody);
    if (!parsed.ok) return parsed.response;

    let board;
    if (parsed.data.name !== undefined)
        board = await renameBoard(db, boardId, parsed.data.name);
    if (parsed.data.sidebarOrder !== undefined)
        board = await moveBoard(db, boardId, parsed.data.sidebarOrder);
    return board ? json(board) : notFound("Board not found");
};

export const DELETE = async (
    _request: Request,
    { params }: Ctx,
): Promise<Response> => {
    const { boardId } = await params;
    await deleteBoard(getDb(), boardId);
    return json({ ok: true });
};
