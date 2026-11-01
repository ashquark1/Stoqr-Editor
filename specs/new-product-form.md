# Feature: New product form (US-99, C5-d form)
# Sprint 12. Classification: UI (state from US-98). Approved 2026-11-01; built 2026-11-01 (tests not run).

## Problem
The New product shell (US-93) is empty. Staff need the fields to type a new product, with the same rules and look as the details form.

## Non-Goals
- The review, Save product and result strips (US-100). Until then "Review product" stays disabled.

## Behavior Rules
### One component, a "new" mode (reuse, Q-G3)
- The shell renders the existing `<app-details-form>` (lazy, same chunk) under its "New product" title and X. The form reads `DetailsStore.isNew()`: no inner "Edit details" heading, no read-only reasons panel.
- The same four groups, order, required marks (*), 1 / 2 / 3 columns (3 from 1024px), Notes full width.

### Differences in new mode
- Stock qty is labelled "Opening stock qty" (required, whole number 0–1,000,000; existing rule and texts; no helper text). The label comes from the field list (`newLabel` on the Stock qty definition), not the template.
- Status starts as Active; nothing else is pre-filled (Unit of Measure, Packing and Tax Rate are typed).
- Stock Status: a read-only field showing "Set when saved" until opening stock and threshold are valid, then the derived badge (`DetailsStore.newStockStatus`, from `deriveStockStatus` in core).
- Created At and Last Updated are not shown (`hiddenWhenNew` on their definitions).
- SKU: the US-98 check against every row of both sheets, shown as the person types or leaves the field.
- Errors show for a field once it has been typed in or left (touched / dirty), so a blank new form is not all red; the footer explains why Review is off.

### Footer (shared `<stoqr-form-footer>`)
- Status line: "Fill the required fields (*) to continue." while anything is invalid or missing; when valid, "Saves a new row to Master and Dr Trust." or "Saves a new row to Master." (`DetailsStore.newTargets`).
- Buttons: "Cancel" (`ProductNavigation.closeNewProduct`, asks when typed) and "Review product" (primary, 150px from 768px; disabled until valid — and until US-100 wires it). Phones: stacked, full width (the footer's own rule).

### Focus
- On open: the first field (Product Name). On close: back to the Add product button (US-93). Tab order follows the visual order.

## As built (2026-11-01)
- `details-fields.ts`: `newLabel`, `hiddenWhenNew`. `DetailsStore.newStockStatus`. `DetailsForm`: renders when `isNew()` or a product is open; `shownError()`; New product footer. `NewProduct`: `@defer` the form; the form focuses Product Name. Details chunk 18.8 kB; first load 502.4 kB.

## Edge Cases
- Long values: inputs scroll their text; Notes wraps (existing styles).
- Brand typed as the Dr Trust brand in any case or spacing: the footer says "Master and Dr Trust" (`isConfiguredBrand`).
- Search over the form: dimmed and inert (US-98).

## G1 / UXQ
Six widths with long values and every error showing; labels above fields; required marks and errors not by colour alone (the * and the text); screenshots at 320 and 1440 when a signed-in session is available (owner check on TEST otherwise).

## Files
`core/details/details-fields.ts` (`newLabel`, `hiddenWhenNew`), `core/details/details-store.ts` (`newStockStatus`), `features/stock-editor/details-form/*` (new mode), `features/stock-editor/new-product/*` (renders the form; focus moves to the first field).

## Acceptance
- [ ] Spec approved before code.
- [ ] Typechecks and build pass; first-load size reported (tests not run).
