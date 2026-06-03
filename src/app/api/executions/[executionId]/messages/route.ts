import { SendMessageBody } from "@/lib/api/requests";
import { json, notFound, parseBody } from "@/lib/api/respond";
import { resolveJulesCredential } from "@/lib/creds/jules";
import { getDb } from "@/lib/db/client";
import { getExecution } from "@/lib/db/executions";
import { getEngine } from "@/lib/server/engine";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ executionId: string }> };

/** Steer a running execution (the Engine's sendMessage). The guidance shows up
 *  in the activity feed on the next poll. */
export const POST = async (
    request: Request,
    { params }: Ctx,
): Promise<Response> => {
    const { executionId } = await params;
    const parsed = await parseBody(request, SendMessageBody);
    if (!parsed.ok) return parsed.response;

    const execution = await getExecution(getDb(), executionId);
    if (!execution) return notFound("Execution not found");

    await getEngine().sendMessage(
        execution.externalRef,
        parsed.data.text,
        resolveJulesCredential(),
    );
    return json({ ok: true });
};
