import { describe, expect, it } from "vitest";
import { z } from "zod";

import { error, json, notFound, parseBody } from "@/lib/api/respond";

const Body = z.object({ name: z.string().min(1) });

const req = (body: string): Request =>
    new Request("http://test/x", { method: "POST", body });

describe("response helpers", () => {
    it("json defaults to 200 and carries the payload", async () => {
        const res = json({ a: 1 });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ a: 1 });
    });

    it("error defaults to 400 with an error shape", async () => {
        const res = error("bad");
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "bad" });
    });

    it("notFound is a 404", () => {
        expect(notFound().status).toBe(404);
    });
});

describe("parseBody", () => {
    it("returns parsed data on a valid body", async () => {
        const result = await parseBody(
            req(JSON.stringify({ name: "x" })),
            Body,
        );
        expect(result).toEqual({ ok: true, data: { name: "x" } });
    });

    it("rejects malformed JSON with a 400", async () => {
        const result = await parseBody(req("{not json"), Body);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.response.status).toBe(400);
    });

    it("rejects a schema violation with the first issue message", async () => {
        const result = await parseBody(req(JSON.stringify({ name: "" })), Body);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.response.status).toBe(400);
            expect(await result.response.json()).toHaveProperty("error");
        }
    });
});
