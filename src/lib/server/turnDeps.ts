import { engineTools } from "@/lib/agent/engineTools";
import type { TurnDeps } from "@/lib/agent/turn";
import { resolveJulesCredential } from "@/lib/creds/jules";
import type { Db } from "@/lib/db/client";
import { getBus } from "@/lib/realtime";
import { getBrain } from "@/lib/server/brain";
import { getEngine } from "@/lib/server/engine";

/**
 * Assemble the turn service's dependencies for a session: the env-composed Brain
 * and Engine, the engine-backed tool registry, and the realtime bus. The routes
 * call this; tests inject their own `TurnDeps` directly.
 */
export const buildTurnDeps = (db: Db, sessionId: string): TurnDeps => ({
    db,
    bus: getBus(),
    brain: getBrain(),
    tools: engineTools({
        engine: getEngine(),
        cred: resolveJulesCredential(),
        db,
        sessionId,
    }),
});
