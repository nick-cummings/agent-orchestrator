import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveJulesCredential } from "./jules";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("resolveJulesCredential", () => {
    it("resolves the API key from the environment", () => {
        vi.stubEnv("JULES_API_KEY", "secret-key");
        expect(resolveJulesCredential()).toEqual({
            kind: "jules_api_key",
            value: "secret-key",
        });
    });

    it("throws when JULES_API_KEY is unset", () => {
        vi.stubEnv("JULES_API_KEY", "");
        expect(() => resolveJulesCredential()).toThrow(/JULES_API_KEY/);
    });
});
