import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { defineTool, runTool, specsOf, type ToolRegistry } from "./tools";

const echo = defineTool({
    name: "echo",
    description: "Echoes a number",
    category: "read",
    schema: z.object({ x: z.number() }),
    run: (input) => Promise.resolve({ got: input.x }),
});
const registry: ToolRegistry = { echo };

describe("defineTool / runTool", () => {
    it("validates input through the schema, then runs the typed handler", async () => {
        expect(await runTool(registry, "echo", { x: 5 })).toEqual({ got: 5 });
    });

    it("throws on input that fails the schema", () => {
        expect(() => runTool(registry, "echo", { x: "nope" })).toThrow();
    });

    it("throws on an unknown tool", () => {
        expect(() => runTool(registry, "ghost", {})).toThrow(/Unknown tool/);
    });

    it("only calls the handler with parsed input", async () => {
        const run = vi.fn(() => Promise.resolve("ok"));
        const tool = defineTool({
            name: "t",
            description: "d",
            category: "read",
            schema: z.object({ n: z.number() }),
            run,
        });
        await runTool({ t: tool }, "t", { n: 1, extra: "stripped" });
        expect(run).toHaveBeenCalledWith({ n: 1 });
    });
});

describe("specsOf", () => {
    it("exposes name/description/schema for the Brain", () => {
        const specs = specsOf(registry);
        expect(specs).toHaveLength(1);
        expect(specs[0]).toMatchObject({
            name: "echo",
            description: "Echoes a number",
        });
        expect(specs[0].schema).toBe(echo.schema);
    });
});
