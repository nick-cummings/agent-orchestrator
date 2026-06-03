import { expect, test, type Locator, type Page } from "@playwright/test";

import { dragTo, touchDragTo } from "./support/drag";
import { installMockApi, type MockSeed } from "./support/mockApi";

/**
 * Real-browser coverage for the kanban interactions that happy-dom can't reach
 * — chiefly dnd-kit drag-to-reorder — backed by an in-memory API mock so the
 * suite needs no database. Render/create/rename run on every project; the drag
 * flows run as a mouse/PointerSensor drag on desktop-chromium and a real
 * touch/TouchSensor drag on mobile-chromium (WebKit is skipped for drag — see
 * the describe block).
 */

const seed: MockSeed = {
    board: { id: "b1", name: "Demo" },
    columns: [
        {
            id: "todo",
            name: "Todo",
            cards: [
                { id: "a", title: "A", position: 1024 },
                { id: "b", title: "B", position: 2048 },
                { id: "c", title: "C", position: 3072 },
            ],
        },
        {
            id: "doing",
            name: "Doing",
            cards: [{ id: "x", title: "X", position: 1024 }],
        },
    ],
};

const column = (page: Page, name: string): Locator =>
    page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name }) });

const top = async (card: Locator): Promise<number> => {
    const box = await card.boundingBox();
    if (!box) throw new Error("card not visible");
    return box.y;
};

test.beforeEach(async ({ page }) => {
    await installMockApi(page, seed);
    await page.goto("/board/b1");
    await expect(page.getByRole("heading", { name: "Demo" })).toBeVisible();
});

test("opens a card's session view from the board", async ({ page }) => {
    await column(page, "Todo").getByRole("link", { name: "Open A" }).click();
    await expect(page).toHaveURL(/\/card\/a$/);
    await expect(
        page.getByRole("button", { name: "Start task" }),
    ).toBeVisible();
});

test("renders the seeded columns and cards", async ({ page }) => {
    await expect(
        column(page, "Todo").getByText("A", { exact: true }),
    ).toBeVisible();
    await expect(
        column(page, "Todo").getByText("C", { exact: true }),
    ).toBeVisible();
    await expect(
        column(page, "Doing").getByText("X", { exact: true }),
    ).toBeVisible();
});

test("creates a card through the inline form", async ({ page }) => {
    const todo = column(page, "Todo");
    await todo.getByRole("button", { name: "+ Add card" }).click();
    await todo.getByLabel("Card title").fill("Fresh task");
    await todo.getByLabel("Card title").press("Enter");
    await expect(todo.getByText("Fresh task", { exact: true })).toBeVisible();
});

test("renames a card inline and the new title survives a refetch", async ({
    page,
}) => {
    const todo = column(page, "Todo");
    await todo.getByText("B", { exact: true }).dblclick();
    const input = todo.getByLabel("Card title");
    await input.fill("Renamed");
    await input.press("Enter");
    await expect(todo.getByText("Renamed", { exact: true })).toBeVisible();
    await expect(todo.getByText("B", { exact: true })).toHaveCount(0);
});

test.describe("drag-to-reorder", () => {
    // Touch input can only be injected into Chromium (via CDP), not WebKit, so
    // the touch path runs on mobile-chromium and WebKit drag is skipped here.
    // The PointerSensor path runs on desktop. Both reach the same move.
    test.skip(
        ({ browserName }) => browserName === "webkit",
        "Playwright cannot synthesize touch in WebKit — touch is covered on mobile-chromium",
    );

    const dragFor = (page: Page, projectName: string) =>
        projectName === "mobile-chromium"
            ? touchDragTo.bind(null, page)
            : dragTo.bind(null, page);

    test("reorders a card within its column", async ({ page }, testInfo) => {
        const todo = column(page, "Todo");
        const card = (t: string) => todo.getByText(t, { exact: true });

        // A starts above B; drag A onto C → order becomes B, A, C.
        await dragFor(page, testInfo.project.name)(card("A"), card("C"));

        await expect
            .poll(async () => (await top(card("A"))) > (await top(card("B"))))
            .toBe(true);
        await expect
            .poll(async () => (await top(card("A"))) < (await top(card("C"))))
            .toBe(true);
    });

    test("moves a card across columns", async ({ page }, testInfo) => {
        // The second column sits off-canvas on a phone-width viewport, so its
        // drop target isn't reachable by a touch at its coordinates. The touch
        // path is proven by the within-column reorder above; cross-column drag
        // runs on the desktop viewport where both columns are visible.
        test.skip(
            testInfo.project.name === "mobile-chromium",
            "destination column is off-canvas on a phone viewport",
        );
        const todo = column(page, "Todo");
        const doing = column(page, "Doing");

        await dragFor(page, testInfo.project.name)(
            todo.getByText("A", { exact: true }),
            doing.getByText("X", { exact: true }),
        );

        await expect(doing.getByText("A", { exact: true })).toBeVisible();
        await expect(todo.getByText("A", { exact: true })).toHaveCount(0);
    });
});
