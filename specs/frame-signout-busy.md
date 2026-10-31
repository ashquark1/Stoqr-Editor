# Feature: Sign out icon-only on phones; busy buttons (US-43, UI-5)
# Sprint 5 stretch. Classification: Local (UI only). Depends on US-39, US-42.

## Problem
On a 320px phone the text "Sign out" button squeezed the first name to "Ashuto…". Buttons that wait on Google showed a changed label but no visible "working" state.

## Non-Goals
- Apply, Save changes and the stock Undo get their busy states in their own stories.
- Retry and Reload (load-error and empty cards): unchanged (owner choice). Pressing either switches the page at once to the "Loading products…" screen, which replaces the card and its button; that screen is their busy state.
- "Stay signed in" sits in the warning toast (toast button style) and is unchanged.

## Behavior Rules
- Sign out (`app.html`): `stoqr-btn stoqr-btn--ghost icon-btn` with a log-out icon (door + arrow, 18px, 2px stroke, `currentColor`), `aria-label="Sign out"`; icon-only 44×44 under 768px, icon + "Sign out" from 768px. Tooltip "Sign out" (shared `[stoqrTooltip]`, below the button) on hover and keyboard focus; the button is inside `@defer (on idle)` with a plain placeholder button so the tooltip's PrimeNG code stays in the lazy chunk the footer already uses (no first-load growth). The tooltip also shows from 768px, where the label is visible (accepted; no screen-size logic in the shell).
- The first name keeps shortening with "…"; Sign out never moves off screen.
- Busy (shared pattern from US-42: `stoqr-btn--busy`, `disabled`, `aria-busy`, spinner + "…ing" label):
  - Sign in with Google — while Google's script loads ("Loading Google sign-in…") and while the popup is open ("Signing in…").
  - Continue (Session expired dialog) — while renewing ("Continuing…").

## Measured (browser pane)
Sign out with a long test name ("Bartholomew-Alexander", set in the page, then restored):
| Width | Sign out | Label | Name | Bar |
|---|---|---|---|---|
| 320 | 252–296, 44×44 | no | 96–240, cut with "…" | 68.8 |
| 360 | 292–336, 44×44 | no | 119–280, whole | 68.8 |
| 768 | 610–728, 118×44 | yes | whole | 68.8 |
| 1024 | 842–960 | yes | whole | 68.8 |
| 1440 | 1258–1376 | yes | whole | 68.8 |
| 1920 | 1498–1616 | yes | whole | 68.8 |
- With the real first name, "Ashutosh" now fits whole at 320 (was "Ashuto…"). Icon 18px. No sideways scroll.
- Keyboard: Shift+Tab from the search box reaches Sign out with the focus ring; the tooltip "Sign out" shows below it; Escape hides it.
- Sign in busy: held "Loading Google sign-in…" in page memory — spinner (button text colour), `aria-busy="true"`, disabled, progress cursor, 44px; back to "Sign in with Google", not busy. Recorded at the real sign-in: "Signing in…" busy with spinner, then not busy.
- Continue busy: Session expired dialog held in the renewing state in page memory — "Continuing…" with spinner, `aria-busy="true"`, disabled, 44px; then restored to signed in (dialog gone).

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run.
- Typechecks and the production build pass; initial bundle 476.7 kB (+0.8 kB).

## Acceptance Checks
- [x] Sign out icon-only 44×44 under 768px with `aria-label="Sign out"`; icon + label from 768px; tooltip on the icon-only button
- [x] First name truncates with "…"; never pushes Sign out off screen at 320 and 360
- [x] Sign in and Continue use the shared busy state while busy and are disabled
- [x] Retry and Reload: owner choice — the loading screen that replaces them is their busy state
- [ ] Owner: on a phone, Sign out shows as an icon and your name fits
- Tests not run (owner decision 2026-10-29).
