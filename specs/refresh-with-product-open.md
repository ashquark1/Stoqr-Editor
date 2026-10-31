# Feature: Refresh with a product open (US-60)
# Sprint 7. CORE. Depends on US-58; uses the US-66 form state.

## Behavior Rules
- `ProductNavigation.refresh()`: asks "Discard changes?" first when there is unsaved work (details edits, a typed amount or chosen sign); "Keep editing" does nothing. Disabled while a refresh or a save runs (`refreshAvailable`); the toolbar button and the failure toast's Retry both use it.
- `SheetsStore.refresh(keep, repoint)` finds the SAME row in the fresh data by its internal `id` (inside `core/sheets/` only) and re-points the selection in the same step as the data changes, so the product never blinks out. `ProductSearchStore.repoint` keeps `selectionKey`, so the details form stays open.
- After success: fresh values, badges, Dr Trust note and editability; the adjuster, the details edits and any open review start again (the new row ref resets them; `dropWork` too).
- Gone (no row with that `id`, or no longer unique): the product closes and the toast "This product is no longer in the sheet." shows; the result list returns.
- A failed refresh changes nothing: the product, the open form and the edits stay; "Couldn't refresh the products" shows.
- The Undo window (Sprint 8) does not exist yet; it must be cleared here when it lands.

## Checked (browser, signed in)
- Pick from Data health, open the details form, type a note, Refresh → question; Keep → note kept. Refresh + Discard → same product, new row ref, form still open, note back to the sheet value.
- Reader made to fail → product, open form and the typed note kept; toast shown.
- Reader made to drop the open row → product closed, "Product closed / This product is no longer in the sheet.", list of 107 shown; a second refresh restored 122.
- Disabled while saving: by code reading (`saving` in `refreshAvailable`); not exercised.
- Rule tests: not written/run (owner decision 2026-10-29). Typechecks and build pass.
