// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createBoard } from "@/lib/db/boards";
import { createCard } from "@/lib/db/cards";
import type { Db } from "@/lib/db/client";
import { createColumn } from "@/lib/db/columns";
import { createExecution, type Execution } from "@/lib/db/executions";
import { getOrCreateSessionForCard } from "@/lib/db/sessions";
import { must } from "@/test-utils/assert";
import { createTestDb } from "@/test-utils/db";

// Inject a PGlite db, a fake engine, a fixed cred, and a stub bus.
const holder = vi.hoisted(() => ({ db: undefined as Db | undefined }));
const engine = vi.hoisted(() => ({
    id: "jules" as const,
    start: vi.fn(),
    sendMessage: vi.fn(),
    approvePlan: vi.fn(),
    getStatus: vi.fn(),
    listActivities: vi.fn(),
    getResult: vi.fn(),
}));
const bus = vi.hoisted(() => ({
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ getDb: () => holder.db }));
vi.mock("@/lib/server/engine", () => ({ getEngine: () => engine }));
vi.mock("@/lib/creds/jules", () => ({
    resolveJulesCredential: () => ({ kind: "jules_api_key", value: "k" }),
}));
vi.mock("@/lib/realtime", () => ({ getBus: () => bus }));

import { POST as startExecution } from "@/app/api/cards/[cardId]/executions/route";
import { GET as getSession } from "@/app/api/cards/[cardId]/session/route";
import { POST as approvePlan } from "@/app/api/executions/[executionId]/approve-plan/route";
import { POST as sendMessage } from "@/app/api/executions/[executionId]/messages/route";
import { GET as poll } from "@/app/api/poll/route";

let cardId: string;

const post = (body: unknown): Request =>
    new Request("http://test", { method: "POST", body: JSON.stringify(body) });
const ctx = <T extends object>(params: T) => ({
    params: Promise.resolve(params),
});

beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    holder.db = await createTestDb();
    const board = must(
        await createBoard(holder.db, {
            userId: "u1",
            name: "B",
            position: 1,
            sidebarOrder: 1,
        }),
    );
    const column = must(
        await createColumn(holder.db, {
            boardId: board.id,
            name: "C",
            position: 1,
        }),
    );
    cardId = must(
        await createCard(holder.db, { columnId: column.id, position: 1 }),
    ).id;
});

const seedExecution = async (state = "running"): Promise<Execution> => {
    const session = await getOrCreateSessionForCard(must(holder.db), cardId);
    return must(
        await createExecution(must(holder.db), {
            sessionId: session.id,
            engine: "jules",
            externalRef: "jules-ext",
            deepLinkUrl: "https://jules.google/sessions/jules-ext",
            prompt: "p",
            state,
        }),
    );
};

describe("POST /api/cards/[cardId]/executions", () => {
    it("starts a Jules task, persists the execution, and flips the card to running", async () => {
        engine.start.mockResolvedValue({
            id: "sess1",
            engine: "jules",
            externalRef: "sess1",
            deepLink: "https://jules.google/sessions/sess1",
        });
        const res = await startExecution(
            post({
                prompt: "fix the bug",
                repo: { owner: "acme", name: "app", branch: "main" },
            }),
            ctx({ cardId }),
        );
        expect(res.status).toBe(201);
        const execution = (await res.json()) as Execution;
        expect(execution.externalRef).toBe("sess1");

        // The engine was handed a normalized repo + the cred.
        const [input] = engine.start.mock.calls[0] as [
            { repo: { repoUrl: string }; prompt: string },
        ];
        expect(input.repo.repoUrl).toBe("https://github.com/acme/app");

        const view = (await (
            await getSession(new Request("http://test"), ctx({ cardId }))
        ).json()) as { executions: { externalRef: string }[] };
        expect(view.executions[0].externalRef).toBe("sess1");
    });

    it("rejects a blank prompt with 400", async () => {
        const res = await startExecution(
            post({
                prompt: "",
                repo: { owner: "a", name: "b", branch: "main" },
            }),
            ctx({ cardId }),
        );
        expect(res.status).toBe(400);
        expect(engine.start).not.toHaveBeenCalled();
    });
});

describe("GET /api/cards/[cardId]/session", () => {
    it("returns a null session before any task", async () => {
        const view = (await (
            await getSession(new Request("http://test"), ctx({ cardId }))
        ).json()) as { session: unknown };
        expect(view.session).toBeNull();
    });
});

describe("execution steer + approve", () => {
    it("sends a steer message to the engine", async () => {
        const execution = await seedExecution();
        const res = await sendMessage(
            post({ text: "go left" }),
            ctx({ executionId: execution.id }),
        );
        expect(res.status).toBe(200);
        expect(engine.sendMessage).toHaveBeenCalledWith(
            "jules-ext",
            "go left",
            expect.objectContaining({ kind: "jules_api_key" }),
        );
    });

    it("404s steering an unknown execution", async () => {
        const res = await sendMessage(
            post({ text: "x" }),
            ctx({ executionId: "nope" }),
        );
        expect(res.status).toBe(404);
    });

    it("approves a plan via the engine", async () => {
        const execution = await seedExecution("awaiting_plan_approval");
        const res = await approvePlan(new Request("http://test"), {
            params: Promise.resolve({ executionId: execution.id }),
        });
        expect(res.status).toBe(200);
        expect(engine.approvePlan).toHaveBeenCalledWith(
            "jules-ext",
            expect.anything(),
        );
    });
});

describe("GET /api/poll", () => {
    it("sweeps active executions", async () => {
        await seedExecution("running");
        engine.listActivities.mockResolvedValue([]);
        engine.getStatus.mockResolvedValue({
            state: "running",
            updatedAt: "t",
        });
        const res = await poll(new Request("http://test"));
        expect(((await res.json()) as { polled: number }).polled).toBe(1);
    });

    it("401s when CRON_SECRET is set and the header is missing", async () => {
        vi.stubEnv("CRON_SECRET", "topsecret");
        const res = await poll(new Request("http://test"));
        expect(res.status).toBe(401);
    });
});
