import type { ExecutionEngine } from "@/lib/core/contracts";
import { buildProviders } from "@/lib/core/providers";
import { resolveJulesCredential } from "@/lib/creds/jules";

/**
 * Server-side composition: build the configured ExecutionEngine from env. The
 * routing is hard-wired to Jules in Phase 1 (Phase 3 reads it from the card's
 * effective config). Deps carry the Jules base URL + the resolved API key.
 */
const JULES_BASE_URL =
    process.env.JULES_BASE_URL ?? "https://jules.googleapis.com/v1alpha";

export const getEngine = (): ExecutionEngine =>
    buildProviders(
        { brain: "claude", executor: "jules" },
        {
            jules: {
                fetch,
                baseUrl: JULES_BASE_URL,
                apiKey: resolveJulesCredential().value,
            },
        },
    ).engine;
