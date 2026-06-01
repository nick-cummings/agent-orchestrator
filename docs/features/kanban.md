# Feature: Kanban (Phase 0)

The organizational kanban — boards, columns, and cards with drag-to-reorder.
This is the visual workspace shell; it is **organizational only** (dragging a
card never triggers a workflow, per the README design principles). Agent
conversations and executions land on cards in later phases.

## What it does

- **Boards index** (`/`) — list boards, create a board, open one.
- **Board view** (`/board/[boardId]`) — columns left-to-right, each with its
  cards top-to-bottom.
- **Create** — add a column to a board; add a card to a column. Both use the
  shared inline-create affordance (a button that expands to an input).
- **Rename** — double-click a column header or a card title to edit inline.
- **Delete** — remove a card or a column (cascades to its cards).
- **Reorder** — drag a card within its column or across columns. Drag is
  pointer- and keyboard-accessible (dnd-kit sensors).
- **Resilience** — loading and error states throughout; the boards index
  renders its shell even when the API/DB is unreachable.

## Data model

Backed by the existing domain schemas (`src/lib/core/schemas.ts`) and Drizzle
repos (`src/lib/db/`): `boards` → `columns` → `cards`. Ordering is a float
`position` per row; a reorder is a single-row write (see
[ADR 0002](../decisions/0002-kanban-stack.md) and `src/lib/ordering.ts`).
Single-user for now — a fixed `local` owner id is the seam auth replaces later.

## API

Thin route handlers under `src/app/api/**` delegate to lib logic. All bodies
are validated with Zod (`src/lib/api/requests.ts`).

| Method & path               | Purpose                            |
| --------------------------- | ---------------------------------- |
| `GET /api/boards`           | List boards                        |
| `POST /api/boards`          | Create a board                     |
| `GET /api/boards/{id}`      | Board read model (columns + cards) |
| `PATCH /api/boards/{id}`    | Rename / reorder a board           |
| `DELETE /api/boards/{id}`   | Delete a board                     |
| `POST /api/columns`         | Create a column                    |
| `PATCH /api/columns/{id}`   | Rename / reorder a column          |
| `DELETE /api/columns/{id}`  | Delete a column                    |
| `POST /api/cards`           | Create a card                      |
| `PATCH /api/cards/{id}`     | Edit a card (title / description)  |
| `POST /api/cards/{id}/move` | Move a card (target column + rank) |
| `DELETE /api/cards/{id}`    | Delete a card                      |

The client talks to these through the typed fetch wrappers in
`src/lib/api/client.ts`; React Query (`src/app/providers.tsx`) owns caching and
refetch-on-settle.

## Where the code lives

- **Logic (tested):** `src/lib/ordering.ts`, `src/lib/kanban/move.ts`,
  `src/lib/db/boardView.ts`, `src/lib/api/{requests,respond,client}.ts`.
- **UI:** `src/components/kanban/` — `BoardList`, `BoardView`, `KanbanColumn`,
  `KanbanCard`, `InlineCreate`.
- **Routes:** `src/app/api/**`, pages `src/app/page.tsx` and
  `src/app/board/[boardId]/page.tsx`.

## How it's tested

- **Unit** — ranking (`ordering.test.ts`), drag maths (`kanban/move.test.ts`),
  validation/response helpers, the board read model, the fetch client (mocked
  at `fetch`).
- **Integration** — every route end-to-end against a PGlite database
  (`src/app/api/routes.test.ts`); component wiring with a React Query client and
  a mocked API client (`BoardView`, `BoardList`, `KanbanColumn`).
- **E2E** (`tests/e2e/`) — the boards index renders (`smoke.spec.ts`); and the
  kanban interactions that happy-dom can't reach (`kanban.spec.ts`): render,
  inline create, inline rename, and — the reason E2E exists here — **dnd-kit
  drag-to-reorder**. These run against an in-memory API mock
  (`tests/e2e/support/mockApi.ts`) installed via `page.route`, so the suite
  needs no database; writes mutate the mock so the request→refetch→re-render
  loop is real. Drag helpers live in `support/drag.ts`.

    The project matrix and what drags where:

    | Project          | Browser / device   | Drag input                       |
    | ---------------- | ------------------ | -------------------------------- |
    | desktop-chromium | Desktop Chrome     | mouse → `MouseSensor`            |
    | mobile-chromium  | Pixel 7 (touch)    | real touch (CDP) → `TouchSensor` |
    | mobile-webkit    | iPhone 14 (WebKit) | drag skipped (see below)         |

    Mouse drag uses stepped `page.mouse` moves; touch drag injects real touch via
    the Chromium DevTools Protocol (`Input.dispatchTouchEvent`), honouring the
    sensor's press-hold delay. **WebKit drag is skipped** — Playwright can neither
    construct synthetic touch events nor drive touch via CDP in WebKit, so the
    TouchSensor is proven on mobile-chromium instead. **Cross-column drag is
    desktop-only** — on a phone-width viewport the second column is off-canvas, so
    its drop target isn't reachable; the within-column touch reorder proves the
    TouchSensor, and desktop covers the cross-column case.

The drag _maths_ are also unit-tested via `resolveDragMove`; the E2E layer
proves the real mouse and touch interactions end-to-end.

## Not yet

Optimistic/broadcast multi-tab reconcile (implementation-plan §8), board/column
reorder UI (the API exists; only card drag is wired in the UI), and card
archive UI. Cards are organizational shells until Phase 1 attaches executions.
