import { StartExecutionBody } from "@/lib/api/requests";
import { json, parseBody } from "@/lib/api/respond";
import { resolveJulesCredential } from "@/lib/creds/jules";
import { setCardStatus } from "@/lib/db/cards";
import { getDb } from "@/lib/db/client";
import { createExecution } from "@/lib/db/executions";
import { getOrCreateSessionForCard } from "@/lib/db/sessions";
import { getEngine } from "@/lib/server/engine";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ cardId: string }> };

/** Start a cloud coding task on a card: ensure its session exists, kick off the
 *  Engine, persist the Execution, and reflect "running" on the card face. */
export const POST = async (
    request: Request,
    { params }: Ctx,
): Promise<Response> => {
    const db = getDb();
    const { cardId } = await params;
    const parsed = await parseBody(request, StartExecutionBody);
    if (!parsed.ok) return parsed.response;
    const { prompt, repo, requirePlanApproval } = parsed.data;

    const session = await getOrCreateSessionForCard(db, cardId);
    const engine = getEngine();
    const handle = await engine.start(
        {
            repo: {
                connectionId: "local",
                repoUrl: `https://github.com/${repo.owner}/${repo.name}`,
                branch: repo.branch,
            },
            prompt,
            requirePlanApproval,
        },
        resolveJulesCredential(),
    );

    const execution = await createExecution(db, {
        sessionId: session.id,
        engine: engine.id,
        externalRef: handle.externalRef,
        deepLinkUrl: handle.deepLink,
        prompt,
    });
    await setCardStatus(db, cardId, "running");
    return json(execution, 201);
};
