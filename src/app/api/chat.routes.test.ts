// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConversationProvider, ModelEvent } from "@/lib/core/contracts";
import type { TurnDeps } from "@/lib/agent/turn";
import type { Db } from "@/lib/db/client";
import type { EventBus } from "@/lib/realtime/bus";

const holder = vi.hoisted(() => ({
    db: undefined as Db | undefined,
    deps: undefined as TurnDeps | undefined,
}));
vi.mock("@/lib/db/client", () => ({ getDb: () => holder.db }));
vi.mock("@/lib/server/turnDeps", () => ({ buildTurnDeps: () => holder.deps }));

import { POST as sendChat } from "@/app/api/cards/[cardId]/messages/route";
import { POST as approve } from "@/app/api/sessions/[sessionId]/approve/route";
import { createBoard } from "@/lib/db/boards";
import { createCard } from "@/lib/db/cards";
import { createColumn } from "@/lib/db/columns";
import { listMessages } from "@/lib/db/messages";
import { getSessionByCard } from "@/lib/db/sessions";
import { must } from "@/test-utils/assert";
import { createTestDb } from "@/test-utils/db";

const fakeBrain = (script: ModelEvent[]): ConversationProvider => ({
    id: "claude",
    caps: {
        streaming: true,
        thinking: true,
        parallelToolCalls: false,
        maxContextTokens: 1_000_000,
    },
    generate: () =>
        (async function* () {
            await Promise.resolve();
            for (const event of script) yield event;
        })(),
});

const noopBus: EventBus = {
    publish: () => Promise.resolve(),
    subscribe: () =>
        (async function* () {
            await Promise.resolve();
        })(),
};

const post = (body: unknown): Request =>
    new Request("http://test", { method: "POST", body: JSON.stringify(body) });
const ctx = <T extends object>(params: T) => ({
    params: Promise.resolve(params),
});

let cardId: string;

beforeEach(async () => {
    const db = await createTestDb();
    holder.db = db;
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
    holder.deps = {
        db,
        bus: noopBus,
        brain: fakeBrain([
            { type: "text_delta", text: "hello" },
            { type: "turn_end", stop: "stop" },
        ]),
        tools: {},
    };
});

describe("POST /api/cards/[cardId]/messages", () => {
    it("creates the session, runs a turn, and persists the exchange", async () => {
        const res = await sendChat(post({ text: "hi there" }), ctx({ cardId }));
        expect(res.status).toBe(200);

        const session = must(await getSessionByCard(must(holder.db), cardId));
        const roles = (await listMessages(must(holder.db), session.id)).map(
            (m) => m.role,
        );
        expect(roles).toEqual(["user", "assistant"]);
    });

    it("rejects a blank message with 400", async () => {
        const res = await sendChat(post({ text: "" }), ctx({ cardId }));
        expect(res.status).toBe(400);
    });
});

describe("POST /api/sessions/[sessionId]/approve", () => {
    it("is a no-op 200 when nothing is parked", async () => {
        const res = await approve(
            post({ decision: "approve" }),
            ctx({ sessionId: "missing" }),
        );
        expect(res.status).toBe(200);
    });

    it("rejects an invalid decision with 400", async () => {
        const res = await approve(
            post({ decision: "maybe" }),
            ctx({ sessionId: "s1" }),
        );
        expect(res.status).toBe(400);
    });
});
