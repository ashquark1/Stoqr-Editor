# Feature: Shared message strip (US-54, S7-a)
# Sprint 5. Classification: Local (shared UI component; no data impact). Depends on US-42. Used by US-76 (stock) and US-80 (details).

## Problem
Results of stock changes and details saves move from the top toast into the card (CR-03 D33, D37). They need one inline strip that looks and behaves the same everywhere, instead of two copies.

## Non-Goals
- Nothing uses it yet: US-76 and US-80 place it. The top toast stays for Refresh and sign-in problems.

## Behavior Rules
- `<stoqr-strip>` in `shared/ui/strip/`. Inputs: `variant` (`success` | `problem` | `warning`), `lead` (optional bold opening, e.g. "Stock saved."), `message` (required), `primaryLabel` / `secondaryLabel` (empty hides the button), `autoDismissMs` (0 = stays). Outputs: `primary`, `secondary`, `dismissed` (timer ended; the feature removes the strip). Generic: it knows nothing about stock or details.
- Each look has an icon (tick in a circle, × in a circle, warning triangle) and text, never colour alone.
- Announcement: success `role="status"` (polite); problem and warning `role="alert"`.
- Colours: the light semantic backgrounds and borders (`--color-success-bg`/`-border`, `--color-error-*`, `--color-warning-*`) with new theme tokens `--color-on-success` (#0A5A50), `--color-on-warning` (#7A4210), `--color-on-error` (#7A2020) for text, icon, buttons and the focus ring. The light backgrounds stay light in dark mode, so these stay dark in both modes (the toast already used the same tones as literals).
- Buttons: the shared 44px `.stoqr-btn`, recoloured from the strip's "on" colour: primary filled (on-colour background, strip-background text), secondary outlined. Focus ring in the on-colour.
- Layout: phones — text above, buttons full width and stacked; from 768px — one row, text left (wraps), buttons right. Long text wraps (`overflow-wrap: anywhere`).
- Motion: 150ms fade and 4px rise on appear; none under `prefers-reduced-motion`. The strip takes its own space (no overlay); it leaves when the feature removes it.

## Measured (temporary samples on the sign-in page, removed before commit)
Samples: success "Stock saved." + Undo; problem with Try again + Back; warning (longest text) with Retry Dr Trust + Close; success without buttons and `autoDismissMs` 3000.
| Width | Strip width | Two-button strip height | Buttons |
|---|---|---|---|
| 320 | 272 | 215 (text above) | 238×44 each, stacked |
| 360 | 312 | 195–215 | 278×44, stacked |
| 768 | 688 | 70 (one row) | side by side, 44px |
| 1024 | 896 | 70 | side by side |
| 1440 | 1312 | 70 | side by side |
| 1920 | 1312 | 70 | side by side |
- No sideways scroll at any width. Roles: status / alert / alert / status.
- Contrast (text and primary button): success 7.14:1, problem 8.94:1, warning 7.28:1 — same in light and dark mode.
- Self-dismiss: the 3-second strip emitted `dismissed`.
- Keyboard: Tab between strip buttons shows a 2px focus ring in the strip's on-colour.

## Test Plan
- Unit tests suspended by the owner (2026-10-29): the story's component tests (each look and its role; self-dismiss with fake timers) become the owner checks below.
- Typechecks and the production build pass; initial bundle 460.8 kB (the strip is not bundled until used).

## Owner checks (in place of component tests)
- [ ] When US-76 / US-80 use it: each look shows its icon and colour; screen reader announces success politely and problems at once; a timed strip leaves by itself.

## Acceptance Checks
- [x] One component in `shared/ui` with three looks, icon + text, up to two 44px buttons, optional self-dismiss, roles by variant
- [x] Contrast AA (≥ 7:1) in both modes
- [x] Phones: text above, full-width buttons; text wraps; nothing overflows
- [x] Short appear motion, reduced-motion safe; no overlay, no layout jump for neighbours
- Tests not run (owner decision 2026-10-29).
