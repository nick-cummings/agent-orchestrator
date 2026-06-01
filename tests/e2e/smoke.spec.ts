import { expect, test } from "@playwright/test";

// The home screen is the boards index. It renders its shell (heading + create
// affordance) regardless of whether the API/DB is reachable, so this smoke
// test stays infra-independent.
test("home page renders the boards index", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Boards" })).toBeVisible();
    await expect(
        page.getByRole("button", { name: "+ New board" }),
    ).toBeVisible();
});
