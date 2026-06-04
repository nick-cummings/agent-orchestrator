import { createJulesEngine } from "@/lib/adapters/jules";
import type { ExecutionEngine } from "@/lib/core/contracts";
import { resolveJulesCredential } from "@/lib/creds/jules";

/**
 * Server-side composition of the Engine from env (mirrors `getBrain`). Hard-wired
 * to Jules in Phase 2 (Phase 3 reads routing from the card config). Built
 * directly rather than via `buildProviders` so it needs no Brain deps — the two
 * server helpers compose their own side.
 */
const JULES_BASE_URL =
    process.env.JULES_BASE_URL ?? "https://jules.googleapis.com/v1alpha";

export const getEngine = (): ExecutionEngine =>
    createJulesEngine({
        fetch,
        baseUrl: JULES_BASE_URL,
        apiKey: resolveJulesCredential().value,
    });
