# Feature: Details form and validation (US-21, US-22)
# Sprint 4. Classification: Core (shared signal state; validation rules).

## Problem
Staff can adjust stock but cannot see or correct a product's other fields.

## Non-Goals
- No diff, save or write (US-23, US-24, US-36).
- No SKU uniqueness check (US-38).
- No browser warning when the tab is closed with unsaved edits.

## Behavior Rules
- One editor at a time in the summary: Adjust stock | Edit details (Details when the product is not editable). The switch is locked while a stock review is open, saving or partial.
- All 20 fields in V1's groups and order (Product / Stock / Pricing / Additional Info). Stock Qty, Stock Status, Last Updated and Created At are shown, never typed. `id` never appears.
- Required (owner, 2026-10-29): brand, product name, category, sub category, SKU, unit of measure, packing, status, low stock threshold, tax rate. Whitespace-only counts as blank. Text is kept exactly as typed.
- Low stock threshold: whole number 0–1,000,000. Tax rate: number ≥ 0. MRP, selling price, purchase price: blank or a number ≥ 0. Numbers are digits with an optional decimal part; spaces around them are allowed; `-5`, `1,200`, `1e3`, `.5`, `12abc` are rejected.
- Rules are pure (`validateDetail` in `core/details/details-validation.ts`), imported only in `core/details/` (enforced); state lives in `DetailsStore`. The component only forwards input.
- Leaving with unsaved edits (Change product, switching editor) asks "Discard changes?" (Discard / Keep editing).
- A product that cannot be edited (blocked SKU, loader issues) is shown read-only with the `editability()` reasons.
- Review changes is enabled only when something changed and every field is valid; it is wired in US-23.

## Edge Cases
- Required blanks already in the sheet are flagged as soon as the form opens; Review stays blocked until they are filled in. Nothing is filled in automatically.
- Typing a field back to its original value is no change.
- Session expiry keeps the edits; sign-out or a different account clears them (the selection clears).
- The product picker needs no guard: it hides its results while a product is selected, so Change product is the only way to another product.

## Implementation Phases
- Phase 1: `core/details/` field list, validation, store — verified by: unit tests.
- Phase 2: shared `.stoqr-input` / `.stoqr-field__error`; adjuster moved onto them — verified by: build, adjuster tests.
- Phase 3: details form (lazy) and the summary switch — verified by: component tests; owner check on TEST.

## Test Plan
- `details-fields.spec.ts`: every product field once, never `id`; locked set; required set; V1 groups.
- `details-validation.spec.ts`: accepted and rejected inputs per kind.
- `details-store.spec.ts`: legacy blanks flagged; Review needs change + valid; reset on product change; discard prompt.
- `details-form.spec.ts`, `product-summary.spec.ts`: locked fields are never inputs; inline messages; read-only view; one editor at a time; leaving goes through `confirmLeave`.
- `architecture.spec.ts`: details validation imported only in `core/details/`.

## Acceptance Checks
- [x] 534 tests pass; both typechecks clean; initial bundle 455 kB, details form lazy 7 kB
- [x] No new libraries introduced
- [x] docs/DECISIONS.md, docs/AI_CONTRACT.md, docs/projectmap.md updated
- [x] Owner: groups and locked fields match V1; no `id`
- [x] Owner: invalid MRP / blank SKU / decimal threshold show messages and block Review changes
- [x] Owner: existing required blanks are flagged on open
- [x] Owner: Change product and Adjust stock ask "Discard changes?" with edits; Keep editing / Discard behave
- [x] Owner: Cancel restores every field
- [x] Owner: blocked product shows a read-only Details view with the reason
- [x] Owner: the switch is disabled during a stock review
- [x] Owner: checked at phone width
