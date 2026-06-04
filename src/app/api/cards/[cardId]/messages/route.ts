import { ChatMessageBody } from "@/lib/api/requests";
import { json, parseBody } from "@/lib/api/respond";
import { runSessionTurn } from "@/lib/agent/turn";
import { getDb } from "@/lib/db/client";
import { getOrCreateSessionForCard } from "@/lib/db/sessions";
import { buildTurnDeps } from "@/lib/server/turnDeps";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ cardId: string }> };

/**
 * A chat turn: ensure the card's session, then run the agent loop. The turn
 * streams to the session's realtime channel (the open SSE delivers it); this
 * returns when the turn ends or pauses for approval.
 */
export const POST = async (
    request: Request,
    { params }: Ctx,
): Promise<Response> => {
    const db = getDb();
    const { cardId } = await params;
    const parsed = await parseBody(request, ChatMessageBody);
    if (!parsed.ok) return parsed.response;

    const session = await getOrCreateSessionForCard(db, cardId);
    await runSessionTurn(
        buildTurnDeps(db, session.id),
        session.id,
        parsed.data.text,
    );
    return json({ ok: true });
};
