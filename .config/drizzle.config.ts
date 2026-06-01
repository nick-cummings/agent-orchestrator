import { defineConfig } from "drizzle-kit";

const DEV_URL =
    "postgresql://orchestrator:orchestrator@localhost:5432/orchestrator";

// Migrations are SQL artifacts → infra/db/migrations. `generate` runs offline;
// `migrate`/`push` use DATABASE_URL (the Docker Compose DB in dev).
export default defineConfig({
    dialect: "postgresql",
    schema: "./src/lib/db/schema.ts",
    out: "./infra/db/migrations",
    dbCredentials: {
        url: process.env.DATABASE_URL ?? DEV_URL,
    },
});
