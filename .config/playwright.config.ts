import { defineConfig, devices } from "@playwright/test";

// E2E proves the real app in a real browser (docs/CODING_STANDARDS.md →
// Testing). Run `npx playwright install` once to fetch browsers before use.
export default defineConfig({
    testDir: "../tests/e2e",
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    reporter: "list",
    use: {
        baseURL: "http://localhost:3000",
        trace: "on-first-retry",
    },
    webServer: {
        command: "npm run build && npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
    // The matrix that matters: a desktop browser and a mobile one, since the
    // primary surface is a phone.
    projects: [
        { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "mobile-webkit", use: { ...devices["iPhone 14"] } },
    ],
});
