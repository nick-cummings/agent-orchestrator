import {
    boolean,
    doublePrecision,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
} from "drizzle-orm/pg-core";

import type { Config } from "@/lib/core/schemas";

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
