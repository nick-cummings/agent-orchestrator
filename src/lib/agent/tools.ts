import type { z } from "zod";

import type { ToolSpec } from "@/lib/core/contracts";
import type { ActionCategory } from "@/lib/core/schemas";

/**
 * The tool registry the agent loop runs against (implementation-plan §5). A
 * tool pairs a Zod params schema with a handler and an `ActionCategory` the
 * approval gate keys off. `defineTool` erases the param type at the boundary:
 * the stored `run` takes `unknown` and validates with the schema before calling
 * the typed handler — so the registry is `Record<string, Tool>` with no `any`.
 */

export type Tool = {
    name: string;
    description: string;
    category: ActionCategory;
    schema: z.ZodType;
    run: (input: unknown) => Promise<unknown>;
};

export type ToolRegistry = Record<string, Tool>;

export type ToolDef<I> = {
    name: string;
    description: string;
    category: ActionCategory;
    schema: z.ZodType<I>;
    run: (input: I) => Promise<unknown>;
};

export const defineTool = <I>(def: ToolDef<I>): Tool => ({
    name: def.name,
    description: def.description,
    category: def.category,
    schema: def.schema,
    run: (input) => def.run(def.schema.parse(input)),
});

/** Model-facing specs (the loop hands these to the Brain). */
export const specsOf = (registry: ToolRegistry): ToolSpec[] =>
    Object.values(registry).map((tool) => ({
        name: tool.name,
        description: tool.description,
        schema: tool.schema,
    }));

/** Validate (inside `run`) and execute a tool by name. */
export const runTool = (
    registry: ToolRegistry,
    name: string,
    input: unknown,
): Promise<unknown> => {
    // Record index is typed non-nullable; check membership with `in`.
    if (!(name in registry)) throw new Error(`Unknown tool: ${name}`);
    return registry[name].run(input);
};
