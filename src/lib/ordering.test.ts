import { describe, expect, it } from "vitest";

import {
    evenRanks,
    needsRebalance,
    nextRank,
    rankBetween,
    rankForIndex,
} from "@/lib/ordering";

describe("rankBetween", () => {
    it("seeds the first item when both edges are open", () => {
        expect(rankBetween(null, null)).toBe(1024);
    });

    it("places before the first item", () => {
        expect(rankBetween(null, 1024)).toBe(0);
    });

    it("appends after the last item", () => {
        expect(rankBetween(1024, null)).toBe(2048);
    });

    it("splits the gap between two neighbours", () => {
        expect(rankBetween(1000, 2000)).toBe(1500);
    });
});

describe("rankForIndex", () => {
    const ranks = [1000, 2000, 3000];

    it("lands at the front", () => {
        expect(rankForIndex(ranks, 0)).toBeLessThan(1000);
    });

    it("lands in the middle", () => {
        expect(rankForIndex(ranks, 1)).toBe(1500);
    });

    it("lands at the end", () => {
        expect(rankForIndex(ranks, 3)).toBeGreaterThan(3000);
    });

    it("clamps an out-of-range index to the end", () => {
        expect(rankForIndex(ranks, 99)).toBeGreaterThan(3000);
    });

    it("clamps a negative index to the front", () => {
        expect(rankForIndex(ranks, -5)).toBeLessThan(1000);
    });

    it("seeds an empty list", () => {
        expect(rankForIndex([], 0)).toBe(1024);
    });
});

describe("nextRank", () => {
    it("seeds an empty list", () => {
        expect(nextRank([])).toBe(1024);
    });

    it("appends past the current maximum regardless of order", () => {
        expect(nextRank([3000, 1000, 2000])).toBe(4024);
    });
});

describe("needsRebalance", () => {
    it("flags ranks that have collapsed together", () => {
        expect(needsRebalance(1000, 1000.0000001)).toBe(true);
    });

    it("passes ranks with a usable gap", () => {
        expect(needsRebalance(1000, 1500)).toBe(false);
    });
});

describe("evenRanks", () => {
    it("produces evenly-spaced ranks", () => {
        expect(evenRanks(3)).toEqual([1024, 2048, 3072]);
    });

    it("produces nothing for an empty list", () => {
        expect(evenRanks(0)).toEqual([]);
    });
});
