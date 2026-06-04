// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { engineTools } from "@/lib/agent/engineTools";
import { runSessionTurn, resumeTurn, type TurnDeps } from "@/lib/agent/turn";
import type {
    ConversationProvider,
    ExecutionEngine,
    ModelEvent,
} from "@/lib/core/contracts";
import { createBoard } from "@/lib/db/boards";
import { createCard } from "@/lib/db/cards";
import type { Db } from "@/lib/db/client";
import { createColumn } from "@/lib/db/columns";
import { listExecutionsBySession } from "@/lib/db/executions";
import { listMessages } from "@/lib/db/messages";
import { getOrCreateSessionForCard, getSessionById } from "@/lib/db/sessions";
import type { EventBus } from "@/lib/realtime/bus";
import type { SessionEvent } from "@/lib/realtime/events";
import { must } from "@/test-utils/assert";
import { createTestDb } from "@/test-utils/db";

const CRED = { kind: "jules_api_key" as const, value: "k" };

const fakeBrain = (scripts: ModelEvent[][]): ConversationProvider => {
    let i = 0;
    return {
        id: "claude",
        caps: {
            streaming: true,
            thinking: true,
            parallelToolCalls: false,
            maxContextTokens: 1_000_000,
        },
        generate: () => {
            const script = scripts[i] ?? [];
            i += 1;
            return (async function* () {
                await Promise.resolve();
                for (const event of script) yield event;
            })();
        },
    };
};

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

const recordingBus = () => {
    const events: SessionEvent[] = [];
    const bus: EventBus = {
        publish: (_channel, event) => {
            events.push(event);
            return Promise.resolve();
        },
        subscribe: () =>
            (async function* () {
                await Promise.resolve();
            })(),
    };
    return { bus, events };
};

const START = [
    {
        type: "tool_call",
        id: "tc1",
        name: "start_coding_task",
        input: {
            prompt: "fix it",
            repo: { owner: "acme", name: "app", branch: "main" },
        },
    },
    { type: "turn_end", stop: "tool_use" },
] satisfies ModelEvent[];
const DONE = [
    { type: "text_delta", text: "started" },
    { type: "turn_end", stop: "stop" },
] satisfies ModelEvent[];

let db: Db;
let sessionId: string;
let cardId: string;
let engine: ExecutionEngine;

const depsWith = (brain: ConversationProvider, bus: EventBus): TurnDeps => ({
    db,
    bus,
    brain,
    tools: engineTools({ engine, cred: CRED, db, sessionId }),
});

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
    cardId = must(
        await createCard(db, { columnId: column.id, position: 1 }),
    ).id;
    sessionId = (await getOrCreateSessionForCard(db, cardId)).id;
    engine = fakeEngine();
});

describe("runSessionTurn", () => {
    it("pauses at the approval gate without running the tool", async () => {
        const { bus, events } = recordingBus();
        await runSessionTurn(
            depsWith(fakeBrain([START, DONE]), bus),
            sessionId,
            "start a task on acme/app",
        );

        expect(engine.start).not.toHaveBeenCalled();
        const pending = must(
            await getSessionById(db, sessionId),
        ).pendingApproval;
        expect(pending).toMatchObject({ name: "start_coding_task" });
        expect((await listMessages(db, sessionId)).map((m) => m.role)).toEqual([
            "user",
            "assistant",
        ]);
        expect(events.some((e) => e.type === "approval_request")).toBe(true);
    });
});

describe("resumeTurn", () => {
    it("approve runs the tool, persists the result, and continues to done", async () => {
        const { bus } = recordingBus();
        await runSessionTurn(
            depsWith(fakeBrain([START, DONE]), bus),
            sessionId,
            "start a task on acme/app",
        );

        await resumeTurn(
            depsWith(fakeBrain([DONE]), bus),
            sessionId,
            "approve",
        );

        expect(engine.start).toHaveBeenCalledTimes(1);
        expect(await listExecutionsBySession(db, sessionId)).toHaveLength(1);
        expect(
            must(await getSessionById(db, sessionId)).pendingApproval,
        ).toBeNull();

        const roles = (await listMessages(db, sessionId)).map((m) => m.role);
        expect(roles).toEqual(["user", "assistant", "tool", "assistant"]);
    });

    it("reject records a rejection and does not start the engine", async () => {
        const { bus } = recordingBus();
        await runSessionTurn(
            depsWith(fakeBrain([START, DONE]), bus),
            sessionId,
            "start a task on acme/app",
        );

        await resumeTurn(depsWith(fakeBrain([DONE]), bus), sessionId, "reject");

        expect(engine.start).not.toHaveBeenCalled();
        const messages = await listMessages(db, sessionId);
        const toolMsg = messages.find((m) => m.role === "tool");
        expect(toolMsg?.contentBlocks[0]).toMatchObject({
            type: "tool_result",
            output: { rejected: true },
        });
    });
});
