import { describe, expect, it, vi } from "vitest";

import { ExecutionResult, type ResolvedCredential } from "@/lib/core/contracts";
import {
    NotImplementedError,
    type ProviderDeps,
    buildProviders,
} from "@/lib/core/providers";
import type { ProviderRouting } from "@/lib/core/schemas";

const CRED: ResolvedCredential = { kind: "jules_api_key", value: "ref_x" };
const REPO = {
    connectionId: "conn_1",
    repoUrl: "https://github.com/acme/app",
    branch: "main",
};

// The real Jules engine + Claude brain need injected deps; never-called stubs
// suffice for wiring tests (no method is invoked here).
const DEPS: ProviderDeps = {
    jules: {
        fetch: vi.fn() as unknown as typeof fetch,
        baseUrl: "https://jules.example/v1alpha",
        apiKey: "k",
    },
    claude: { client: {} as never },
};

describe("buildProviders — routing/swap point", () => {
    const cases: { routing: ProviderRouting; brain: string; engine: string }[] =
        [
            {
                routing: { brain: "claude", executor: "jules" },
                brain: "claude",
                engine: "jules",
            },
            {
                routing: { brain: "gemini", executor: "jules" },
                brain: "gemini",
                engine: "jules",
            },
            {
                routing: { brain: "claude", executor: "sandbox-claude" },
                brain: "claude",
                engine: "sandbox-claude",
            },
            {
                routing: { brain: "gemini", executor: "sandbox-gemini" },
                brain: "gemini",
                engine: "sandbox-gemini",
            },
        ];

    it.each(cases)(
        "routes $routing.brain + $routing.executor to the right factories",
        ({ routing, brain, engine }) => {
            const built = buildProviders(routing, DEPS);
            expect(built.brain.id).toBe(brain);
            expect(built.engine.id).toBe(engine);
        },
    );

    it("reflects each provider's capabilities", () => {
        const { brain, engine } = buildProviders(
            { brain: "claude", executor: "jules" },
            DEPS,
        );
        expect(brain.caps.thinking).toBe(true);
        expect(engine.caps.streaming).toBe(false); // Jules polls
        expect(engine.caps.planApproval).toBe(true);

        const sandbox = buildProviders(
            { brain: "claude", executor: "sandbox-claude" },
            DEPS,
        ).engine;
        expect(sandbox.caps.streaming).toBe(true);
        expect(sandbox.caps.selfHosted).toBe(true);
    });
});

describe("Jules engine is real and wired", () => {
    it("builds a Jules engine with the right id and caps", () => {
        const { engine } = buildProviders(
            { brain: "claude", executor: "jules" },
            DEPS,
        );
        expect(engine.id).toBe("jules");
        expect(engine.caps.vcs).toEqual(["github"]);
        expect(engine.deepLink("abc")).toBe(
            "https://jules.google/sessions/abc",
        );
    });

    it("requires deps.jules to build the Jules engine", () => {
        expect(() =>
            buildProviders(
                { brain: "claude", executor: "jules" },
                {
                    claude: DEPS.claude,
                },
            ),
        ).toThrow(/Jules engine requires deps\.jules/);
    });
});

describe("Claude brain is real and wired", () => {
    it("builds a Claude brain with the right id and caps", () => {
        const { brain } = buildProviders(
            { brain: "claude", executor: "jules" },
            DEPS,
        );
        expect(brain.id).toBe("claude");
        expect(brain.caps.thinking).toBe(true);
        expect(brain.caps.streaming).toBe(true);
    });

    it("requires deps.claude to build the Claude brain", () => {
        expect(() =>
            buildProviders(
                { brain: "claude", executor: "jules" },
                {
                    jules: DEPS.jules,
                },
            ),
        ).toThrow(/Claude brain requires deps\.claude/);
    });
});

describe("Brain & sandbox stubs throw NotImplementedError on use", () => {
    it("Gemini brain.generate throws NotImplementedError", () => {
        const { brain } = buildProviders(
            { brain: "gemini", executor: "jules" },
            DEPS,
        );
        expect(() => brain.generate({ messages: [], tools: [] })).toThrow(
            NotImplementedError,
        );
    });

    it("sandbox engine methods throw and it has no approvePlan", () => {
        const { engine } = buildProviders({
            brain: "gemini",
            executor: "sandbox-gemini",
        });
        expect(engine.approvePlan).toBeUndefined();
        expect(() =>
            engine.start({ repo: REPO, prompt: "go" }, CRED),
        ).toThrow();
        expect(() => engine.listActivities("ref")).toThrow();
        expect(() => engine.getStatus("ref")).toThrow();
        expect(() => engine.deepLink("ref")).toThrow();
    });
});

describe("ExecutionResult schema", () => {
    it("accepts an empty result and a PR result", () => {
        expect(ExecutionResult.parse({})).toEqual({});
        expect(
            ExecutionResult.parse({
                prUrl: "https://github.com/acme/app/pull/1",
            }).prUrl,
        ).toContain("/pull/1");
    });

    it("rejects a non-URL prUrl", () => {
        expect(() => ExecutionResult.parse({ prUrl: "nope" })).toThrow();
    });
});
