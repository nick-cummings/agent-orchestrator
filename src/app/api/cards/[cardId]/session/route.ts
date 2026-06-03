import { json } from "@/lib/api/respond";
import { getCardSession } from "@/lib/db/cardSession";
import { getDb } from "@/lib/db/client";

type Ctx = { params: Promise<{ cardId: string }> };

/** The card's session read model (session + executions + activities) for the
 *  initial render; the SSE stream tails live updates from there. */
export const GET = async (
    _request: Request,
    { params }: Ctx,
): Promise<Response> => {
    const { cardId } = await params;
    return json(await getCardSession(getDb(), cardId));
};
