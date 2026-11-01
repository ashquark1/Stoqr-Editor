# Feature: Review, approve and write to both sheets (US-18, US-19, US-33, US-35, US-20)
# Sprint 3, story B. Classification: Core (the first real write; linked-sheet rules).
> **Superseded by CR-04 (2026-10-31):** stock has no review step; one Apply tap writes and the product stays open (`specs/stock-apply.md`, US-64; Undo `specs/stock-undo.md`, US-65). The write path below (one approval, check both sheets first, absolute values, Dr Trust overwritten) still holds; the Dr Trust note moved to the Stock qty tile and the saved strip.


## Problem
The adjuster shows a valid new quantity, but nothing reaches the sheets. Staff need to review exactly what will change, approve it, and have it written safely — re-checked, to both sheets for a linked product (overwriting a differing Dr Trust quantity, visibly), confirmed by Google — then move on to the next product.

## Non-Goals
- No Retry for a half-done (partial) write (story C, US-34); the half-done state is reported and visible via the Out of sync badge.
- No automatic 429 backoff (story D, US-11).
- No details editing (Sprint 4).

## Behavior Rules
- Review (US-18): a Review button on the adjuster, enabled only when the proposal is ready for review. The review panel replaces the adjuster in the summary card and shows the sheets that will change ("Master and Dr Trust" or "Master"), "current → change → new", the new Stock Status, the low-stock warning, and for a linked product whose quantities differ: "Dr Trust currently has X; it will be set to Y." (US-35). Approve and Back.
- One approval covers both rows of a linked product: `approve(masterRow, drTrustRow)` (one row per sheet, master first). Both carry the same ABSOLUTE new quantity (master qty ± amount). The master row's reviewed qty is re-checked; the Dr Trust row's qty is NOT (overwritten by design), but the row must still exist by `id`.
- Check both first (owner choice): `SheetsWriter.write(approved)` re-reads every sheet involved and plans each write; any failed re-read, missing/duplicated row or master conflict stops everything with NOTHING written. Then it writes Master, then Dr Trust, one `values:batchUpdate` each, each confirmed by Google's echo.
- Each sheet's Stock Status is derived with that sheet's own threshold.
- Results: `written` (every sheet confirmed), `conflict` (nothing written; fresh values), `failed` (nothing written), `partial` (some sheets written; the rest named with the reason). A partial is never shown as success.
- A 401 during a sheet's write waits for renewal, then re-reads and re-checks THAT sheet only and retries once (re-reading Master after it was written would look like a conflict).
- After `written`: the confirmed values go into the loaded data (`SheetsStore.applyRow`), a success toast shows "<name> is now <qty> (<sheets>)", the adjuster resets, the selection clears and the search is kept (US-20).
- After `conflict`: the fresh values go into the loaded data; "The stock changed to N since you reviewed. Nothing was saved."; Review again recomputes from the new quantity.
- After `partial`: the written sheets' confirmed values are applied; "Master was updated to N. Dr Trust was not updated: <reason>." The amount is cleared so it can't be applied twice (Master already holds the new qty).
- After `failed`: the message; Try again approves again.
- State lives in `core/stock-adjust/stock-review-store.ts` (editing → reviewing → saving → editing | conflict | partial | failed). Approve works only from reviewing/failed and only for an editable product, so a double click cannot write twice. It resets when the selected product changes.
- `<stoqr-toast>` gains a `success` variant; an empty `actionLabel` hides its action button.

## Edge Cases
- Linked product, Dr Trust qty differs: note shown; both sheets set to the new qty.
- Master-only product: one sheet, no note.
- Master qty changed by someone else before Approve: conflict, nothing written, fresh value shown.
- Dr Trust row deleted before Approve: failed, nothing written (checked first).
- Master write fails: Dr Trust not attempted; failed, nothing written.
- Dr Trust write fails after Master: partial, Master's new value shown, Out of sync badge.
- Session expires during the Dr Trust write: Continue, Dr Trust re-read and retried.
- Product not editable (e.g. duplicated SKU): no adjuster, and Approve refuses.

## Implementation Phases
- Phase 1: approval rows, writer two-sheet mode — verified by: writer rule tests (`HttpTestingController`).
- Phase 2: `applyRow`, `StockReviewStore` — verified by: unit tests.
- Phase 3: Review button, review panel, success toast — verified by: component tests; owner's first real TEST-sheet write.

## Test Plan
Rule-level:
- A linked write issues exactly one write per sheet and reports success only when both succeed.
- A linked write sets the approved absolute quantity in both sheets even when their quantities differed.
- Check both first: a missing Dr Trust row or a master conflict sends no request at all.
- No code path writes without an approval; a product that is not editable (e.g. duplicated SKU) can never be approved.
Case tests: the edge cases above; each review step; the toast variants.

## Acceptance Checks
- [x] All behavior rules hold
- [x] Edge cases have tests
- [x] Owner: linked product, subtract 1, Review, Approve — in BOTH TEST sheets only qty, Stock Status and Last Updated changed; Last Updated shows as a date-time (owner confirmed 2026-10-29)
- [x] Owner: same for a master-only product (owner confirmed 2026-10-29)
- [x] No new libraries
- [x] docs/DECISIONS.md, docs/AI_CONTRACT.md and docs/projectmap.md updated
