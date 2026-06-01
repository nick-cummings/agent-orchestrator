# Coding Standards

The engineering standards distilled from this project, written to be
**portable** — pick them up for a new repo. Each section states the
_principle_, then _how it's enforced_ so the rule isn't just a vibe.

The throughline: **catch mistakes mechanically, not in review.** A standard
that isn't wired into `lint`, `typecheck`, `test`, or a git hook is a
suggestion, and suggestions rot. Every rule below has a gate behind it.

## Contents

1. [The verification gate](#the-verification-gate)
2. [Formatting](#formatting)
3. [TypeScript](#typescript)
4. [Linting](#linting)
5. [Code organization](#code-organization)
6. [Design principles (DRY / SOLID)](#design-principles-dry--solid)
7. [Testing](#testing)
8. [Styling & design tokens](#styling--design-tokens)
9. [Accessibility](#accessibility)
10. [Documentation](#documentation)
11. [Git & commits](#git--commits)

---

## The verification gate

Everything else hangs off one idea: a single command tells you whether the
code is fit to push. Layer it by speed so the fast checks run constantly and
the slow ones run before you push.

| Command         | Runs                               | Speed | When                |
| --------------- | ---------------------------------- | ----- | ------------------- |
| `verify:static` | format check + typecheck + lint    | ~5s   | constantly, on save |
| `verify:fast`   | `verify:static` + unit/integration | ~10s  | before every commit |
| `verify`        | `verify:fast` + E2E                | ~5min | before push; in CI  |

```jsonc
// package.json scripts
"verify:static": "npm run format:check && npm run typecheck && npm run lint",
"verify:fast":   "npm run verify:static && npm run test:run",
"verify":        "npm run verify:fast && npm run test:e2e",
```

Rules:

- **Iterate on `verify:fast`; run full `verify` once before you push.** Don't
  pay the E2E cost on every save.
- **CI runs the full `verify` on every push to every branch** (and on PRs once
  those resume at 1.0). CI — not the local hook — is the source of truth. A
  feature branch's CI run is the **pre-merge gate**: it must be green before the
  branch fast-forwards into `main`, which then re-confirms on the `main` push.
  Pre-1.0 we merge branches directly rather than open PRs.
- **A pre-push git hook (Husky) runs `verify`**, but is _change-aware_:
  docs/CI/meta-only pushes (`*.md`, `docs/**`, `.github/**`, dotfiles) skip the
  test suites and run only `verify:static`. Code-affecting changes run the full
  suite. This keeps doc pushes instant without weakening the gate on code.
- **Typecheck runs before lint.** With type-aware lint rules, lint is
  downstream of types — a `tsc` failure should report as a type error first,
  not a confusing lint error.

## Formatting

Formatting is **not a matter of opinion or review** — a formatter owns it
entirely. Never hand-format; never argue about it in review.

Prettier, with this config:

```json
{
    "semi": true,
    "singleQuote": false,
    "trailingComma": "all",
    "printWidth": 80,
    "tabWidth": 4,
    "arrowParens": "always"
}
```

- `format` writes; `format:check` verifies (the version in the gate).
- The formatter and the linter are kept in separate lanes: `eslint-config-prettier`
  is loaded **last** in the ESLint config to switch off every stylistic rule
  that would fight Prettier. ESLint never shells out to Prettier.
- Generated artifacts, lockfiles, and throwaway scratch dirs are in
  `.prettierignore` — don't format what you don't own.

## TypeScript

**`strict` is non-negotiable.** The whole point of TypeScript is the strict
flags; turning them off keeps the syntax tax while discarding the benefit.

```jsonc
{
    "strict": true,
    "noEmit": true, // a bundler emits; tsc only type-checks
    "isolatedModules": true,
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./src/*"] }, // absolute imports, no ../../.. chains
}
```

- **Path alias `@/` for `src/`.** No deep relative-import chains.
- **No `any` in product code** (it's relaxed only in test files). When you
  reach for `any`, you've usually found a missing type, not an exception.
- Type-aware lint is enabled, which means the linter sees real types — this is
  what makes the strict rules below possible.

## Linting

The default `create-next-app`/framework lint config is intentionally
permissive. **Run the strictest practical tier**, then turn off individual
rules — with a comment explaining each — when one is genuinely net-negative.
Overrides are the exception, never the default.

This project runs "tier 3":

- `typescript-eslint` `strict-type-checked` + `stylistic-type-checked`
- `eslint-plugin-unicorn` — modern-JS correctness
- `eslint-plugin-perfectionist` — sorted imports/objects/types (mechanical)
- `eslint-plugin-security` — injection/footgun detection
- `eslint-plugin-sonarjs` — cognitive complexity, duplicate strings, bug
  patterns

Manual tightenings worth carrying anywhere:

| Rule                       | Setting                  | Why                                       |
| -------------------------- | ------------------------ | ----------------------------------------- |
| `eqeqeq`                   | `always`                 | No `==` coercion surprises.               |
| `max-lines`                | `500`                    | Forces decomposition at a real boundary.  |
| `no-console`               | warn (`warn`/`error` ok) | Stray `console.log` is a smell.           |
| `no-implicit-coercion`     | error                    | `!!x`, `+x`, `'' + x` say what they mean. |
| `no-nested-ternary`        | error                    | Unreadable; extract or use `if`.          |
| `no-param-reassign`        | error (props ok)         | Mutating params hides data flow.          |
| `prefer-template`          | error                    | No `'a' + b + 'c'` string concatenation.  |
| `no-unnecessary-condition` | error                    | A dead branch means a type/logic mistake. |

Override discipline:

- **Every disabled rule carries a comment** stating _why_. If you can't justify
  it in a sentence, fix the code instead.
- **Relax per-context, not globally.** Tests, config files, and platform glue
  (service workers, build scripts) get their own relaxed blocks (mocks, magic
  strings, empty handlers) — the strict rules stay full-strength on product
  code.

## Code organization

### Project layout — keep the root clean

The project root is reserved for files the toolchain **forces** to live there.
Everything else sorts into a top-level home, so the root stays scannable:

| Goes in    | What                                                                      |
| ---------- | ------------------------------------------------------------------------- |
| `src/`     | All application code.                                                     |
| `infra/`   | All infrastructure definitions — IaC, Docker/Compose, deploy + DB config. |
| `docs/`    | All documentation — spec, plan, this file, ADRs, feature docs, runbooks.  |
| `.config/` | Every tool config file that _can_ be relocated there.                     |
| _(root)_   | Only what must be there (below) + `README.md` + `AGENTS.md`.              |

Rules:

- **A config file goes in `.config/` unless the tool can't find it there.**
  Before dropping a new config at the root, check whether the tool supports a
  `--config .config/<file>` flag or discovers `.config/`; only fall back to the
  root when it genuinely can't.
- **Allowed at root** are configs with no working alternative — `package.json`,
  `tsconfig.json`, the ESLint flat config, and similar resolver-pinned files —
  plus `README.md` and `AGENTS.md`. If a config sits at the root, its reason for
  being there should be obvious or noted. Known forced-root configs in this
  repo: `package.json`, `tsconfig.json`, `eslint.config.mjs`, and
  `next.config.ts`.
- **Sometimes the relocation is a filename, not a flag.** PostCSS lives in
  `.config/` as **`postcssrc.mjs`** — Next's Turbopack resolves it through
  `postcss-load-config`, which searches `.config/postcssrc.*` but _not_
  `.config/postcss.config.*` (verified: the latter silently breaks Tailwind, the
  former works). When a tool "can't find" a config in `.config/`, check whether
  it wants a different name there before concluding it's root-only. Prettier,
  Vitest, and Playwright relocate via `--config`; PostCSS relocates by name.
- **`docs/` is the home for all documentation**, including the ADRs
  (`docs/decisions/NNNN-*.md`), feature docs (`docs/features/*.md`), and
  runbooks (`docs/operations/*.md`) described under [Documentation](#documentation).

### Inside `src/`

```
src/
├── app/         # routes + API handlers (thin; delegate to lib)
├── components/  # UI, one folder per feature; co-located tests
│   └── Feature/
│       ├── Feature.tsx
│       └── Feature.test.tsx
├── lib/         # pure logic, hooks, data access — no JSX
└── test-utils/  # shared test setup & helpers
```

- **`lib/` holds the logic; `components/` holds the UI.** Keep computation,
  storage, and side-effects out of components and in testable functions/hooks.
  Route handlers and components stay thin and delegate.
- **Feature folders, not type folders.** Group a component with its tests and
  helpers, not all components in one bucket and all tests in another.
- **Tests live next to the code they test** (see Testing). The only exception
  is E2E, which tests deployed behavior and lives in `tests/e2e/`.

## Design principles (DRY / SOLID)

These are enforced by the gates above more than they're preached:

- **Single responsibility, enforced by `max-lines: 500`.** When a file crosses
  the line, that's the signal to split a concern out — usually logic down into
  `lib/` or a sub-component out.
- **Separate the work from the wiring.** Stateful logic lives in a hook or a
  `lib/` function; the component calls it. This keeps each side unit-testable
  _and_ makes the seam between them an explicit, testable contract (this is the
  most load-bearing pattern in the codebase — see Testing).
- **DRY through shared primitives, not copy-paste.** One source of truth for a
  value: design tokens for styling, `lib/` functions for logic, typed
  constants for magic values. `sonarjs/no-duplicate-string` nudges this.
- **Don't reach across abstraction boundaries.** Components depend on hook/lib
  _interfaces_, not internals. External services (APIs, storage, push) sit
  behind a thin module so they can be mocked at one seam.
- **Avoid premature abstraction.** DRY is about a single source of truth for a
  _decision_, not deduping incidentally-similar code. Two things that look
  alike today but change for different reasons should stay separate.

## Testing

Three layers, in increasing cost and confidence:

| Layer       | Tool                         | Lives in                       | Proves                                  |
| ----------- | ---------------------------- | ------------------------------ | --------------------------------------- |
| Unit        | Vitest + happy-dom           | `src/lib/*.test.ts`            | A pure function does what it says.      |
| Integration | Vitest + Testing Library     | `src/components/**/*.test.tsx` | A component wired to its hooks behaves. |
| E2E         | Playwright (Chromium+WebKit) | `tests/e2e/*.spec.ts`          | The real app in a real browser works.   |

Principles:

- **Test the wiring, not just the units.** When a feature is "a hook does the
  work + a component calls the hook," unit tests on _both sides_ can pass while
  the wiring between them silently breaks. The integration test on the seam is
  the one that catches the real bug. Rule of thumb: if a feature description
  contains "and then X tells Y to do Z," there must be a test asserting the
  X-tells-Y call — not just X's logic and Y's logic in isolation.
- **Don't just test the happy path.** Every feature gets: the happy path, the
  two or three likeliest edge cases (empty/malformed input, invalid state,
  races), and the "what does the user see when it fails?" path.
- **Tests live next to the code.** Co-located, not in a global `__tests__/`.
- **Coverage thresholds are enforced and tiered**, set just below the current
  measured numbers so a real regression breaks the build but routine edits
  don't flap. Higher-risk layers carry higher bars:

    | Path                | lines | branches | functions | statements |
    | ------------------- | ----- | -------- | --------- | ---------- |
    | repo-wide floor     | 85    | 78       | 84        | 88         |
    | `src/app/api/**`    | 95    | 90       | 95        | 95         |
    | `src/components/**` | 88    | 76       | 86        | 84         |
    | `src/lib/**`        | 94    | 86       | 91        | 92         |

    Bump the bars up when a wave of new tests lands; never down to make red go
    green.

- **Mock at the boundary.** Real `localStorage` (cleared in `beforeEach`);
  external APIs mocked at the `fetch` level; navigation mocked with a reactive
  store so state-driven re-renders behave like production.
- **E2E runs the matrix that matters** — here a desktop Chromium project and a
  mobile WebKit (iPhone) project, since the primary surface is a phone.

## Styling & design tokens

The aesthetic is **considered minimalism**, but the enforceable rule underneath
it is about tokens:

- **Never write a raw color (hex/`zinc`/`slate`) in markup.** Use a semantic
  token (`bg-card`, `text-muted`, `border-line`, `text-primary`). If a color
  isn't covered, add the token to the single source of truth (`globals.css` +
  the style guide table) _first_, then use it.
- **Color encodes meaning, not decoration.** A single accent reserved for the
  primary action / active / focal state; every other color is a low-opacity
  semantic tint (status, category, priority). If everything is accented,
  nothing is.
- **Vary radius, shadow, and weight to create hierarchy** instead of making
  everything uniform — the scale itself is a token set, not ad-hoc values.
- **A `STYLE_GUIDE.md` is the contract.** New components reach for existing
  tokens; new tokens get documented before use. This is what keeps a design
  system from drifting into one-off values.

## Accessibility

Treated as a correctness property, not a nice-to-have:

- **Interactive elements are real `<button>`s** with discernible labels (text
  or `aria-label`) — not click-handlered `<div>`s.
- **Visible focus on every focusable element.** Never remove an outline without
  replacing it.
- **Contrast meets WCAG AA** against the paired surface, in every theme.
- **Never signal by color alone.** Duplicate the meaning in text or an
  `aria-label` (priority, overdue, status).
- **Respect `prefers-reduced-motion`** — collapse animation to near-zero.

## Documentation

**Anything beyond a minor bug fix lands with its docs in the same change.**
"Minor bug fix" = typo, CSS tweak, regex tightening. Anything touching
behavior, data shape, infra, dependencies, or test strategy is not minor.

The change ships with one of:

- An **ADR** (`docs/decisions/NNNN-*.md`) when the change involves a material
  engineering judgement — architecture, a dependency, a format, a security
  posture, a performance budget. ADRs use a MADR-lite template (context →
  decision → consequences), are **append-only**, and a reversal supersedes the
  old one with a link rather than editing it.
- A **feature doc** (`docs/features/*.md`) when user-facing behavior changes —
  what it does, its data model, how it's tested.
- A **runbook** (`docs/operations/*.md`) when the change adds a production
  failure mode someone will have to recover from.

The point isn't ceremony — it's that the _why_ behind a non-obvious decision is
the thing your future self and reviewers can't reconstruct from the diff.

## Git & commits

- **Conventional Commits.** `type(scope): subject` — `feat`, `fix`, `docs`,
  `chore`, `refactor`, `test`, etc. Scope is often the area or issue
  (`feat(push):`, `docs(#22):`).
- **Commit in small, working increments.** Each commit should pass the gate, so
  the history bisects cleanly.
- **Never force-push a shared branch; never rewrite landed history.** Add
  commits forward.
- **Pre-1.0: merge feature branches directly, no PRs.** Build on a branch, get
  its CI green (the pre-merge gate), then fast-forward into `main` and push.
  PRs — and "a human makes the merge call beyond green CI" — resume at 1.0.
