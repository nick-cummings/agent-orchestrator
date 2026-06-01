/**
 * Narrow `T | undefined | null` to `T` in tests, throwing if absent. Lets test
 * code use repo return values (typed nullable because an insert/update *could*
 * miss) without `as`-casts or non-null `!` assertions.
 */
export const must = <T>(value: T | undefined | null): T => {
    if (value === undefined || value === null) {
        throw new Error("Expected a value, got null/undefined");
    }
    return value;
};
