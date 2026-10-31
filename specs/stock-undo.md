# Feature: Undo of the last stock change (US-65, S6-d; implements US-29)
# Sprint 8. Classification: CORE (stock store, write path). Depends on US-64.

## Problem
With no review page (CR-04), a slip such as 500 for 5 is written at once. Undo for about 10 seconds makes it easy to fix.

## Non-Goals
- The strips and their texts on screen (US-76); until then the interim result panel shows Undo, "Undoing…" and "Stock restored to N.".
- No Undo for details saves.

## Behavior Rules
- After a confirmed Apply (not a Retry that finished a half-done save), `StockReviewStore.saved()` keeps the previous quantity and `undoAvailable()` is true for `UNDO_WINDOW_MS` (10 s). A new entry may be typed meanwhile; Undo stays until the timer ends.
- `undo()` writes the previous quantity back as a NEW absolute save to the same sheets (Master, and Dr Trust when linked): `approve()` with Master guarded by the quantity just saved; then the shared `ReviewFlow` → `SheetsWriter` (re-read, Stock Status and Last Updated recomputed by the writer).
- Refused when Master no longer holds the quantity just saved: "Can't undo: the stock is now N, changed by someone else. Nothing was saved." Nothing is written; a typed entry is kept.
- Undo is final: after "restored" there is no Undo. None after a half-saved result, none after Retry completes one, none for details saves.
- The offer ends when another stock change is applied, another product opens, Refresh runs (new row ref), the edit form opens (all go through `close()` / `apply()`), or the timer ends.
- Outcomes: undoing (`undoing()`; controls off), restored (`restored()` = the quantity, for `RESTORED_MS` = 5 s, no Undo), refused (conflict step), couldn't write (failed step; `tryAgain()` repeats the Undo, not an Apply), half written (partial step; Retry / Close as US-64).

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run. Rule checks by reading: 10 s window; each ending event; refused after a changed master qty; restored; failure and half-saved paths; no Undo after Retry or for details.
- Typechecks and the production build pass. Initial bundle 497.0 kB (+0.4 kB).

## Owner checks (TEST sheets)
- [ ] Apply +5, then Undo within 10 s: both sheets back to the old qty; "Stock restored to N."; no second Undo.
- [ ] Wait 10 s: Undo is gone.
- [ ] Apply, change Master qty in the sheet, Undo: refused message, nothing written.
- [ ] Apply, open the pencil / open another product / Refresh: Undo is gone.
- [ ] Undo offline: failure, Try again repeats the Undo when back online.
