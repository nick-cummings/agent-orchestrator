import type { z } from "zod";

/**
 * Thin helpers shared by every route handler so wiring stays uniform and the
 * handlers themselves are one-liners. JSON in, JSON out, with a single error
 * shape. Kept in lib/ (covered + testable); routes import these.
 */

export const json = (data: unknown, status = 200): Response =>
    Response.json(data, { status });

export const error = (message: string, status = 400): Response =>
    Response.json({ error: message }, { status });

export const notFound = (what = "Not found"): Response => error(what, 404);

export type Parsed<T> =
    | { ok: true; data: T }
    | { ok: false; response: Response };

/** Parse + validate a request body against a Zod schema, or yield a 400. */
export const parseBody = async <T>(
    request: Request,
    schema: z.ZodType<T>,
): Promise<Parsed<T>> => {
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return { ok: false, response: error("Invalid JSON body") };
    }
    const result = schema.safeParse(raw);
    if (!result.success) {
        return { ok: false, response: error(result.error.issues[0].message) };
    }
    return { ok: true, data: result.data };
};
