import { createClaudeBrain, type ClaudeDeps } from "@/lib/adapters/claude";
import { createJulesEngine, type JulesDeps } from "@/lib/adapters/jules";
import type {
    ConversationProvider,
    ExecutionEngine,
} from "@/lib/core/contracts";
import type { BrainId, ExecutorId, ProviderRouting } from "@/lib/core/schemas";

/**
 * Composition root (implementation-plan §6) — a pure selector over routing that
 * calls the right factory functions. Switching the app's architecture = change
 * the default routing + make sure the factory exists. That's the entire cost
 * of a swap. The factories below are Phase 0 STUBS: they return a correctly
 * shaped provider record whose methods throw, so the seams and routing are
 * exercisable before any real provider exists.
 */

export class NotImplementedError extends Error {
    constructor(what: string) {
        super(`${what} is not implemented yet (Phase 0 stub)`);
        this.name = "NotImplementedError";
    }
}

const notImplemented = (what: string): never => {
    throw new NotImplementedError(what);
};

// Deps the factories capture (HTTP clients, creds, clock, …). Grows per
// provider as adapters become real; Brain/sandbox stubs ignore it for now.
export type ProviderDeps = { jules?: JulesDeps; claude?: ClaudeDeps };

const requireJules = (deps: ProviderDeps): JulesDeps => {
    if (!deps.jules) {
        throw new Error(
            "Jules engine requires deps.jules { fetch, baseUrl, apiKey }",
        );
    }
    return deps.jules;
};

const requireClaude = (deps: ProviderDeps): ClaudeDeps => {
    if (!deps.claude) {
        throw new Error("Claude brain requires deps.claude { client }");
    }
    return deps.claude;
};

// ── Brain stubs (Claude is real — see src/lib/adapters/claude) ────────────────────

export const createGeminiBrain = (
    _deps: ProviderDeps,
): ConversationProvider => ({
    id: "gemini",
    caps: {
        streaming: true,
        thinking: false,
        parallelToolCalls: true,
        maxContextTokens: 1_000_000,
    },
    generate: () => notImplemented("GeminiBrain.generate"),
});

// ── Engine stubs (Jules is real — see src/lib/adapters/jules) ─────────────────────

type SandboxHarness = { harness: "claude" | "gemini" };

export const createSandboxEngine = (
    { harness }: SandboxHarness,
    _deps: ProviderDeps,
): ExecutionEngine => ({
    id: harness === "claude" ? "sandbox-claude" : "sandbox-gemini",
    caps: {
        conversational: true,
        planApproval: false,
        streaming: true,
        vcs: ["github"],
        selfHosted: true,
    },
    start: () => notImplemented(`SandboxEngine(${harness}).start`),
    sendMessage: () => notImplemented(`SandboxEngine(${harness}).sendMessage`),
    listActivities: () =>
        notImplemented(`SandboxEngine(${harness}).listActivities`),
    getStatus: () => notImplemented(`SandboxEngine(${harness}).getStatus`),
    getResult: () => notImplemented(`SandboxEngine(${harness}).getResult`),
    deepLink: () => notImplemented(`SandboxEngine(${harness}).deepLink`),
});

// ── The swap point ──────────────────────────────────────────────────────────────

// Lookup tables instead of nested ternaries — adding a provider is one entry.
const brainFactories: Record<
    BrainId,
    (deps: ProviderDeps) => ConversationProvider
> = {
    claude: (deps) => createClaudeBrain(requireClaude(deps)),
    gemini: createGeminiBrain,
};

const engineFactories: Record<
    ExecutorId,
    (deps: ProviderDeps) => ExecutionEngine
> = {
    jules: (deps) => createJulesEngine(requireJules(deps)),
    "sandbox-claude": (deps) =>
        createSandboxEngine({ harness: "claude" }, deps),
    "sandbox-gemini": (deps) =>
        createSandboxEngine({ harness: "gemini" }, deps),
};

export const buildProviders = (
    routing: ProviderRouting,
    deps: ProviderDeps = {},
): { brain: ConversationProvider; engine: ExecutionEngine } => ({
    brain: brainFactories[routing.brain](deps),
    engine: engineFactories[routing.executor](deps),
});
