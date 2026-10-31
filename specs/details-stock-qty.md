# Feature: Stock qty as an ordinary field in the details form (US-63, S5-h)
# Sprint 8. Classification: CORE (details field list, diff, guard). Depends on US-62 (`MAX_QUANTITY`), CR-04 (AI_CONTRACT applied 2026-10-31).

## Problem
Stock qty was read-only in the details form, so correcting a count together with other details needed two separate saves. CR-04 makes it an ordinary field.

## Non-Goals
- No helper line, preview or special treatment in the form (D27). The form's layout is US-77.
- No change to `approve()`, `SheetsWriter` or `write-plan.ts`: they already accept `stockQty` (whole number ≥ 0 checked by `approve()`, written as a number, Stock Status derived from the final qty).

## Behavior Rules
- `details-fields.ts`: `DetailField` = every `WritableField` (Stock qty included). Stock Qty is editable, `kind: 'whole'`, required, in Stock Info in its current place. The locked list keeps Stock Status, Last Updated, Created At.
- Validation reuses `validateDetail`'s whole-number rule (`MAX_QUANTITY`): "Stock Qty is required." / "Stock Qty must be a whole number from 0 to 1,000,000." Decimals, negatives, 1,000,001 blocked; 0 and 1,000,000 allowed.
- Review: one "Stock Qty old → new" line; for a linked product whose Dr Trust qty differs, the existing "Dr Trust has N; it will be set to M." note.
- Stock Status lines: per sheet from the NEW qty when Stock Qty changed (else that sheet's own qty) and the new threshold when it changed (else that sheet's own). Shown only when the status changes.
- Guard (owner, 2026-10-31): Master's row is guarded by Master's current values of every changed field, Stock Qty included — Master qty changed since the form opened → conflict, nothing written. Dr Trust's row is guarded by its own values of the changed fields EXCEPT Stock Qty, which is overwritten by design.
- Write: only through `DetailsReviewStore` → `approve()` → `SheetsWriter`, changed fields only, Stock Status and Last Updated filled by the writer; the qty is sent as a number (RAW).

## Edge Cases
- Linked, Dr Trust qty 22, Master 24, user sets 30 → both sheets 30; review shows the Dr Trust note.
- Someone changes Master qty to 25 while the form is open, user saves 30 → conflict naming Stock Qty in Master; edits kept.
- Someone changes Dr Trust qty while the form is open → no conflict; Dr Trust set to the new value.
- Threshold and qty both changed → status from the new qty and new threshold, per sheet.
- Master-only product linking an orphan Dr Trust row with a qty change → the orphan's qty is overwritten (same rule).

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run. Stale: details specs asserting Stock Qty is read-only.
- Rule checks by reading: required / blank / decimals / negative / 1,000,001 blocked; 0 and 1,000,000 allowed; status for qty only, threshold only, both; Dr Trust guard excludes Stock Qty; Master guard includes it; number typing.

## Owner checks (TEST sheets)
- [ ] Change Stock Qty only on a linked product: review line, both sheets updated, Stock Status recomputed.
- [ ] Dr Trust qty different beforehand: "will be set to" note; Dr Trust overwritten.
- [ ] Change Master qty in the sheet while the form is open, then save: conflict, nothing written.
- [ ] Blank, 2.5, -1, 1000001 blocked with the messages; 0 and 1000000 allowed.
- [ ] Qty + threshold together: status matches both new values.

## Acceptance Checks
- [ ] Rules hold (read-through; tests not run)
- [ ] Typechecks and build pass
- [ ] No new libraries; no off-limits files
- [ ] projectmap updated (Stock Qty no longer read-only) on "Apply all"
