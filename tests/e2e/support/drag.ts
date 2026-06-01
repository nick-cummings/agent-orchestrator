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

/**
 * Drive a dnd-kit TouchSensor drag with real touch input via the Chromium
 * DevTools Protocol (`Input.dispatchTouchEvent`). The sensor has a press-hold
 * `delay` before it engages, so we touchStart, hold past the delay, then travel
 * to the target in steps before releasing — mirroring a finger drag. CDP is
 * Chromium-only; WebKit can neither construct synthetic touch events nor accept
 * CDP, which is why the touch path is exercised on the mobile-chromium project.
 */
export const touchDragTo = async (
    page: Page,
    source: Locator,
    target: Locator,
): Promise<void> => {
    const from = await source.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error("drag source/target not visible");

    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    const client = await page.context().newCDPSession(page);

    await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: start.x, y: start.y }],
    });
    await page.waitForTimeout(180); // exceed the sensor's activation delay

    const move = async (x: number, y: number) => {
        await client.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x, y }],
        });
        await page.waitForTimeout(16);
    };

    const steps = 12;
    for (let i = 1; i <= steps; i++) {
        await move(
            start.x + ((end.x - start.x) * i) / steps,
            start.y + ((end.y - start.y) * i) / steps,
        );
    }
    // Settle squarely over the target so the final sampled position — what
    // dnd-kit's collision detection reads on drop — is unambiguous. Without
    // this the cross-column drop can flake under parallel load.
    await move(end.x, end.y);
    await move(end.x, end.y);
    await page.waitForTimeout(40);

    await client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
    });
    await client.detach();
};
