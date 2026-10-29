# Feature: Last Updated shows as a date (US-19 fix)
# Sprint 4, before US-21. Classification: Core (write path).

## Problem
Last Updated was written as a date number (RAW) into cells with no date format, so the sheet, V1 and V2 after a reload showed `46324.53178` instead of `29/10/2026 13:30:16`.

## Non-Goals
- No bulk fix of existing cells (the owner may format the column by hand).
- No other formatting.

## Behavior Rules
- Every save sets the number format of the exact Last Updated cell it stamps to DATE_TIME `dd/mm/yyyy hh:mm:ss` (field mask `userEnteredFormat.numberFormat` only), one `repeatCell` per sheet via `spreadsheets:batchUpdate`, sent from `SheetsWriter` only.
- Order: check every sheet (values + tab number) → format every sheet → write values.
- A failed format sends no values ("Nothing was saved"). A 403 on any sheet's format writes nothing anywhere, which closes the Viewer-only half-save gap.
- 401/429 on a format follow the same renewal/backoff rules; each sheet gets one renewal and 3 busy resends in total, across its format and value requests.
- A value resend after a re-check formats the (possibly moved) cell again first.
- The tab number is looked up fresh on every save (`SheetsReader.tabId`, a GET), never cached.

## Edge Cases
- Tab missing at save time: nothing sent.
- Dr Trust is Viewer-only: nothing written, the message names Dr Trust.
- Retry after a partial: formats and writes Dr Trust only.
- Cells written before this fix keep showing a number until their row is next saved.

## Implementation Phases
- Phase 1: `SheetsReader.tabId` — verified by: reader tests.
- Phase 2: `planRowWrite` returns the stamped cell's grid position — verified by: plan test (row by id, column by label).
- Phase 3: `SheetsWriter` format step — verified by: writer rule tests (`HttpTestingController`).

## Test Plan
- Rule tests in `sheets-writer.spec.ts`, `sheets-reader.spec.ts` and `write-plan.spec.ts` (14 new): every format before any value; exactly one cell, number format only; a 403 on Dr Trust's format writes nothing; a 5xx on a format sends no values; a 429 re-checks first; Retry formats and writes Dr Trust only.

## Acceptance Checks
- [x] 477 tests pass; both typechecks clean; build 452 kB
- [x] Linked save: both Last Updated cells show dd/mm/yyyy hh:mm:ss; cell styling unchanged
- [x] Reload shows the date in the app, not a number
- [x] Master-only save touches Master only
- [x] (optional) Viewer on Dr Trust: nothing written, message names Dr Trust
- [x] Verified against the TEST sheets only (owner check)
- [x] No new libraries introduced
- [x] docs/DECISIONS.md and docs/AI_CONTRACT.md updated
