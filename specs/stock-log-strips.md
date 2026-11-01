# Feature: "Retry log" strip and the no-access message (US-96, C5-h UI)
# Sprint 11. Classification: UI (state from US-95). Spec for approval.

## Problem
US-95 keeps a failed log line pending and switches stock changes off without log access, but nothing shows either: a failed line is invisible and refused taps do nothing.

## Non-Goals
- The New product strip (US-100 reuses this strip). Any change to when lines are written (US-95).

## Behavior Rules
### "Retry log" strip — one place: under the card header
- Shows while any line is pending (`StockLogStore.hasPending`), on whichever product card is open, form open or not. Amber (shared `<stoqr-strip>`, `role="alert"`).
- Text (owner's): lead "Stock saved, but the change wasn't recorded in the log." With several lines pending: "Stock saved, but N changes weren't recorded in the log." Message: the reason from the last append (e.g. "You don't have edit access to the Stock Log sheet.").
- Buttons: "Retry log" (primary) and, while the Undo window of the last Apply is open, "Undo" (secondary) — one strip, two buttons, so "one strip at a time" holds.
- Retry log busy: the button shows the shared busy look with "Logging…" (spinner, `aria-busy`), both buttons off. Success → the strip goes and focus moves to the card title; failure → it stays amber with the new reason, focus stays on Retry log.
- While it shows, it replaces the green "Stock saved." strip under the adjuster and the green "Details saved." strip under the header (same change; no second message). Problem strips (conflict, couldn't save, half saved) stay where they are and come first in the adjuster.
- Display text lives in the store (`StockReviewStore.logStrip()`), like the other strips.
- Shared strip extended, not forked: `primaryBusy` input (busy look + `primaryBusyLabel`, buttons disabled).

### No log access (stock changes off)
- Message (proposed): no access → "You don't have access to the Stock Log sheet, so stock changes are switched off. Ask the owner to share it with you as Editor."; unusable → "<reason> Stock changes are switched off until it's fixed." From `StockLogStore.offMessage`.
- Adjuster: the message as an amber strip (no buttons) above the two ways; both boxes read-only, + and −, Apply and Undo disabled, the ways dimmed. Text, not colour alone.
- Details form: Stock qty shows as a read-only value with the message under it (no input), so it cannot be typed at all; the other fields stay editable.
- Add product: `aria-disabled` (still focusable, so the reason is reachable), dimmed, tooltip and accessible description = the message; a press does nothing. The shell reads it from `PanelStore.addProductOff` (set by `ProductNavigation` from the log status), so no stock store enters the first load.

## Edge Cases
- Lines pending with no product open: the strip shows when the next product opens (the list has no strip slot). Sign-out drops them (US-95).
- Log access restored: Refresh re-checks; the message goes and the controls come back.
- The longest strip text wraps; two buttons stack on phones (strip's own rule).

## G1 / UXQ
Six widths with the longest strip text and the message; amber `alert` announcement; disabled controls keep AA contrast; keyboard-only Retry log. Screenshots at 320 and 1440.

## Acceptance
- [ ] Spec approved before code.
- [ ] Typechecks and build pass; first-load size reported (tests not run).
- [ ] Owner checks (TEST): unshare the log (Editor → Viewer) → Apply shows the amber strip; re-share → Retry log clears it once; remove access fully + Refresh → message, controls off, Add product off.
