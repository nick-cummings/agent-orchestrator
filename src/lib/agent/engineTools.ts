import { z } from "zod";

import { defineTool, type ToolRegistry } from "@/lib/agent/tools";
import type { ExecutionEngine, ResolvedCredential } from "@/lib/core/contracts";
import { listActivities } from "@/lib/db/activities";
import type { Db } from "@/lib/db/client";
import { createExecution, getExecution } from "@/lib/db/executions";

/**
 * The Engine exposed to the Brain as intent-named tools (implementation-plan
 * §5). Names describe intent, never the vendor, so swapping the Engine changes
 * nothing the Brain sees. `executionId` in tool inputs is our `Execution.id`;
 * `start_coding_task` persists a new Execution linked to the session and returns
 * its id for later reference.
 */
export type EngineToolDeps = {
    engine: ExecutionEngine;
    cred: ResolvedCredential;
    db: Db;
    sessionId: string;
};

export const engineTools = (deps: EngineToolDeps): ToolRegistry => {
    const { engine, cred, db, sessionId } = deps;

    const refOf = async (executionId: string): Promise<string> => {
        const execution = await getExecution(db, executionId);
        if (!execution) throw new Error(`Unknown execution: ${executionId}`);
        return execution.externalRef;
    };

    const registry: ToolRegistry = {
        start_coding_task: defineTool({
            name: "start_coding_task",
            description:
                "Start a cloud coding task on a GitHub repo. Returns an " +
                "executionId to reference in later tool calls.",
            category: "branch_write",
            schema: z.object({
                prompt: z.string(),
                repo: z.object({
                    owner: z.string(),
                    name: z.string(),
                    branch: z.string().default("main"),
                }),
                requirePlanApproval: z.boolean().optional(),
            }),
            run: async (input) => {
                const handle = await engine.start(
                    {
                        repo: {
                            connectionId: "local",
                            repoUrl: `https://github.com/${input.repo.owner}/${input.repo.name}`,
                            branch: input.repo.branch,
                        },
                        prompt: input.prompt,
                        requirePlanApproval: input.requirePlanApproval,
                    },
                    cred,
                );
                const execution = await createExecution(db, {
                    sessionId,
                    engine: engine.id,
                    externalRef: handle.externalRef,
                    deepLinkUrl: handle.deepLink,
                    prompt: input.prompt,
                });
                return {
                    executionId: execution?.id,
                    deepLink: handle.deepLink,
                };
            },
        }),

        send_instruction: defineTool({
            name: "send_instruction",
            description: "Send guidance to a running coding task.",
            category: "branch_write",
            schema: z.object({ executionId: z.string(), text: z.string() }),
            run: async (input) => {
                await engine.sendMessage(
                    await refOf(input.executionId),
                    input.text,
                    cred,
                );
                return { ok: true };
            },
        }),

        check_progress: defineTool({
            name: "check_progress",
            description: "Get the latest state + activity for a coding task.",
            category: "read",
            schema: z.object({ executionId: z.string() }),
            run: async (input) => {
                const execution = await getExecution(db, input.executionId);
                if (!execution) {
                    throw new Error(`Unknown execution: ${input.executionId}`);
                }
                const activities = await listActivities(db, execution.id);
                return {
                    state: execution.state,
                    activities: activities
                        .slice(-20)
                        .map((a) => ({ kind: a.kind, text: a.text })),
                };
            },
        }),

        get_result: defineTool({
            name: "get_result",
            description: "Get the PR/result of a completed coding task.",
            category: "read",
            schema: z.object({ executionId: z.string() }),
            run: async (input) =>
                engine.getResult(await refOf(input.executionId)),
        }),
    };

    if (engine.caps.planApproval) {
        registry.approve_plan = defineTool({
            name: "approve_plan",
            description: "Approve the plan a coding task is awaiting.",
            category: "branch_write",
            schema: z.object({ executionId: z.string() }),
            run: async (input) => {
                await engine.approvePlan?.(
                    await refOf(input.executionId),
                    cred,
                );
                return { ok: true };
            },
        });
    }

    return registry;
};
