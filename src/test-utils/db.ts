import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

/**
 * A fresh in-process Postgres (PGlite) with all migrations applied — used by
 * repo integration tests so the gate never depends on a running Docker daemon.
 * Same schema + same migration SQL as the real Postgres. Cast to `Db`: PGlite
 * and postgres-js are different drizzle drivers but share the query API.
 */
export const createTestDb = async (): Promise<Db> => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: "infra/db/migrations" });
    return db as unknown as Db;
};
