# Feature: Load-state texts and cards (US-46, US-47, US-48, US-49; US-83 checks)
# Sprint 5. Classification: Local (texts and layout; no change to `SheetsStore`).

## Problem
The editor's load states talk about "sheets" and their cards have no titles, the empty master sheet offers no way to try again, and the full-screen loading overlay hides the top bar.

## Non-Goals
- No change to how or when the sheets load (`SheetsStore`, `SheetsReader`).

## Behavior Rules
### US-46 — loading text (done)
- The loading label reads "Loading products…" (was "Loading both sheets…"), in `stock-editor.html`. The shared `<stoqr-loading-overlay>` is unchanged: it already announces politely (`role="status"`, `aria-live="polite"`) and its spinner slows under `prefers-reduced-motion` (US-26).

### US-47 — card titles (to do)
### US-48 — empty master sheet text and Reload (to do)
### US-49 — top bar visible in all four load states (to do)

## Measured after
- US-46: the production bundle contains "Loading products…" and no longer "Loading both sheets…". Recorded at sign-in in the dev pane: the overlay showed "Loading products…" with `role="status"` and `aria-live="polite"`. It first flashed the old text because the pane had not been reloaded since the edit (the dev server swaps the template in place); a fresh page load uses the new text only.

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
- Tests not run (owner decision 2026-10-29).
