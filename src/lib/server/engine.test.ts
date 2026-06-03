import { afterEach, describe, expect, it, vi } from "vitest";

import { getEngine } from "./engine";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("getEngine", () => {
    it("builds the Jules engine from the environment", () => {
        vi.stubEnv("JULES_API_KEY", "k");
        const engine = getEngine();
        expect(engine.id).toBe("jules");
        expect(engine.caps.planApproval).toBe(true);
    });

    it("surfaces the missing-key error", () => {
        vi.stubEnv("JULES_API_KEY", "");
        expect(() => getEngine()).toThrow(/JULES_API_KEY/);
    });
});
