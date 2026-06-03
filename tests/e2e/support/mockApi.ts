import type { Page, Route } from "@playwright/test";

/**
 * An in-memory mock of the kanban API, installed via `page.route` so E2E stays
 * infra-independent (no Postgres/Docker) while still exercising the real
 * browser, real dnd-kit, and the real request→refetch→re-render loop. Writes
 * mutate the store, so a GET after a move/create/rename reflects the change —
 * exactly what the UI assertions depend on.
 */

export type MockCard = { id: string; title: string; position: number };
export type MockColumn = { id: string; name: string; cards: MockCard[] };
export type MockSeed = {
    board: { id: string; name: string };
    columns: MockColumn[];
};

const json = (route: Route, data: unknown, status = 200) =>
    route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
    });

export const installMockApi = async (
    page: Page,
    seed: MockSeed,
): Promise<void> => {
    // Deep clone so each test gets isolated, mutable state.
    const board = { ...seed.board };
    const columns: MockColumn[] = seed.columns.map((c) => ({
        ...c,
        cards: c.cards.map((card) => ({ ...card })),
    }));

    const findCard = (id: string) => {
        for (const col of columns) {
            const card = col.cards.find((c) => c.id === id);
            if (card) return { col, card };
        }
        return null;
    };

    const view = () => ({
        board,
        columns: columns.map((col) => ({
            id: col.id,
            boardId: board.id,
            name: col.name,
            position: 1,
            cards: [...col.cards].sort((a, b) => a.position - b.position),
        })),
    });

    await page.route("**/api/**", async (route) => {
        const request = route.request();
        const method = request.method();
        const parts = new URL(request.url()).pathname
            .split("/")
            .filter(Boolean);
        // parts: ["api", <resource>, <id?>, <action?>]
        const [, resource, id, action] = parts;
        const body = (
            ["POST", "PATCH"].includes(method) ? request.postDataJSON() : null
        ) as Record<string, unknown> | null;

        if (resource === "boards" && method === "GET" && !id)
            return json(route, [{ id: board.id, name: board.name }]);

        if (resource === "boards" && method === "GET" && id)
            return json(route, view());

        // Card session read model — empty (no execution started in E2E).
        if (resource === "cards" && action === "session" && method === "GET")
            return json(route, { session: null, executions: [] });

        if (resource === "cards" && method === "POST" && !id) {
            const col = columns.find((c) => c.id === body?.columnId);
            if (!col) return json(route, { error: "no column" }, 404);
            const card: MockCard = {
                id: `card-${String(col.cards.length + 1)}-${col.id}`,
                title: (body?.title as string | undefined) ?? "New task",
                position:
                    Math.max(0, ...col.cards.map((c) => c.position)) + 1024,
            };
            col.cards.push(card);
            return json(route, card, 201);
        }

        if (resource === "cards" && action === "move" && method === "POST") {
            const hit = findCard(id);
            if (!hit) return json(route, { error: "not found" }, 404);
            hit.col.cards = hit.col.cards.filter((c) => c.id !== id);
            const dest = columns.find((c) => c.id === body?.columnId);
            if (!dest) return json(route, { error: "no column" }, 404);
            hit.card.position = body?.position as number;
            dest.cards.push(hit.card);
            return json(route, hit.card);
        }

        if (resource === "cards" && method === "PATCH" && id) {
            const hit = findCard(id);
            if (!hit) return json(route, { error: "not found" }, 404);
            if (typeof body?.title === "string") hit.card.title = body.title;
            return json(route, hit.card);
        }

        return json(
            route,
            { error: `unhandled ${method} /${parts.join("/")}` },
            404,
        );
    });
};
