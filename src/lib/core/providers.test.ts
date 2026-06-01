import { describe, expect, it } from "vitest";

import { ExecutionResult, type ResolvedCredential } from "@/lib/core/contracts";
import { NotImplementedError, buildProviders } from "@/lib/core/providers";
import type { ProviderRouting } from "@/lib/core/schemas";

const CRED: ResolvedCredential = { kind: "jules_api_key", value: "ref_x" };
const REPO = {
    connectionId: "conn_1",
    repoUrl: "https://github.com/acme/app",
    branch: "main",
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
            const built = buildProviders(routing);
            expect(built.brain.id).toBe(brain);
            expect(built.engine.id).toBe(engine);
        },
    );

    it("reflects each provider's capabilities", () => {
        const { brain, engine } = buildProviders({
            brain: "claude",
            executor: "jules",
        });
        expect(brain.caps.thinking).toBe(true);
        expect(engine.caps.streaming).toBe(false); // Jules polls
        expect(engine.caps.planApproval).toBe(true);

        const sandbox = buildProviders({
            brain: "claude",
            executor: "sandbox-claude",
        }).engine;
        expect(sandbox.caps.streaming).toBe(true);
        expect(sandbox.caps.selfHosted).toBe(true);
    });
});

describe("Phase 0 stubs throw NotImplementedError on use", () => {
    it("Brain.generate throws", () => {
        const { brain } = buildProviders({
            brain: "claude",
            executor: "jules",
        });
        expect(() => brain.generate({ messages: [], tools: [] })).toThrow(
            NotImplementedError,
        );
    });

    it("Gemini brain.generate throws", () => {
        const { brain } = buildProviders({
            brain: "gemini",
            executor: "jules",
        });
        expect(() => brain.generate({ messages: [], tools: [] })).toThrow();
    });

    it("every Engine method throws (Jules)", () => {
        const { engine } = buildProviders({
            brain: "claude",
            executor: "jules",
        });
        expect(() => engine.start({ repo: REPO, prompt: "go" }, CRED)).toThrow(
            NotImplementedError,
        );
        expect(() => engine.sendMessage("ref", "hi", CRED)).toThrow();
        expect(() => engine.listActivities("ref")).toThrow();
        expect(() => engine.getStatus("ref")).toThrow();
        expect(() => engine.approvePlan?.("ref", CRED)).toThrow();
        expect(() => engine.getResult("ref")).toThrow();
        expect(() => engine.deepLink("ref")).toThrow();
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
        expect(() => engine.sendMessage("ref", "hi", CRED)).toThrow();
        expect(() => engine.listActivities("ref")).toThrow();
        expect(() => engine.getStatus("ref")).toThrow();
        expect(() => engine.getResult("ref")).toThrow();
        expect(() => engine.deepLink("ref")).toThrow();
    });

    it("carries a descriptive message", () => {
        const { brain } = buildProviders({
            brain: "claude",
            executor: "jules",
        });
        expect(() => brain.generate({ messages: [], tools: [] })).toThrow(
            /ClaudeBrain\.generate is not implemented yet/,
        );
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
