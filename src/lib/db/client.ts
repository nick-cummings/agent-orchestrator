import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";

/**
 * The runtime database handle (postgres-js → the Docker Compose Postgres in dev,
 * managed Postgres in prod). Repo functions take a `Db` as their first argument
 * — deps injected, not a module singleton — so tests can pass a PGlite-backed
 * `Db` instead (see src/test-utils/db.ts).
 */
export type Db = PostgresJsDatabase<typeof schema>;

let cached: Db | undefined;

export const getDb = (): Db => {
    if (cached) return cached;
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error(
            "DATABASE_URL is not set — start infra/ Postgres first",
        );
    }
    cached = drizzle(postgres(url), { schema });
    return cached;
};
