import { error, json, notFound } from "@/lib/api/respond";
import { resolveJulesCredential } from "@/lib/creds/jules";
import { getDb } from "@/lib/db/client";
import { getExecution } from "@/lib/db/executions";
import { getEngine } from "@/lib/server/engine";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ executionId: string }> };

/** Approve a plan the Engine is awaiting (the tap behind `awaiting_plan_approval`). */
export const POST = async (
    _request: Request,
    { params }: Ctx,
): Promise<Response> => {
    const { executionId } = await params;
    const execution = await getExecution(getDb(), executionId);
    if (!execution) return notFound("Execution not found");

    const engine = getEngine();
    if (!engine.approvePlan) {
        return error("Engine does not support plan approval", 400);
    }
    await engine.approvePlan(execution.externalRef, resolveJulesCredential());
    return json({ ok: true });
};
