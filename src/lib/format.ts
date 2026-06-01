/** Truncate text to `max` characters, appending an ellipsis when it was cut. */
export const truncate = (text: string, max: number): string =>
    text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

/**
 * A card's display title: the trimmed input, or a placeholder when the user
 * hasn't named it yet (see the spec's auto-placeholder card naming).
 */
export const cardTitle = (raw: string): string => {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : "New task";
};
