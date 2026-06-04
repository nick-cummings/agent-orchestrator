import {
    boolean,
    doublePrecision,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from "drizzle-orm/pg-core";

import type { ContentBlock, Config, RepoRef } from "@/lib/core/schemas";

/** A tool call paused at the approval gate, awaiting a human tap (Phase 2). */
export type PendingApproval = {
    toolCallId: string;
    name: string;
    input: unknown;
    category: string;
};

/**
 * Drizzle schema for the Phase 0 organizational kanban (boards → columns →
 * cards). Mirrors the domain Zod schemas (spec §10); the richer session/
 * execution/message tables arrive with later phases. Single-user for now —
 * `userId` is a plain column, no users table or auth yet.
 */

const ts = (name: string) =>
    timestamp(name, { mode: "string", withTimezone: true });

export const boards = pgTable("boards", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    position: doublePrecision("position").notNull(),
    sidebarOrder: doublePrecision("sidebar_order").notNull(),
    defaultConfig: jsonb("default_config")
        .$type<Config>()
        .notNull()
        .default({}),
    version: integer("version").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
});

export const columns = pgTable("columns", {
    id: text("id").primaryKey(),
    boardId: text("board_id")
        .notNull()
        .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: doublePrecision("position").notNull(),
});

export const cards = pgTable("cards", {
    id: text("id").primaryKey(),
    columnId: text("column_id")
        .notNull()
        .references(() => columns.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    position: doublePrecision("position").notNull(),
    titleSetByUser: boolean("title_set_by_user").notNull().default(false),
    status: text("status").notNull().default("idle"),
    configOverride: jsonb("config_override").$type<Config>(),
    version: integer("version").notNull().default(0),
    archivedAt: ts("archived_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
});

/**
 * A card's conversation/orchestration context (1:1 with a card). Phase 1 uses
 * the routing + repos + plan-approval fields; the Brain-side fields (model,
 * systemPrompt, skills) and sandbox-* fields arrive with later phases.
 */
export const sessions = pgTable("sessions", {
    id: text("id").primaryKey(),
    cardId: text("card_id")
        .notNull()
        .unique()
        .references(() => cards.id, { onDelete: "cascade" }),
    brainProvider: text("brain_provider").notNull().default("claude"),
    executorEngine: text("executor_engine").notNull().default("jules"),
    model: text("model").notNull().default(""),
    verbosity: text("verbosity").notNull().default("verbose"),
    systemPrompt: text("system_prompt"),
    skillIds: jsonb("skill_ids").$type<string[]>().notNull().default([]),
    connectionIds: jsonb("connection_ids")
        .$type<string[]>()
        .notNull()
        .default([]),
    repos: jsonb("repos").$type<RepoRef[]>().notNull().default([]),
    requirePlanApproval: boolean("require_plan_approval")
        .notNull()
        .default(true),
    // A Brain tool call paused at the approval gate (Phase 2), or null.
    pendingApproval: jsonb("pending_approval").$type<PendingApproval>(),
    lastActiveAt: ts("last_active_at").notNull().defaultNow(),
    createdAt: ts("created_at").notNull().defaultNow(),
});

/** One unit of cloud coding work an Engine runs (0..N per session). */
export const executions = pgTable("executions", {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
        .notNull()
        .references(() => sessions.id, { onDelete: "cascade" }),
    engine: text("engine").notNull(),
    // Opaque vendor id (e.g. Jules sessionId) — the ONLY place it lives.
    externalRef: text("external_ref").notNull(),
    state: text("state").notNull().default("starting"),
    prompt: text("prompt").notNull().default(""),
    lastActivityCursor: text("last_activity_cursor"),
    deepLinkUrl: text("deep_link_url").notNull(),
    resultPrUrl: text("result_pr_url"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
});

/**
 * Normalized Engine events per execution. `seq` is monotonic per execution and
 * powers lossless SSE replay; `cursor` is the vendor-side position used by the
 * poller to fetch only new activities.
 */
export const activities = pgTable(
    "activities",
    {
        id: text("id").primaryKey(),
        executionId: text("execution_id")
            .notNull()
            .references(() => executions.id, { onDelete: "cascade" }),
        seq: integer("seq").notNull(),
        at: ts("at").notNull(),
        source: text("source").notNull(),
        kind: text("kind").notNull(),
        text: text("text"),
        data: jsonb("data"),
        cursor: text("cursor").notNull(),
    },
    (t) => [uniqueIndex("activities_execution_seq").on(t.executionId, t.seq)],
);

/**
 * The Brain conversation transcript per session. `seq` is monotonic per session
 * and powers SSE replay; `contentBlocks` holds the normalized domain blocks
 * (text / thinking / tool_call / tool_result / image / document).
 */
export const messages = pgTable(
    "messages",
    {
        id: text("id").primaryKey(),
        sessionId: text("session_id")
            .notNull()
            .references(() => sessions.id, { onDelete: "cascade" }),
        role: text("role").notNull(),
        contentBlocks: jsonb("content_blocks")
            .$type<ContentBlock[]>()
            .notNull()
            .default([]),
        seq: integer("seq").notNull(),
        createdAt: ts("created_at").notNull().defaultNow(),
    },
    (t) => [uniqueIndex("messages_session_seq").on(t.sessionId, t.seq)],
);
