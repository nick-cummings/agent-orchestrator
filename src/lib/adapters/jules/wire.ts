import { z } from "zod";

/**
 * Zod schemas for the raw Jules v1alpha wire shapes — the anti-corruption
 * boundary. Every Jules response is `.parse()`d through these so drift fails
 * loudly here, never three layers down (AGENTS rule). Unknown fields are
 * dropped (resilient to additive vendor changes); `state` is kept as a plain
 * string and mapped leniently so a new session state doesn't crash the poller.
 */

/** Documented Jules session states (mapped in normalize.ts). */
export const JULES_STATES = [
    "QUEUED",
    "PLANNING",
    "AWAITING_PLAN_APPROVAL",
    "AWAITING_USER_FEEDBACK",
    "IN_PROGRESS",
    "PAUSED",
    "FAILED",
    "COMPLETED",
] as const;

const JulesArtifact = z.object({
    changeSet: z
        .object({
            source: z.string().optional(),
            gitPatch: z
                .object({
                    baseCommitId: z.string().optional(),
                    unidiffPatch: z.string().optional(),
                    suggestedCommitMessage: z.string().optional(),
                })
                .optional(),
        })
        .optional(),
    bashOutput: z
        .object({
            command: z.string().optional(),
            output: z.string().optional(),
            exitCode: z.number().optional(),
        })
        .optional(),
    media: z.object({ mimeType: z.string().optional() }).optional(),
});

/** One Jules activity. Exactly one event field is set; we read what we surface. */
export const JulesActivity = z.object({
    name: z.string().optional(),
    id: z.string().optional(),
    originator: z.string().optional(),
    description: z.string().optional(),
    createTime: z.string().optional(),
    artifacts: z.array(JulesArtifact).optional(),
    planGenerated: z
        .object({
            plan: z
                .object({
                    id: z.string().optional(),
                    steps: z.array(z.unknown()).optional(),
                })
                .optional(),
        })
        .optional(),
    planApproved: z.object({ planId: z.string().optional() }).optional(),
    userMessaged: z.object({ userMessage: z.string().optional() }).optional(),
    agentMessaged: z.object({ agentMessage: z.string().optional() }).optional(),
    progressUpdated: z
        .object({
            title: z.string().optional(),
            description: z.string().optional(),
        })
        .optional(),
    sessionCompleted: z.object({}).optional(),
    sessionFailed: z.object({ reason: z.string().optional() }).optional(),
});
export type JulesActivity = z.infer<typeof JulesActivity>;

export const JulesActivitiesResponse = z.object({
    activities: z.array(JulesActivity).default([]),
    nextPageToken: z.string().optional(),
});
export type JulesActivitiesResponse = z.infer<typeof JulesActivitiesResponse>;

export const JulesSession = z.object({
    name: z.string().optional(),
    id: z.string().optional(),
    state: z.string().optional(),
    prompt: z.string().optional(),
    title: z.string().optional(),
    url: z.string().optional(),
    createTime: z.string().optional(),
    updateTime: z.string().optional(),
    // Present only once the session completes; shape varies — scanned for a PR.
    outputs: z.array(z.unknown()).optional(),
});
export type JulesSession = z.infer<typeof JulesSession>;
