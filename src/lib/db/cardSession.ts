import { type Activity, listActivities } from "@/lib/db/activities";
import type { Db } from "@/lib/db/client";
import { type Execution, listExecutionsBySession } from "@/lib/db/executions";
import { getSessionByCard, type Session } from "@/lib/db/sessions";

/**
 * The card session read model: the card's session (if any) with its executions,
 * each carrying its activity feed. Returned whole for initial render before the
 * SSE tail takes over (mirrors `boardView.ts`). `session` is null until the
 * card first starts a task.
 */

export type ExecutionWithActivities = Execution & { activities: Activity[] };
export type CardSessionView = {
    session: Session | null;
    executions: ExecutionWithActivities[];
};

export const getCardSession = async (
    db: Db,
    cardId: string,
): Promise<CardSessionView> => {
    const session = await getSessionByCard(db, cardId);
    if (!session) return { session: null, executions: [] };

    const executions = await listExecutionsBySession(db, session.id);
    const withActivities = await Promise.all(
        executions.map(async (execution) => ({
            ...execution,
            activities: await listActivities(db, execution.id),
        })),
    );
    return { session, executions: withActivities };
};
