# 0001 — Config inheritance merge semantics

- Status: accepted
- Date: 2026-06-01

## Context

A card's effective `Config` is the merge of three tiers — user → board → card —
most-specific-defined-wins (spec §3.8, implementation-plan §6). The spec left
the precise merge behaviour for nested objects and arrays unspecified, which is
exactly the kind of ambiguity that surfaces later as a confusing inheritance
bug. `Config` mixes three shapes that could each merge differently: scalars
(`verbosity`, `systemPrompt`, `requirePlanApproval`), records (`routing`,
`approvalPolicy`), and arrays (`skillIds`, `defaultRepos`). We need one rule per
shape, fixed now, before any settings UI is built against it.

## Decision

`resolveConfig(user, board, card)` folds `[BASE_CONFIG, user, board, card]` with
a pairwise merge (`src/lib/core/config.ts`):

- **Scalars** — a defined value at a more specific tier replaces the less
  specific one; `undefined` inherits.
- **Records (`routing`, `approvalPolicy`)** — merged **per key**, so a tier can
  override a single field/category (e.g. board sets `executor`, brain still
  inherits; a card flips only `destructive` to `auto`) and inherit the rest.
- **Arrays (`skillIds`, `defaultRepos`)** — **replace**, not concatenate. The
  most specific tier that defines the array wins outright.
- Keys that resolve to `undefined` are stripped, so a field reads as genuinely
  unset rather than `{ key: undefined }`.
- `BASE_CONFIG` is the leftmost tier, so the result is always fully populated;
  clearing a card override falls back to board → user → base.

## Consequences

- The settings UI can show each value as _inherited_ or _overridden_ by
  comparing a tier's raw `Config` against the resolved one — the merge is pure
  and deterministic.
- **Array-replace means skill activation does not union across tiers.** The spec
  describes a card's active skills as the _union_ of switched-on user/board
  skills. That is a separate concern — activation/visibility from the Skill
  _library_ — and will be resolved by a dedicated `resolveSkills` step in
  Phase 3, not by `Config` merge. Documented here so the two are not conflated.
- Reversible: changing array semantics to union later is a localized change in
  `mergeTwo` plus its tests. If we do, this ADR is superseded, not edited.
