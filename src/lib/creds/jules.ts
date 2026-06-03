import type { ResolvedCredential } from "@/lib/core/contracts";

/**
 * Phase-1 credential stand-in: the single-user Jules API key from the
 * environment. Phase 3 replaces this with `CredentialProvider` resolving a
 * per-card `Connection`. Backend-only — the value never reaches the browser.
 * TODO(Phase 3): swap for CredentialProvider.resolveBrainAuth/resolve.
 */
export const resolveJulesCredential = (): ResolvedCredential => {
    const value = process.env.JULES_API_KEY;
    if (!value) {
        throw new Error(
            "JULES_API_KEY is not set — add it to .env.local (Phase 1) ",
        );
    }
    return { kind: "jules_api_key", value };
};
