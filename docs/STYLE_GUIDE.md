# Style Guide

The visual contract for the app. The enforceable rule (CODING*STANDARDS →
Styling): **markup never uses a raw colour** (hex / `zinc` / `slate`) — only the
semantic tokens below. A new colour gets a token in `src/app/globals.css` and a
row here \_before* any component uses it.

## Aesthetic

Considered minimalism. Colour encodes meaning, not decoration: a single accent
is reserved for the primary / active / focal state; surfaces are neutral.
Hierarchy comes from radius, weight, and spacing, not from many colours.

## Colour tokens

Defined as CSS variables in `globals.css` and exposed to Tailwind via
`@theme inline`, so each maps to a utility (`bg-card`, `text-muted`, …). Both a
light and a dark value are defined; the theme follows the OS
(`prefers-color-scheme`).

| Token                  | Utility examples                            | Light     | Dark      | Meaning                              |
| ---------------------- | ------------------------------------------- | --------- | --------- | ------------------------------------ |
| `background`           | `bg-background`                             | `#f7f7f8` | `#0a0a0b` | App canvas                           |
| `surface`              | `bg-surface`                                | `#ffffff` | `#161618` | Columns / raised lanes               |
| `card`                 | `bg-card`                                   | `#ffffff` | `#1c1c1f` | Card faces, inputs                   |
| `foreground`/`primary` | `text-primary`, `text-foreground`           | `#18181b` | `#ededed` | Primary text                         |
| `muted`                | `text-muted`                                | `#71717a` | `#a1a1aa` | Secondary text, counts               |
| `line`                 | `border-line`                               | `#e4e4e7` | `#2a2a2e` | Hairline borders, dividers           |
| `accent`               | `bg-accent`, `ring-accent`, `border-accent` | `#4f46e5` | `#818cf8` | The one accent: primary/active/focus |
| `accent-foreground`    | `text-accent-foreground`                    | `#ffffff` | `#0a0a0b` | Text/icon on an accent fill          |

## Conventions

- **One accent.** If everything is accented, nothing is. Reserve `accent` for
  the focal action and for focus rings; tint everything else from `muted`/`line`.
- **Radius scale** — cards `rounded-lg`, columns `rounded-xl`, controls
  `rounded-md`. Vary radius to signal nesting, don't make it uniform.
- **Focus is always visible** — every interactive element carries
  `focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none`.
  Never remove an outline without replacing it.

## Accessibility (a correctness property)

- Interactive elements are real `<button>`s with discernible labels (text or
  `aria-label`), e.g. `Delete {card title}`.
- Never signal by colour alone — duplicate meaning in text or an `aria-label`.
- Contrast meets WCAG AA against the paired surface, in both themes.
- Motion respects `prefers-reduced-motion` (collapsed to near-zero in
  `globals.css`).
