# Feature: Details review step (US-79, S8-c)
# Sprint 9. Classification: UI. Depends on US-77.

## Behavior Rules
- The review replaces the form; the card header stays; the form's "Edit details" heading is hidden so "Review details" is the one heading (the section is labelled by whichever shows). Focus lands on "Review details" when it opens.
- "Saves to: Master and Dr Trust" (or "Master"); the link note when a new SKU links a master-only product to an unmatched Dr Trust row; one "Label old → new" line per changed field (Stock Qty included, with "Dr Trust has N; it will be set to M." when it differs); one Stock Status line per sheet only when the status changes.
- Old and new are told apart without colour: the arrow, the bold new value, and hidden text "changes from … to …" for screen readers (new shared `.stoqr-sr-only`). Long values wrap.
- Buttons (44px): "Save changes" (primary; renamed from "Approve") and "Back" (to the form with the edits kept). Outcome buttons unchanged until US-80.

## Owner checks (signed in, TEST sheets)
- [ ] Edit two fields + Stock Qty on a linked product with a different Dr Trust qty: lines, note, status lines; Save changes; Back keeps edits.
- [ ] Long old and new values wrap at 320; screenshots at 320 and 1440.
- [ ] Screen reader reads "Brand changes from A to B"; keyboard focus on the heading when the review opens.

## Test Plan
- Unit tests suspended (2026-10-29); not written or run. Stale: `details-review.spec.ts` ("Approve"). Typechecks and build pass (first load 496.9 kB).
