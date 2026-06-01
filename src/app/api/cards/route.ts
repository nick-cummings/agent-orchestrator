import { CreateCardBody } from "@/lib/api/requests";
import { json, parseBody } from "@/lib/api/respond";
import { createCard, listCardsByColumn } from "@/lib/db/cards";
import { getDb } from "@/lib/db/client";
import { nextRank } from "@/lib/ordering";

export const POST = async (request: Request): Promise<Response> => {
    const db = getDb();
    const parsed = await parseBody(request, CreateCardBody);
    if (!parsed.ok) return parsed.response;

    const existing = await listCardsByColumn(db, parsed.data.columnId);
    const card = await createCard(db, {
        columnId: parsed.data.columnId,
        title: parsed.data.title,
        position: nextRank(existing.map((c) => c.position)),
    });
    return json(card, 201);
};
