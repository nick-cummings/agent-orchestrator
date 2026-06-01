import { describe, expect, it } from "vitest";

import {
    BASE_CONFIG,
    DEFAULT_POLICY,
    decideApproval,
    resolveConfig,
} from "@/lib/core/config";
import type { Config } from "@/lib/core/schemas";

describe("resolveConfig — inheritance", () => {
    it("returns the base defaults when no tier sets anything", () => {
        const effective = resolveConfig({});
        expect(effective.verbosity).toBe("verbose");
        expect(effective.requirePlanApproval).toBe(true);
        expect(effective.routing).toEqual({
            brain: "claude",
            executor: "jules",
        });
        expect(effective.approvalPolicy).toEqual(DEFAULT_POLICY);
    });

    it("lets a more specific tier replace a scalar", () => {
        const user: Config = { verbosity: "normal" };
        const card: Config = { verbosity: "quiet" };
        expect(resolveConfig(user, {}, card).verbosity).toBe("quiet");
        expect(resolveConfig(user).verbosity).toBe("normal");
    });

    it("merges approvalPolicy PER KEY, inheriting the rest from base", () => {
        const board: Config = { approvalPolicy: { destructive: "auto" } };
        const policy = resolveConfig({}, board).approvalPolicy;
        expect(policy?.destructive).toBe("auto"); // overridden
        expect(policy?.spend).toBe("ask"); // inherited from DEFAULT_POLICY
        expect(policy?.read).toBe("auto");
    });

    it("merges routing PER KEY (override executor, inherit brain)", () => {
        const card: Config = { routing: { executor: "sandbox-claude" } };
        const routing = resolveConfig({}, {}, card).routing;
        expect(routing).toEqual({
            brain: "claude",
            executor: "sandbox-claude",
        });
    });

    it("REPLACES arrays rather than concatenating them", () => {
        const board: Config = { skillIds: ["a", "b"] };
        const card: Config = { skillIds: ["c"] };
        expect(resolveConfig({}, board, card).skillIds).toEqual(["c"]);
        expect(resolveConfig({}, board).skillIds).toEqual(["a", "b"]);
    });

    it("does not invent a systemPrompt key when no tier sets it", () => {
        const effective = resolveConfig({});
        expect("systemPrompt" in effective).toBe(false);
    });

    it("carries a systemPrompt set at any tier", () => {
        expect(resolveConfig({ systemPrompt: "be terse" }).systemPrompt).toBe(
            "be terse",
        );
    });
});

describe("decideApproval", () => {
    it("auto-approves when there is no category", () => {
        expect(decideApproval(undefined)).toBe("auto");
        expect(decideApproval({ destructive: "ask" })).toBe("auto");
    });

    it("uses the policy's decision when the category is set", () => {
        expect(decideApproval({ destructive: "auto" }, "destructive")).toBe(
            "auto",
        );
    });

    it("falls back to DEFAULT_POLICY when the policy omits the category", () => {
        expect(decideApproval({}, "spend")).toBe("ask");
        expect(decideApproval(undefined, "read")).toBe("auto");
    });
});

describe("BASE_CONFIG", () => {
    it("encodes the v1 hybrid binding and a conservative policy", () => {
        expect(BASE_CONFIG.routing).toEqual({
            brain: "claude",
            executor: "jules",
        });
        expect(BASE_CONFIG.approvalPolicy?.destructive).toBe("ask");
    });
});
