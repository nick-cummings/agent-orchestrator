import { describe, expect, it } from "vitest";

import { extractPrUrl, toDomainActivity, toExecutionState } from "./normalize";
import type { JulesActivity, JulesSession } from "./wire";

describe("toExecutionState", () => {
    it("maps documented Jules states", () => {
        expect(toExecutionState("QUEUED")).toBe("starting");
        expect(toExecutionState("PLANNING")).toBe("planning");
        expect(toExecutionState("AWAITING_PLAN_APPROVAL")).toBe(
            "awaiting_plan_approval",
        );
        expect(toExecutionState("AWAITING_USER_FEEDBACK")).toBe(
            "awaiting_feedback",
        );
        expect(toExecutionState("IN_PROGRESS")).toBe("running");
        expect(toExecutionState("COMPLETED")).toBe("succeeded");
        expect(toExecutionState("FAILED")).toBe("failed");
    });

    it("defaults unknown/missing states to running (poller keeps going)", () => {
        expect(toExecutionState(undefined)).toBe("running");
        expect(toExecutionState("SOME_NEW_STATE")).toBe("running");
    });
});

describe("toDomainActivity", () => {
    const base: JulesActivity = {
        id: "a1",
        createTime: "2026-06-01T00:00:00Z",
    };

    it("classifies a plan, with a compound cursor", () => {
        const out = toDomainActivity({
            ...base,
            originator: "agent",
            planGenerated: { plan: { id: "p1", steps: [] } },
        });
        expect(out.kind).toBe("plan");
        expect(out.source).toBe("agent");
        expect(out.cursor).toBe("2026-06-01T00:00:00Z::a1");
        expect(out.at).toBe("2026-06-01T00:00:00Z");
    });

    it("classifies an agent message and surfaces its text", () => {
        const out = toDomainActivity({
            ...base,
            originator: "agent",
            agentMessaged: { agentMessage: "working on it" },
        });
        expect(out.kind).toBe("message");
        expect(out.text).toBe("working on it");
    });

    it("classifies a user message", () => {
        const out = toDomainActivity({
            ...base,
            originator: "user",
            userMessaged: { userMessage: "do X" },
        });
        expect(out.kind).toBe("message");
        expect(out.source).toBe("user");
    });

    it("classifies progress with its title as text", () => {
        const out = toDomainActivity({
            ...base,
            progressUpdated: { title: "editing 3 files", description: "…" },
        });
        expect(out.kind).toBe("progress");
        expect(out.text).toBe("editing 3 files");
        expect(out.source).toBe("system");
    });

    it("classifies completion and failure as result", () => {
        expect(toDomainActivity({ ...base, sessionCompleted: {} }).kind).toBe(
            "result",
        );
        const failed = toDomainActivity({
            ...base,
            sessionFailed: { reason: "boom" },
        });
        expect(failed.kind).toBe("result");
        expect(failed.text).toBe("boom");
    });

    it("classifies a code-change artifact", () => {
        const out = toDomainActivity({
            ...base,
            artifacts: [{ changeSet: { gitPatch: { unidiffPatch: "@@ …" } } }],
        });
        expect(out.kind).toBe("code_change");
    });

    it("classifies a bash artifact as a tool activity", () => {
        const out = toDomainActivity({
            ...base,
            artifacts: [{ bashOutput: { command: "ls", exitCode: 0 } }],
        });
        expect(out.kind).toBe("tool");
    });
});

describe("extractPrUrl", () => {
    it("finds a PR url in session outputs", () => {
        const session: JulesSession = {
            outputs: [
                { pullRequest: { url: "https://github.com/a/b/pull/12" } },
            ],
        };
        expect(extractPrUrl(session)).toBe("https://github.com/a/b/pull/12");
    });

    it("returns undefined when there are no outputs", () => {
        expect(extractPrUrl({})).toBeUndefined();
        expect(extractPrUrl({ outputs: [] })).toBeUndefined();
    });
});
