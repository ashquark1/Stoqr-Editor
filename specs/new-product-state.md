# Feature: New product form state (US-98, C5-d state)
# Sprint 12. Classification: CORE-small (stores, navigation). Approved 2026-11-01; built 2026-11-01 (tests not run).

## Problem
The New product shell (US-93) opens and closes but holds nothing. The form (US-99) and its review (US-100) need state that search, Refresh, the "Discard changes?" question and the product card treat like an open product with unsaved edits.

## Non-Goals
- The fields' layout (US-99), the review, Save product and result strips (US-100). Saving itself is US-97 (built).

## Behavior Rules
### A "new" mode in `DetailsStore` (not a second store)
- `DetailsStore.mode`: `'product'` (today: edits over the open product) or `'new'`. In `new`, the base texts are the NEW TEMPLATE — every field blank except Status = `Active` — so `texts`, `setTexts`, `errors` (`validateDetail`, the same rules and texts) and the live SKU check are reused, not copied.
- SKU in `new`: `checkNewSku` against every row of BOTH sheets with no own row; a match is always an error (no "link to an orphan" for a new product).
- Opening stock: the Stock qty field, required, whole number 0–1,000,000 (the existing rule).
- Fields not in `new`: Stock Status (shown derived), Created At, Last Updated (written on save).
- `newDirty` = any text differs from the template (Status left at Active is not dirty).
- `newValues` = the typed values parsed for `approveCreate()` (US-97), or null while anything is invalid; `newTargets` = "Master and Dr Trust" or "Master" (the configured Dr Trust brand rule, `isConfiguredBrand`).
- Entering `new` clears any product edits; leaving it clears the entries. Reset on `sessionId` (sign-out / other account), like all work.

### One source for "open", kept in step by `ProductNavigation`
- `PanelStore.newProductOpen` stays the shell's view state (the bottom bar reads it without the editor stores). `ProductNavigation` opens / closes BOTH it and `DetailsStore` `new` mode, so they never differ.

### Leaving (the existing "Discard changes?" path; no second prompt)
- `ProductNavigation.unsaved` also counts `newDirty` while the form is open.
- Open (Add product): asks when the open product has unsaved work, then closes it and the floating panels (built in US-93; now also enters `new` mode).
- X, Cancel, Add product again: ask when `newDirty`, then close and clear; focus returns to Add product (US-93).
- A search while the form is open shows the results as the OVERLAY over the form (as over an open product, US-59): `ProductSearchStore` treats `PanelStore.newProductOpen` like an open product for the overlay. Cancelling the overlay returns to the form with entries kept.
- Selecting a result or a Data health pick: asks when `newDirty`, then closes the form and opens that product.
- Refresh: asks when `newDirty`, then refreshes and clears the entries (the form stays open, back to the template).

### After a save (state for US-100)
- `ProductNavigation.openCreated(ref)`: closes the form (no question: the entries are saved) and opens the new product in the card. The "Product added. <sheets>." 5 s state lives in US-100's review store (the details pattern).

## As built (2026-11-01)
- `DetailsStore`: `mode` / `isNew`, `startNew()`, `newDirty`, `hasChanges` (covers new), `newValues`, `newTargets`; leaves `new` in an effect when `PanelStore.newProductOpen` turns false. `checkSkuForNew` in `core/sheets/sku-check.ts`. `ProductNavigation`: `toggleNewProduct` enters `new`; `closeNewProduct` asks; `refresh` clears entries; `clearBox` cancels an overlay first; `openCreated(ref)`. `ProductSearchStore.overlayOpen` derived (product or New product form open); `listShown` hides the home list under the form. The page dims and inerts the form under the overlay.

## Edge Cases
- Sheets reload for another account while the form is open: `sessionId` reset closes it.
- Refresh failing: the question was answered, the entries are cleared, the old data stays (US-58).
- Read-only access: nothing in this story checks access; the save reports it (US-97/100).

## Files
`core/details/details-store.ts` (mode, template, `newDirty`, `newValues`, `newTargets`), `core/navigation/product-navigation.ts` (open / close / leave / `openCreated`), `core/search/product-search-store.ts` (overlay over the form), `core/layout/panel-store.ts` (unchanged API).

## Rule tests to add when tests resume
Open / close; dirty rules (Status default not dirty); each leave path with and without entries; the overlay over the form; Refresh question then cleared; the product opens after saving; reset on cancel and on session change.

## Acceptance
- [ ] Spec approved before code.
- [ ] Typechecks and build pass; first-load size reported (tests not run).
