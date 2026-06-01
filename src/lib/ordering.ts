/**
 * Fractional ranking for drag-to-reorder. A reorder is a single-row write: the
 * moved item gets a new `position` strictly between its new neighbours, so the
 * other rows never shift (implementation-plan §7, schema `position` is a float
 * rank). Ranks are dense reals; `rebalance` is the escape hatch when they get
 * too close to halve cleanly.
 */

/** Gap used when seeding the first item or appending past the end. */
const STEP = 1024;

/** A rank for an item dropped between `before` and `after` (either may be null
 *  for the list edges). Both null → the first item in an empty list. */
export const rankBetween = (
    before: number | null,
    after: number | null,
): number => {
    if (before === null) return after === null ? STEP : after - STEP;
    if (after === null) return before + STEP;
    return (before + after) / 2;
};

/**
 * The rank an item should take to land at `toIndex` in `ranks` — the ordered
 * list of the *other* items' ranks (the moved item already removed). Pure, so
 * the drag handler stays thin and this is what the tests pin down.
 */
export const rankForIndex = (ranks: number[], toIndex: number): number => {
    const clamped = Math.max(0, Math.min(toIndex, ranks.length));
    const before = clamped > 0 ? ranks[clamped - 1] : null;
    const after = clamped < ranks.length ? ranks[clamped] : null;
    return rankBetween(before, after);
};

/** The rank for a new item appended to the end of a list of `ranks`. */
export const nextRank = (ranks: number[]): number =>
    rankBetween(ranks.length > 0 ? Math.max(...ranks) : null, null);

/** Whether two adjacent ranks have collapsed too close to split again. */
export const needsRebalance = (a: number, b: number): boolean =>
    Math.abs(a - b) < 1e-6;

/** Evenly-spaced ranks for `count` items — used to seed or rebalance a list. */
export const evenRanks = (count: number): number[] =>
    Array.from({ length: count }, (_, i) => (i + 1) * STEP);
