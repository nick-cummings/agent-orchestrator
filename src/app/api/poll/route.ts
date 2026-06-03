import { error, json } from "@/lib/api/respond";
import { getDb } from "@/lib/db/client";
import { pollActiveExecutions } from "@/lib/poller/advance";
import { getBus } from "@/lib/realtime";
import { getEngine } from "@/lib/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron sweep: advance every active execution (pull from the Engine, persist,
 * publish). Vercel Cron hits this on a schedule (see vercel.json) and sends
 * `CRON_SECRET` as a Bearer token. With no secret set, the route is open —
 * local dev only.
 */
export const GET = async (request: Request): Promise<Response> => {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
        return error("Unauthorized", 401);
    }
    const results = await pollActiveExecutions({
        db: getDb(),
        engine: getEngine(),
        bus: getBus(),
    });
    return json({ polled: results.length });
};
