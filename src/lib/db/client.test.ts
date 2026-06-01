// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_URL = process.env.DATABASE_URL;

afterEach(() => {
    if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_URL;
    vi.resetModules();
});

describe("getDb", () => {
    it("throws a helpful error when DATABASE_URL is unset", async () => {
        delete process.env.DATABASE_URL;
        vi.resetModules();
        const { getDb } = await import("@/lib/db/client");
        expect(() => getDb()).toThrow(/DATABASE_URL/);
    });

    it("constructs once and caches the handle", async () => {
        process.env.DATABASE_URL =
            "postgresql://orchestrator:orchestrator@localhost:5432/orchestrator";
        vi.resetModules();
        const { getDb } = await import("@/lib/db/client");
        expect(getDb()).toBe(getDb());
    });
});
