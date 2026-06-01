import { describe, expect, it } from "vitest";

import {
    ApprovalPolicy,
    Board,
    Card,
    Config,
    Connection,
    ContentBlock,
    Execution,
    Message,
    ProviderRouting,
    RepoRef,
    Session,
    Skill,
    User,
} from "@/lib/core/schemas";

const NOW = "2026-06-01T12:00:00.000Z";
const REPO = {
    connectionId: "conn_1",
    repoUrl: "https://github.com/acme/app",
    branch: "main",
};

describe("Config & ApprovalPolicy", () => {
    it("accepts a partial config (every field optional → inherit)", () => {
        expect(Config.parse({})).toEqual({});
        expect(Config.parse({ verbosity: "quiet" })).toEqual({
            verbosity: "quiet",
        });
    });

    it("rejects an unknown verbosity", () => {
        expect(() => Config.parse({ verbosity: "loud" })).toThrow();
    });

    it("allows a partial approval policy (only some categories set)", () => {
        expect(ApprovalPolicy.parse({ destructive: "auto" })).toEqual({
            destructive: "auto",
        });
    });

    it("rejects an unknown action category value", () => {
        expect(() => ApprovalPolicy.parse({ destructive: "maybe" })).toThrow();
    });

    it("validates routing as a partial of brain/executor", () => {
        expect(ProviderRouting.partial().parse({ brain: "claude" })).toEqual({
            brain: "claude",
        });
        expect(() =>
            ProviderRouting.partial().parse({ executor: "copilot" }),
        ).toThrow();
    });
});

describe("RepoRef", () => {
    it("accepts a well-formed repo ref", () => {
        expect(RepoRef.parse(REPO)).toMatchObject({ branch: "main" });
    });

    it("rejects a non-URL repo", () => {
        expect(() =>
            RepoRef.parse({ ...REPO, repoUrl: "not-a-url" }),
        ).toThrow();
    });
});

describe("Card", () => {
    const base = {
        id: "card_1",
        columnId: "col_1",
        title: "New task",
        position: 1,
        version: 0,
        createdAt: NOW,
    };

    it("applies placeholder/status defaults", () => {
        const card = Card.parse(base);
        expect(card.titleSetByUser).toBe(false);
        expect(card.status).toBe("idle");
        expect(card.configOverride).toBeNull();
        expect(card.archivedAt).toBeNull();
    });

    it("rejects an invalid status", () => {
        expect(() => Card.parse({ ...base, status: "done" })).toThrow();
    });
});

describe("Connection / User / Board", () => {
    it("parses a connection with a nullable expiry", () => {
        const conn = Connection.parse({
            id: "conn_1",
            userId: "user_1",
            provider: "github",
            label: "personal",
            authType: "oauth",
            encryptedCredential: "cipher",
            scopes: ["repo"],
            expiresAt: null,
            createdAt: NOW,
        });
        expect(conn.provider).toBe("github");
    });

    it("rejects a bad email on User", () => {
        expect(() =>
            User.parse({
                id: "user_1",
                email: "nope",
                createdAt: NOW,
                defaultConfig: {},
            }),
        ).toThrow();
    });

    it("requires a version token on Board", () => {
        const board = Board.parse({
            id: "board_1",
            userId: "user_1",
            name: "Side projects",
            position: 1,
            sidebarOrder: 1,
            defaultConfig: {},
            version: 3,
            createdAt: NOW,
        });
        expect(board.version).toBe(3);
    });
});

describe("Session & Execution", () => {
    it("defaults sandbox fields to null for the Jules path", () => {
        const session = Session.parse({
            id: "sess_1",
            cardId: "card_1",
            brainProvider: "claude",
            executorEngine: "jules",
            model: "claude-opus-4-8",
            lastActiveAt: NOW,
        });
        expect(session.sandboxId).toBeNull();
        expect(session.requirePlanApproval).toBe(true);
        expect(session.repos).toEqual([]);
    });

    it("rejects an invalid execution state", () => {
        expect(() =>
            Execution.parse({
                id: "exec_1",
                sessionId: "sess_1",
                engine: "jules",
                externalRef: "jules-abc",
                state: "exploding",
                deepLinkUrl: "https://jules.google/sessions/abc",
                createdAt: NOW,
                updatedAt: NOW,
            }),
        ).toThrow();
    });
});

describe("Message content blocks", () => {
    it("parses each content block variant", () => {
        const blocks = [
            { type: "text", text: "hi" },
            { type: "thinking", text: "hmm" },
            { type: "tool_call", id: "t1", name: "start", input: { a: 1 } },
            { type: "tool_result", toolCallId: "t1", output: "ok" },
            { type: "image", mimeType: "image/png" },
            { type: "document", mimeType: "application/pdf", name: "spec" },
        ];
        for (const block of blocks) {
            expect(() => ContentBlock.parse(block)).not.toThrow();
        }
    });

    it("rejects an unknown block type", () => {
        expect(() => ContentBlock.parse({ type: "audio" })).toThrow();
    });

    it("parses a message with a monotonic seq", () => {
        const message = Message.parse({
            id: "msg_1",
            sessionId: "sess_1",
            role: "assistant",
            contentBlocks: [{ type: "text", text: "done" }],
            seq: 7,
            createdAt: NOW,
        });
        expect(message.seq).toBe(7);
    });
});

describe("Skill", () => {
    it("defaults toolRefs to an empty array", () => {
        const skill = Skill.parse({
            id: "skill_1",
            ownerLevel: "user",
            ownerId: "user_1",
            name: "Release notes",
            instructions: "Summarize merged PRs.",
        });
        expect(skill.toolRefs).toEqual([]);
    });
});
