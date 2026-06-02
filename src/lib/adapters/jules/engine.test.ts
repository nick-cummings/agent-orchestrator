import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedCredential } from "@/lib/core/contracts";

import { createJulesEngine, type JulesDeps } from "./engine";

const CRED: ResolvedCredential = { kind: "jules_api_key", value: "CRED_KEY" };
const REPO = {
    connectionId: "c1",
    repoUrl: "https://github.com/acme/app",
    branch: "main",
};

const fetchMock = vi.fn();
const deps: JulesDeps = {
    fetch: fetchMock,
    baseUrl: "https://api/v1alpha",
    apiKey: "DEPS_KEY",
};
const engine = createJulesEngine(deps);

const ok = (data: unknown): Response =>
    new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-type": "application/json" },
    });

const act = (createTime: string, id: string, event: object) => ({
    id,
    createTime,
    originator: "agent",
    ...event,
});

const lastInit = (i = 0): RequestInit & { headers: Record<string, string> } =>
    fetchMock.mock.calls[i][1] as never;

beforeEach(() => {
    fetchMock.mockReset();
});
afterEach(() => {
    vi.clearAllMocks();
});

describe("createJulesEngine.start", () => {
    it("POSTs a session with sourceContext + AUTO_CREATE_PR and returns a handle", async () => {
        fetchMock.mockResolvedValue(
            ok({
                id: "sess1",
                url: "https://jules.google/sessions/sess1",
                state: "QUEUED",
            }),
        );
        const handle = await engine.start(
            { repo: REPO, prompt: "do it", requirePlanApproval: true },
            CRED,
        );
        expect(handle.externalRef).toBe("sess1");
        expect(handle.deepLink).toContain("sess1");

        expect(fetchMock.mock.calls[0][0]).toBe("https://api/v1alpha/sessions");
        const body = JSON.parse(lastInit().body as string) as {
            sourceContext: {
                source: string;
                githubRepoContext: { startingBranch: string };
            };
            automationMode: string;
        };
        expect(body.sourceContext.source).toBe("sources/github-acme-app");
        expect(body.sourceContext.githubRepoContext.startingBranch).toBe(
            "main",
        );
        expect(body.automationMode).toBe("AUTO_CREATE_PR");
        // Write op: the per-call cred overrides the deps key.
        expect(lastInit().headers["x-goog-api-key"]).toBe("CRED_KEY");
    });

    it("derives the id from `name` when `id` is absent", async () => {
        fetchMock.mockResolvedValue(
            ok({ name: "sessions/sX", state: "QUEUED" }),
        );
        const handle = await engine.start({ repo: REPO, prompt: "x" }, CRED);
        expect(handle.externalRef).toBe("sX");
    });

    it("throws when the response has no id", async () => {
        fetchMock.mockResolvedValue(ok({ state: "QUEUED" }));
        await expect(
            engine.start({ repo: REPO, prompt: "x" }, CRED),
        ).rejects.toThrow(/missing id/);
    });
});

describe("createJulesEngine.listActivities", () => {
    it("follows pageToken, normalizes, and sorts by cursor", async () => {
        fetchMock
            .mockResolvedValueOnce(
                ok({
                    activities: [
                        act("2026-06-02T00:00:00Z", "a2", {
                            progressUpdated: { title: "later" },
                        }),
                    ],
                    nextPageToken: "p2",
                }),
            )
            .mockResolvedValueOnce(
                ok({
                    activities: [
                        act("2026-06-01T00:00:00Z", "a1", {
                            agentMessaged: { agentMessage: "earlier" },
                        }),
                    ],
                }),
            );
        const out = await engine.listActivities("sess1");
        expect(out.map((a) => a.cursor)).toEqual([
            "2026-06-01T00:00:00Z::a1",
            "2026-06-02T00:00:00Z::a2",
        ]);
        // Read op: uses the deps key (the contract gives reads no cred).
        expect(lastInit().headers["x-goog-api-key"]).toBe("DEPS_KEY");
    });

    it("returns only activities after the `since` cursor", async () => {
        fetchMock.mockResolvedValue(
            ok({
                activities: [
                    act("2026-06-01T00:00:00Z", "a1", { sessionCompleted: {} }),
                    act("2026-06-02T00:00:00Z", "a2", {
                        progressUpdated: { title: "x" },
                    }),
                ],
            }),
        );
        const tail = await engine.listActivities(
            "sess1",
            "2026-06-01T00:00:00Z::a1",
        );
        expect(tail.map((a) => a.cursor)).toEqual(["2026-06-02T00:00:00Z::a2"]);
    });
});

describe("createJulesEngine other ops", () => {
    it("maps session state in getStatus", async () => {
        fetchMock.mockResolvedValue(
            ok({ id: "s", state: "AWAITING_PLAN_APPROVAL", updateTime: "t1" }),
        );
        const status = await engine.getStatus("s");
        expect(status).toEqual({
            state: "awaiting_plan_approval",
            updatedAt: "t1",
        });
    });

    it("sends a steer message to :sendMessage", async () => {
        fetchMock.mockResolvedValue(ok({}));
        await engine.sendMessage("s", "go left", CRED);
        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://api/v1alpha/sessions/s:sendMessage",
        );
        expect(JSON.parse(lastInit().body as string)).toEqual({
            prompt: "go left",
        });
    });

    it("approves a plan at :approvePlan", async () => {
        fetchMock.mockResolvedValue(ok({}));
        await engine.approvePlan?.("s", CRED);
        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://api/v1alpha/sessions/s:approvePlan",
        );
    });

    it("extracts the PR url in getResult", async () => {
        fetchMock.mockResolvedValue(
            ok({
                id: "s",
                state: "COMPLETED",
                outputs: [
                    {
                        pullRequest: {
                            url: "https://github.com/acme/app/pull/7",
                        },
                    },
                ],
            }),
        );
        expect((await engine.getResult("s")).prUrl).toBe(
            "https://github.com/acme/app/pull/7",
        );
    });

    it("throws on a non-2xx response", async () => {
        fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
        await expect(engine.getStatus("s")).rejects.toThrow(/failed \(500\)/);
    });

    it("builds a stable deep link", () => {
        expect(engine.deepLink("abc")).toBe(
            "https://jules.google/sessions/abc",
        );
    });
});
