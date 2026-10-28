# Feature: SheetsWriter — the only path that changes a sheet (US-10)
# Sprint 2. Classification: Core (write path; every rule here protects the real sheets).

## Problem
Every future change (stock adjustments in Sprint 3, details edits in Sprint 4) must reach the spreadsheets through one guarded path: only after approval, only allowlisted columns, only exact cells, never formulas, re-checked against fresh data, and reported as successful only after Google confirms. Building it before any caller lets every protection be proved first.

## Non-Goals
- No UI and no caller yet (Sprint 3 adds the adjuster → review → approve flow).
- No dual (linked) write or partial-failure reporting across two sheets (US-33, US-34); this writes one row in one sheet.
- No automatic 429 backoff (US-11).
- No SKU-uniqueness or other business validation (Sprint 4); the writer enforces structure, not business rules.

## Behavior Rules
- Approval: the writer accepts only an `ApprovedChange`, created only by `approve()` in `core/sheets/approval.ts` with a module-private key; a forged or hand-built object is rejected at runtime. `approve(` may be called only from `core/stock-adjust/`, `core/details/` and the approval file (architecture rule; spec files exempt).
- A change = the target `RowRef`, the values the user reviewed, and the new values. Writable fields are every `Product` field except `id`, `createdAt`, `stockStatus` and `lastUpdated` (typed out, and re-checked at runtime).
- The app fills in the rest: Last Updated on EVERY write (a date serial number, days since 1899-12-30 from local wall-clock time); Stock Status whenever stock qty or low stock threshold changes, via `deriveStockStatus(final qty, final threshold)` in `core/stock-adjust/stock-status.ts` (the fresh threshold when it is not being changed).
- `deriveStockStatus`: qty 0 → Out of Stock; 0 < qty < threshold → Low Stock; qty ≥ threshold → In Stock; no threshold and qty > 0 → In Stock; a qty that is not a whole number ≥ 0 is refused.
- Before writing, the writer re-reads the whole tab (through `SheetsReader`, so renewal works), re-resolves headers by label (columns may have moved), finds the row by its sheet-local `id` (exactly once; never a remembered row number), and checks every reviewed value still equals the fresh value. Any difference aborts with the fresh product; nothing is sent.
- Exact cells only: one single-cell A1 range per field (e.g. `'Sheet1'!K12`), all in ONE `values:batchUpdate` request per spreadsheet. Never ranges, rows or clears. A blank number is written as an empty cell.
- `valueInputOption` is `RAW` (confirmed for now; revisit later — DECISIONS): text is stored as text, so no formula can be written. `USER_ENTERED` may not appear in source (architecture rule).
- Success only after confirmation: the request asks for the written values back (`includeValuesInResponse`, unformatted, dates as serial numbers); success only when every planned cell returns the value sent. The result carries the confirmed product.
- Errors: 401 → wait for renewal and redo the whole write once (re-read and check included; absolute values make it safe); 403 → no access, naming the sheet; 404 → spreadsheet not found; other failures → unavailable. A write is never reported as successful on any error.
- Results: `written` (confirmed product), `conflict` (fresh product and the fields that changed), `failed` (an error naming the sheet).

## Edge Cases
- Columns reordered since load: the fresh header positions are used.
- Required column missing at write time: failed (`columns`); nothing sent.
- Row gone, or its `id` now appears twice: failed; nothing sent.
- Reviewed qty changed by someone else: conflict with the fresh value; nothing sent.
- Threshold changed alone: threshold + derived Stock Status + Last Updated.
- A field change that touches neither qty nor threshold: no Stock Status cell.
- Text starting with `=`: written RAW, stored as text.
- Google returns a different value than sent: failed (`unconfirmed`), never success.
- Change targets a row of the other sheet: rejected.
- Empty change, or a qty that is not a whole number ≥ 0: rejected by `approve()`.

## Implementation Phases
- Phase 1: `deriveStockStatus`, `toSheetSerial`/`formatSheetTimestamp`, `columnLetter`/`cellRange` — verified by: unit tests.
- Phase 2: `approval.ts`, `write-plan.ts` — verified by: rule and case tests.
- Phase 3: `sheets-writer.ts` — verified by: `HttpTestingController` tests asserting the exact request body.
- First real write against the TEST sheet happens in Sprint 3's first slice.

## Test Plan
Rule-level:
- No write without a genuine `ApprovedChange`; forged objects rejected.
- No request contains `id`, `Created At`, `USER_ENTERED`, or a range larger than one cell.
- Every stock qty write carries `deriveStockStatus` for that same qty.
- Last Updated is written on every write.
- Success only after every cell is confirmed.
- Only `sheets-writer.ts` sends a mutating request (existing rule).
Case tests: the edge cases above.

## Acceptance Checks
- [x] All behavior rules hold (rule tests, and each new architecture rule caught a planted violation, 2026-10-28)
- [x] Edge cases have tests
- [x] No new libraries
- [x] docs/DECISIONS.md (RAW for now, revisit; serial timestamp; re-read; approval), docs/AI_CONTRACT.md and docs/projectmap.md updated
- [ ] Sprint 3: first real write on the TEST sheet changes only the expected cells; Last Updated shows as a date-time (OWNER CHECK, later)

## Built differently from plan (2026-10-28)
- Numbers are confirmed within a tiny tolerance (1e-9), so a date serial rounded in transit is not reported as a failed write; text must match exactly.
- If the user signs out instead of renewing while a write waits for a token, the write fails as `expired` ("You signed out before the change was saved"), not `unavailable`.
- The "only sheets-writer.ts may send a mutating request" rule now skips spec files, which assert on request methods; the new `approve()` rule exempts spec files too.
