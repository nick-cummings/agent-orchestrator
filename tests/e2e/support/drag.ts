import type { Locator, Page } from "@playwright/test";

/**
 * Drive a dnd-kit pointer drag from one element to another. dnd-kit's
 * PointerSensor activates only after the pointer moves past its distance
 * constraint, so we press, nudge to cross the threshold, travel to the target
 * in steps (collision detection samples intermediate positions), then release.
 * Plain `dragTo` fires too few moves for the sensor to engage.
 */
export const dragTo = async (
    page: Page,
    source: Locator,
    target: Locator,
): Promise<void> => {
    const from = await source.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error("drag source/target not visible");

    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    // Cross the activation threshold (constraint is 4px).
    await page.mouse.move(start.x, start.y + 12, { steps: 5 });
    await page.mouse.move(end.x, end.y, { steps: 12 });
    // Settle squarely over the target before dropping.
    await page.mouse.move(end.x, end.y + 1, { steps: 3 });
    await page.mouse.up();
};
