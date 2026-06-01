import { UpdateColumnBody } from "@/lib/api/requests";
import { json, notFound, parseBody } from "@/lib/api/respond";
import { getDb } from "@/lib/db/client";
import { deleteColumn, moveColumn, renameColumn } from "@/lib/db/columns";

type Ctx = { params: Promise<{ columnId: string }> };

export const PATCH = async (
    request: Request,
    { params }: Ctx,
): Promise<Response> => {
    const db = getDb();
    const { columnId } = await params;
    const parsed = await parseBody(request, UpdateColumnBody);
    if (!parsed.ok) return parsed.response;

    let column;
    if (parsed.data.name !== undefined)
        column = await renameColumn(db, columnId, parsed.data.name);
    if (parsed.data.position !== undefined)
        column = await moveColumn(db, columnId, parsed.data.position);
    return column ? json(column) : notFound("Column not found");
};

export const DELETE = async (
    _request: Request,
    { params }: Ctx,
): Promise<Response> => {
    const { columnId } = await params;
    await deleteColumn(getDb(), columnId);
    return json({ ok: true });
};
