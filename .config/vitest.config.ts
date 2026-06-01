import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Config lives in .config/, so anchor the project root one level up.
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export default defineConfig({
    root: projectRoot,
    plugins: [react()],
    // Resolve the `@/*` path alias from tsconfig (native in Vite).
    resolve: { tsconfigPaths: true },
    test: {
        environment: "happy-dom",
        globals: true,
        setupFiles: ["./src/test-utils/setup.ts"],
        include: ["src/**/*.test.{ts,tsx}"],
        coverage: {
            provider: "v8",
            reportsDirectory: "./coverage",
            // Only logic + UI carry coverage bars; app/ boilerplate and glue
            // are excluded until they hold real, testable behavior.
            include: ["src/lib/**", "src/components/**"],
            exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts"],
            // Initial floors from docs/CODING_STANDARDS.md → Testing. Raise
            // these as new tests land; never lower them to make red go green.
            thresholds: {
                lines: 85,
                branches: 78,
                functions: 84,
                statements: 88,
                "src/lib/**": {
                    lines: 94,
                    branches: 86,
                    functions: 91,
                    statements: 92,
                },
                "src/components/**": {
                    lines: 88,
                    branches: 76,
                    functions: 86,
                    statements: 84,
                },
            },
        },
    },
});
