# 0002 — Kanban slice: stack & layering

- Status: accepted
- Date: 2026-06-01

## Context

Phase 0 calls for a static kanban — boards → columns → cards CRUD with
drag-to-reorder, organizational only (implementation-plan §9). The domain Zod
schemas and the Drizzle repos already exist; this slice adds the API surface,
the client data layer, and the UI on top. Three choices needed pinning before
building: the drag library, the client data-fetching approach, and how ordering
survives a reorder without rewriting every row.

## Decision

**Dependencies** — the stack named in the README is adopted as-is:

- **`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`** for drag —
  accessible (keyboard sensor available), headless, React 19 compatible, no
  wrapper-div pollution.
- **`@tanstack/react-query`** for server-state — caching, refetch-on-settle,
  loading/error states without hand-rolled reducers. One `QueryClient` per
  browser session (`src/app/providers.tsx`).

**Ordering is a float rank** (`src/lib/ordering.ts`). A reorder writes a single
row: the moved item takes a `position` strictly between its new neighbours
(`rankBetween`), seeded/append-spaced by a `STEP` of 1024. `rebalance` is the
escape hatch when ranks collapse. This keeps a drag O(1) writes, matching the
`position`-as-float schema comment.

**Logic in `lib/`, wiring in `app/`.** Route handlers under `src/app/api/**`
stay thin — parse params, call `getDb()`, delegate — because the coverage gate
only counts `src/lib/**` and `src/components/**`. The testable logic lives in
lib: request validation (`lib/api/requests.ts` Zod schemas), the response
helpers (`lib/api/respond.ts`), the typed fetch client (`lib/api/client.ts`),
the board read model (`lib/db/boardView.ts`), and the drag maths
(`lib/kanban/move.ts`). Routes are still exercised end-to-end by
`src/app/api/routes.test.ts` against a PGlite database.

**Card moves carry a server-agnostic body** — `{ columnId, position }`. The
client computes the target rank (`planCardMove` → `resolveDragMove`) from the
current board view and posts it; the server just writes it.

## Consequences

- A reorder never cascades writes, and the optimistic-broadcast story in
  implementation-plan §8 can layer on top later (the mutation already
  re-fetches the board on settle as a baseline).
- `lib/kanban/move.ts` is pure and fully unit-tested, so the dnd-kit
  `onDragEnd` handler is a one-liner; the drag _maths_ are verified without
  simulating a pointer drag (which happy-dom can't do reliably). The handler
  invocation itself is covered by the E2E layer, not the unit gate.
- React Query v5 passes a context object as a second argument to `mutationFn`;
  mutation wrappers therefore call the API client explicitly
  (`(vars) => api.fn(vars)`) rather than passing the client function by
  reference, so the extra argument never leaks.
- Adding GitLab/other VCS or realtime later does not touch this layer — it is
  the concrete, non-volatile part of the system per the "two seams only" rule.

## Addendum — touch input & drag testing (2026-06-01)

Touch support was added after the initial slice. Two judgments worth recording:

- **`MouseSensor` + `TouchSensor`, not `PointerSensor`.** `PointerSensor`
  captures touch too (as pointer events), so its `distance` constraint would
  pre-empt a touch press-hold and turn a scroll swipe into a drag. Separate
  sensors give each input its own activation: mouse drags after a 4px nudge;
  touch requires a short press-hold (`delay` + `tolerance`) so a swipe still
  scrolls. The drag handle sets `touch-action: none` so an engaged touch drag
  isn't hijacked by the browser's scroll gesture.
- **Touch is E2E-tested on Chromium, not WebKit.** Playwright cannot construct
  synthetic touch events in WebKit (the `Touch`/`TouchEvent` constructors throw
  `Illegal constructor`) and CDP touch injection is Chromium-only. So the
  `TouchSensor` is exercised with real touch (CDP `Input.dispatchTouchEvent`) on
  a `mobile-chromium` (Pixel 7) project; `mobile-webkit` keeps the
  render/create/rename coverage and skips drag. Cross-column drag is desktop-
  only — both columns must be on-screen, which a phone-width viewport can't fit.
  This is a harness limitation, surfaced via `test.skip` reasons rather than
  hidden.
