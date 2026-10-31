# Feature: "Form open" state in the details store (US-66)
# Sprint 7. CORE-small.

## Behavior Rules
- `DetailsStore.formOpen` (+ `openForm`, `closeForm`) replaces the summary component's own mode signal; `readOnly` = the product can't be edited (eye icon, US-74).
- Closes (and drops edits) on: Cancel/Close, another product opening or the product closing (`selectionKey`), and Close after a half-done details save (`DetailsReviewStore.back` from the partial step). A refresh keeps it open (US-60).
- Opening the form goes through `ProductNavigation.openDetails()`: a typed adjuster amount and sign are dropped silently (A-UI-30). Not while a save runs.
- Cancel's new meaning (A-UI-54): always enabled, always closes the form, asking "Discard changes?" first when there are details edits. A read-only form shows Close.
- "Details saved" is `DetailsReviewStore.saved` (for the US-80 strip).
- The old `DetailsStore.confirmLeave / discardAndLeave / keepEditing` are gone; `ProductNavigation` asks the one question, shown on the page.

## Checked (browser, signed in)
- Form opened, refreshed: stays open (see refresh-with-product-open). Gone product: form closed.
- Rule tests: not written/run (owner decision 2026-10-29); the two stale spec cases were replaced so `tsconfig.spec.json` compiles. Typechecks and build pass.
