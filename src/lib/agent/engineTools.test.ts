// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { engineTools } from "@/lib/agent/engineTools";
import { runTool } from "@/lib/agent/tools";
import type { ExecutionEngine } from "@/lib/core/contracts";
import { appendActivities } from "@/lib/db/activities";
import { createBoard } from "@/lib/db/boards";
import { createCard } from "@/lib/db/cards";
import type { Db } from "@/lib/db/client";
import { createColumn } from "@/lib/db/columns";
import { createExecution, listExecutionsBySession } from "@/lib/db/executions";
import { getOrCreateSessionForCard } from "@/lib/db/sessions";
import { must } from "@/test-utils/assert";
import { createTestDb } from "@/test-utils/db";

const CRED = { kind: "jules_api_key" as const, value: "k" };

const fakeEngine = (): ExecutionEngine => ({
    id: "jules",
    caps: {
        conversational: true,
        planApproval: true,
        streaming: false,
        vcs: ["github"],
        selfHosted: false,
    },
    start: vi.fn(() =>
        Promise.resolve({
            id: "sess1",
            engine: "jules",
            externalRef: "sess1",
            deepLink: "https://jules.google/sessions/sess1",
        }),
    ),
    sendMessage: vi.fn(() => Promise.resolve()),
    listActivities: vi.fn(() => Promise.resolve([])),
    getStatus: vi.fn(() =>
        Promise.resolve({ state: "running" as const, updatedAt: "t" }),
    ),
    approvePlan: vi.fn(() => Promise.resolve()),
    getResult: vi.fn(() => Promise.resolve({})),
    deepLink: (ref) => `https://jules.google/sessions/${ref}`,
});

let db: Db;
let sessionId: string;
let engine: ExecutionEngine;

beforeEach(async () => {
    db = await createTestDb();
    const board = must(
        await createBoard(db, {
            userId: "u1",
            name: "B",
            position: 1,
            sidebarOrder: 1,
        }),
    );
    const column = must(
        await createColumn(db, { boardId: board.id, name: "C", position: 1 }),
    );
    const card = must(
        await createCard(db, { columnId: column.id, position: 1 }),
    );
    sessionId = (await getOrCreateSessionForCard(db, card.id)).id;
    engine = fakeEngine();
});

const tools = () => engineTools({ engine, cred: CRED, db, sessionId });

describe("engineTools", () => {
    it("start_coding_task starts the engine and persists a linked execution", async () => {
        const result = (await runTool(tools(), "start_coding_task", {
            prompt: "fix the bug",
            repo: { owner: "acme", name: "app", branch: "main" },
        })) as { executionId: string; deepLink: string };

        const [input] = (engine.start as ReturnType<typeof vi.fn>).mock
            .calls[0] as [{ repo: { repoUrl: string } }];
        expect(input.repo.repoUrl).toBe("https://github.com/acme/app");

        const executions = await listExecutionsBySession(db, sessionId);
        expect(executions).toHaveLength(1);
        expect(result.executionId).toBe(executions[0].id);
    });

    it("check_progress returns state + recent activities", async () => {
        const execution = must(
            await createExecution(db, {
                sessionId,
                engine: "jules",
                externalRef: "sess1",
                deepLinkUrl: "https://jules.google/sessions/sess1",
                prompt: "p",
            }),
        );
        await appendActivities(db, execution.id, [
            {
                at: "2026-06-01T00:00:00.000Z",
                source: "agent",
                kind: "plan",
                text: "made a plan",
                cursor: "c1",
            },
        ]);
        const result = (await runTool(tools(), "check_progress", {
            executionId: execution.id,
        })) as { state: string; activities: { kind: string }[] };
        expect(result.state).toBe("starting");
        expect(result.activities).toEqual([
            { kind: "plan", text: "made a plan" },
        ]);
    });

    it("approve_plan calls the engine for a known execution", async () => {
        const execution = must(
            await createExecution(db, {
                sessionId,
                engine: "jules",
                externalRef: "sessX",
                deepLinkUrl: "https://jules.google/sessions/sessX",
                prompt: "p",
            }),
        );
        await runTool(tools(), "approve_plan", { executionId: execution.id });
        expect(engine.approvePlan).toHaveBeenCalledWith("sessX", CRED);
    });

    it("rejects an unknown execution reference", async () => {
        await expect(
            runTool(tools(), "send_instruction", {
                executionId: "ghost",
                text: "hi",
            }),
        ).rejects.toThrow(/Unknown execution/);
    });
});
