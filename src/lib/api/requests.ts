import { z } from "zod";

/**
 * Zod schemas for every kanban write request body — the validation boundary
 * for the API routes (implementation-plan §1: validate untrusted input at the
 * edge). Routes parse the body through these; the derived types are the client
 * payload contracts. `position` is set by the server for creates, so bodies
 * never carry it; moves carry an explicit target rank computed client-side.
 */

export const CreateBoardBody = z.object({ name: z.string().min(1) });
export type CreateBoardBody = z.infer<typeof CreateBoardBody>;

export const UpdateBoardBody = z.object({
    name: z.string().min(1).optional(),
    sidebarOrder: z.number().optional(),
});
export type UpdateBoardBody = z.infer<typeof UpdateBoardBody>;

export const CreateColumnBody = z.object({
    boardId: z.string().min(1),
    name: z.string().min(1),
});
export type CreateColumnBody = z.infer<typeof CreateColumnBody>;

export const UpdateColumnBody = z.object({
    name: z.string().min(1).optional(),
    position: z.number().optional(),
});
export type UpdateColumnBody = z.infer<typeof UpdateColumnBody>;

export const CreateCardBody = z.object({
    columnId: z.string().min(1),
    title: z.string().optional(),
});
export type CreateCardBody = z.infer<typeof CreateCardBody>;

export const UpdateCardBody = z.object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
});
export type UpdateCardBody = z.infer<typeof UpdateCardBody>;

/** Move a card within/across columns: target column + the computed rank. */
export const MoveCardBody = z.object({
    columnId: z.string().min(1),
    position: z.number(),
});
export type MoveCardBody = z.infer<typeof MoveCardBody>;

/** Repo a card's execution targets (Phase 1 — no Connections UI yet). */
export const RepoTarget = z.object({
    owner: z.string().min(1),
    name: z.string().min(1),
    branch: z.string().min(1),
});
export type RepoTarget = z.infer<typeof RepoTarget>;

/** Start a cloud coding task (Execution) on a card. */
export const StartExecutionBody = z.object({
    prompt: z.string().min(1),
    repo: RepoTarget,
    requirePlanApproval: z.boolean().optional(),
});
export type StartExecutionBody = z.infer<typeof StartExecutionBody>;

/** Steer a running execution. */
export const SendMessageBody = z.object({ text: z.string().min(1) });
export type SendMessageBody = z.infer<typeof SendMessageBody>;
