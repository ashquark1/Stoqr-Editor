# Feature: Review and save details to both sheets (US-23, US-24, US-36)
# Sprint 4. Classification: Core (second write path; linked-sheet rules).

## Problem
The details form validates edits but cannot save them. Staff need to see exactly what will change, approve it, and have only those fields written safely to both sheets.

## Non-Goals
- No SKU change (US-38): a changed SKU blocks Review with a message.
- No data-health view (US-31).

## Behavior Rules
- Review changes (enabled only when changed, valid and no SKU change) replaces the form with the review: the sheets it saves to, one line per changed field (old → new), a Dr Trust line where that sheet's old value differs, and the Stock Status changes the save brings, per sheet.
- "Changed" compares values: `18.0` for 18 is no change; a blank number is null; text is compared exactly as typed.
- `DetailsStore` keeps only the user's edits; untouched fields follow fresh data (after a conflict or save), so they can never undo someone else's change.
- One approval (`DetailsReviewStore`, the only details caller of `approve()`): only the changed fields, the same new values in both sheets, each row guarded by THAT sheet's own current values of those fields. Untouched fields that differ between the sheets are never written.
- The writer adds Stock Status on EVERY save (derived per sheet from its own qty and threshold) and Last Updated (with its date format).
- A text field whose cell holds a number is written back as a number when the new text is a plain number (`12`, `0.5`); `007`, `1.50`, `12 pcs` stay text.
- Outcomes (shared `ReviewFlow`, as for stock): written → "Details saved" toast, product stays open with the saved values (owner choice); conflict → nothing saved, fresh values shown, edits kept, Review again; partial → the written sheet named, Retry for the rest from the original approval (only while the review is open); failed → Try again.
- The Adjust stock / Edit details switch is locked while either review is open; Change product is disabled while either save runs.

## Edge Cases
- Someone edits the same field in either sheet before Approve: conflict, nothing saved.
- Someone edits a different field: not a conflict; that field is not written.
- Dr Trust brand differs from Master's: the review shows it; both get the new value.
- Threshold change: each sheet's status from its own qty.
- Viewer-only on Dr Trust: caught by the format step, nothing written.

## Implementation Phases
- Phase 1: shared `ReviewFlow` (`core/sheets/review-flow.ts`); `StockReviewStore` moved onto it — verified by: the unchanged stock specs.
- Phase 2: write plan — status on every write, number cells kept — verified by: write-plan and writer rule tests.
- Phase 3: `details-diff.ts`, edits-only `DetailsStore`, `DetailsReviewStore` — verified by: unit tests.
- Phase 4: `details-review/`, shared `review-actions/`, wiring and toast — verified by: component tests; owner check on TEST.

## Test Plan
- Only changed cells (+ status, Last Updated) are sent; never `id` or Created At; untouched differing fields never written.
- Each sheet guarded by its own values; a conflict on a changed field stops the save.
- Status derived per sheet; number cells stay numbers; SKU change cannot be approved.
- Linked: one write per sheet; partial never success; Retry uses `remaining` only; a double click writes once.

## Acceptance Checks
- [x] 566 tests pass; both typechecks clean; initial bundle 455 kB, details chunk 12 kB
- [x] No new libraries introduced
- [x] docs/DECISIONS.md, docs/AI_CONTRACT.md, docs/projectmap.md updated
- [x] Owner: linked product, Brand + Tax Rate — review lists only those; both sheets updated; toast; product stays open
- [x] Owner: threshold change shows and writes each sheet's own Stock Status
- [x] Owner: a numeric packing/SKU cell stays a number after saving another field
- [x] Owner: a hand edit to the same field before Approve gives a conflict, nothing saved
- [x] Owner: a changed SKU disables Review with the message
- [x] Owner: checked at phone width
