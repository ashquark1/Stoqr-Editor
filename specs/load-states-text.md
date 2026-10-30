# Feature: Load-state texts and cards (US-46, US-47, US-48, US-49; US-83 checks)
# Sprint 5. Classification: Local (texts and layout; no change to `SheetsStore`).

## Problem
The editor's load states talk about "sheets" and their cards have no titles, the empty master sheet offers no way to try again, and the full-screen loading overlay hides the top bar.

## Non-Goals
- No change to how or when the sheets load (`SheetsStore`, `SheetsReader`).

## Behavior Rules
### US-46 — loading text (done)
- The loading label reads "Loading products…" (was "Loading both sheets…"), in `stock-editor.html`. The shared `<stoqr-loading-overlay>` is unchanged: it already announces politely (`role="status"`, `aria-live="polite"`) and its spinner slows under `prefers-reduced-motion` (US-26).

### US-47 — card titles (done)
- `<stoqr-empty-state>` gains two optional inputs (extended, not forked): `heading` — an `<h2>` above the message (18px, wraps); named `heading`, not `title`, because a `title` attribute would also show a browser tooltip on the host — and `alert` — `role="alert"` so the card is announced at once. Without them the card is unchanged (the picker's "No products match …" has neither).
- Editor cards: load error → heading "Couldn't load the products", or "No access to the sheets" when `sheets.noAccess()`, with `alert`; empty master → heading "No products yet". Messages and the Retry / Sign out buttons are unchanged word for word (including "Loading was interrupted by the session ending. Please retry."); the no-access card keeps its own Sign out.
- Busy state: Retry starts a reload, which replaces the whole card with the loading screen, so the button needs no busy look here.
### US-48 — empty master sheet text and Reload (to do)
### US-49 — top bar visible in all four load states (to do)

## Measured after
- US-46: the production bundle contains "Loading products…" and no longer "Loading both sheets…". Recorded at sign-in in the dev pane: the overlay showed "Loading products…" with `role="status"` and `aria-live="polite"`. It first flashed the old text because the pane had not been reloaded since the edit (the dev server swaps the template in place); a fresh page load uses the new text only.

- US-47 (signed in; each card shown by setting the editor's loaded-data state in page memory, then restored — nothing sent to Google): order heading → message → buttons; heading is an `h2`; error and no-access cards have `role="alert"`, the empty-master card does not.
  | Card | 320 height | Buttons |
  |---|---|---|
  | Couldn't load the products (connection message) | 218 | Retry 44px |
  | No access to the sheets (longest message) | 253 | Retry, Sign out 44px |
  | No products yet | 131 | none (Reload is US-48) |
  Longest card at 360 / 768 / 1024 / 1440 / 1920: 235 / 200 / 200 / 183 / 183px tall, edges on the content column (24–336, 40–728, 64–960, 64–1376, 304–1616); no sideways scroll at any width. Picker "No products match" unchanged (no heading, no role).

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run. `stock-editor.spec.ts` checks that the overlay is shown, not its text, so US-46 does not make it stale.
- US-83 (page tests for the new texts) becomes owner checks below.
- Typechecks and the production build pass (US-46: initial bundle 459.9 kB).

## Owner checks (US-83)
- [ ] Sign in: the loading screen says "Loading products…".
- [ ] (US-47) Each load-problem card shows its title.
- [ ] (US-48) An empty master sheet shows "No products yet" with Reload.
- [ ] (US-49) The top bar stays visible while loading and on every problem card.

## Acceptance Checks
- [x] US-46: loading label "Loading products…"; no change to `SheetsStore`
- [x] US-47: optional heading on the shared card (extended, not forked); three titles; messages and buttons word for word; no-access keeps Sign out; heading is a heading; problems announced
- Tests not run (owner decision 2026-10-29).
