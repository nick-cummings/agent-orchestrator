import type {
    CreateBoardBody,
    CreateCardBody,
    CreateColumnBody,
    MoveCardBody,
    UpdateCardBody,
    UpdateColumnBody,
} from "@/lib/api/requests";
import type { Board } from "@/lib/db/boards";
import type { BoardView } from "@/lib/db/boardView";
import type { Card } from "@/lib/db/cards";
import type { Column } from "@/lib/db/columns";

/**
 * Typed fetch wrappers over the kanban API — the single seam between the React
 * Query hooks and the network. Every call funnels through `send`, which owns
 * JSON encoding and turns a non-2xx into a thrown `Error` (so React Query sees
 * a rejected promise). Mocked at the `fetch` level in tests.
 */

const send = async <T>(
    method: string,
    url: string,
    body?: unknown,
): Promise<T> => {
    const response = await fetch(url, {
        method,
        headers:
            body === undefined
                ? undefined
                : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as {
            error?: string;
        } | null;
        throw new Error(
            detail?.error ?? `Request failed (${String(response.status)})`,
        );
    }
    return response.json() as Promise<T>;
};

export const fetchBoards = (): Promise<Board[]> => send("GET", "/api/boards");

export const fetchBoardView = (boardId: string): Promise<BoardView> =>
    send("GET", `/api/boards/${boardId}`);

export const createBoard = (body: CreateBoardBody): Promise<Board> =>
    send("POST", "/api/boards", body);

export const createColumn = (body: CreateColumnBody): Promise<Column> =>
    send("POST", "/api/columns", body);

export const updateColumn = (
    id: string,
    body: UpdateColumnBody,
): Promise<Column> => send("PATCH", `/api/columns/${id}`, body);

export const deleteColumn = (id: string): Promise<void> =>
    send("DELETE", `/api/columns/${id}`);

export const createCard = (body: CreateCardBody): Promise<Card> =>
    send("POST", "/api/cards", body);

export const updateCard = (id: string, body: UpdateCardBody): Promise<Card> =>
    send("PATCH", `/api/cards/${id}`, body);

export const moveCard = (id: string, body: MoveCardBody): Promise<Card> =>
    send("POST", `/api/cards/${id}/move`, body);

export const deleteCard = (id: string): Promise<void> =>
    send("DELETE", `/api/cards/${id}`);
