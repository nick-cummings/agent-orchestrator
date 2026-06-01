import { MoveCardBody } from "@/lib/api/requests";
import { json, notFound, parseBody } from "@/lib/api/respond";
import { moveCard } from "@/lib/db/cards";
import { getDb } from "@/lib/db/client";

type Ctx = { params: Promise<{ cardId: string }> };

export const POST = async (
    request: Request,
    { params }: Ctx,
): Promise<Response> => {
    const { cardId } = await params;
    const parsed = await parseBody(request, MoveCardBody);
    if (!parsed.ok) return parsed.response;

    const card = await moveCard(
        getDb(),
        cardId,
        parsed.data.columnId,
        parsed.data.position,
    );
    return card ? json(card) : notFound("Card not found");
};
