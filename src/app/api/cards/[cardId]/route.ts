import { UpdateCardBody } from "@/lib/api/requests";
import { json, notFound, parseBody } from "@/lib/api/respond";
import { deleteCard, updateCard } from "@/lib/db/cards";
import { getDb } from "@/lib/db/client";

type Ctx = { params: Promise<{ cardId: string }> };

export const PATCH = async (
    request: Request,
    { params }: Ctx,
): Promise<Response> => {
    const { cardId } = await params;
    const parsed = await parseBody(request, UpdateCardBody);
    if (!parsed.ok) return parsed.response;

    const card = await updateCard(getDb(), cardId, parsed.data);
    return card ? json(card) : notFound("Card not found");
};

export const DELETE = async (
    _request: Request,
    { params }: Ctx,
): Promise<Response> => {
    const { cardId } = await params;
    await deleteCard(getDb(), cardId);
    return json({ ok: true });
};
