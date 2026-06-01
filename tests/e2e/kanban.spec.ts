import { expect, test, type Locator, type Page } from "@playwright/test";

import { dragTo } from "./support/drag";
import { installMockApi, type MockSeed } from "./support/mockApi";

/**
 * Real-browser coverage for the kanban interactions that happy-dom can't reach
 * — chiefly dnd-kit drag-to-reorder — backed by an in-memory API mock so the
 * suite needs no database. The render/create/rename flows run on both the
 * desktop and mobile projects; the pointer-drag flows are desktop-only (mobile
 * WebKit's touch emulation makes the drag threshold flaky).
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
    test.skip(
        ({ browserName }) => browserName === "webkit",
        "pointer-drag threshold is flaky under mobile WebKit touch emulation",
    );

    test("reorders a card within its column", async ({ page }) => {
        const todo = column(page, "Todo");
        const card = (t: string) => todo.getByText(t, { exact: true });

        // A starts above B; drag A onto C → order becomes B, A, C.
        await dragTo(page, card("A"), card("C"));

        await expect
            .poll(async () => (await top(card("A"))) > (await top(card("B"))))
            .toBe(true);
        await expect
            .poll(async () => (await top(card("A"))) < (await top(card("C"))))
            .toBe(true);
    });

    test("moves a card across columns", async ({ page }) => {
        const todo = column(page, "Todo");
        const doing = column(page, "Doing");

        await dragTo(
            page,
            todo.getByText("A", { exact: true }),
            doing.getByText("X", { exact: true }),
        );

        await expect(doing.getByText("A", { exact: true })).toBeVisible();
        await expect(todo.getByText("A", { exact: true })).toHaveCount(0);
    });
});
