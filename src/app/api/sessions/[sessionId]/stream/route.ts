import { listActivitiesSince } from "@/lib/db/activities";
import { getDb } from "@/lib/db/client";
import { listExecutionsBySession } from "@/lib/db/executions";
import { getBus } from "@/lib/realtime";
import { activityRowToEvent, sseChunk, sseComment } from "@/lib/realtime/sse";

// Long-lived stream with a Redis subscriber → Node runtime, never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

type Ctx = { params: Promise<{ sessionId: string }> };

/**
 * SSE for a session: replay activities newer than the client's cursor
 * (`?since=` / `Last-Event-ID`) from Postgres, then tail the realtime bus.
 * Heartbeat comments keep proxies from closing the connection; the request's
 * abort signal tears everything down on disconnect.
 */
export const GET = async (
    request: Request,
    { params }: Ctx,
): Promise<Response> => {
    const { sessionId } = await params;
    const db = getDb();
    const since = Number(
        new URL(request.url).searchParams.get("since") ??
            request.headers.get("last-event-id") ??
            0,
    );
    const bus = getBus();
    const encoder = new TextEncoder();
    const { signal } = request;

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let closed = false;
            const send = (chunk: string) => {
                if (!closed) controller.enqueue(encoder.encode(chunk));
            };
            const heartbeat = setInterval(() => {
                send(sseComment());
            }, HEARTBEAT_MS);
            const finish = () => {
                if (closed) return;
                closed = true;
                clearInterval(heartbeat);
                controller.close();
            };

            const run = async () => {
                // Replay missed activities across the session's executions.
                for (const execution of await listExecutionsBySession(
                    db,
                    sessionId,
                )) {
                    for (const row of await listActivitiesSince(
                        db,
                        execution.id,
                        since,
                    )) {
                        send(sseChunk(activityRowToEvent(row)));
                    }
                }
                send(sseComment("connected"));
                // Tail live events until the client disconnects.
                for await (const event of bus.subscribe(sessionId, signal)) {
                    send(sseChunk(event));
                }
            };

            run()
                .catch(() => undefined)
                .finally(finish);
        },
    });

    return new Response(stream, {
        headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache, no-transform",
            connection: "keep-alive",
        },
    });
};
