import { describe, expect, it } from "vitest";

import { cardTitle, truncate } from "./format";

describe("truncate", () => {
    it("returns short text unchanged", () => {
        expect(truncate("hello", 80)).toBe("hello");
    });

    it("returns text at exactly the max unchanged", () => {
        expect(truncate("hello", 5)).toBe("hello");
    });

    it("cuts longer text and appends an ellipsis", () => {
        expect(truncate("abcdefgh", 5)).toBe("abcde…");
    });

    it("trims trailing whitespace before the ellipsis", () => {
        expect(truncate("abc      defg", 5)).toBe("abc…");
    });
});

describe("cardTitle", () => {
    it("trims surrounding whitespace", () => {
        expect(cardTitle("  Fix the poller  ")).toBe("Fix the poller");
    });

    it("falls back to a placeholder for empty or blank input", () => {
        expect(cardTitle("")).toBe("New task");
        expect(cardTitle("   ")).toBe("New task");
    });
});
