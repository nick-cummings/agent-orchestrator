import { ApprovalDecisionBody } from "@/lib/api/requests";
import { json, parseBody } from "@/lib/api/respond";
import { resumeTurn } from "@/lib/agent/turn";
import { getDb } from "@/lib/db/client";
import { buildTurnDeps } from "@/lib/server/turnDeps";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ sessionId: string }> };

/** Approve or reject the tool call parked at the approval gate, then resume the
 *  loop from the extended transcript (persist-and-resume). */
export const POST = async (
    request: Request,
    { params }: Ctx,
): Promise<Response> => {
    const db = getDb();
    const { sessionId } = await params;
    const parsed = await parseBody(request, ApprovalDecisionBody);
    if (!parsed.ok) return parsed.response;

    await resumeTurn(
        buildTurnDeps(db, sessionId),
        sessionId,
        parsed.data.decision,
    );
    return json({ ok: true });
};
