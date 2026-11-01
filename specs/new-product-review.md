# Feature: New product review and result strips (US-100, C5-d review)
# Sprint 12. Classification: UI + a small CORE store (the only caller of `approveCreate`). Spec for approval.

## Problem
The New product form (US-99) can't be saved: "Review product" is off, and nothing calls `SheetsWriter.create` (US-97), adds the row to the loaded data, logs the opening stock or shows a result.

## Non-Goals
- Changing the write path (US-97) or the form (US-99).

## Behavior Rules
### `NewProductReviewStore` (`core/details/new-product-review-store.ts`)
- The ONLY caller of `approveCreate()` (AI_CONTRACT: called only from `core/details/`). Steps: editing → reviewing → saving → editing | conflict | failed | partial (the `ReviewFlow` step names).
- Why not `ReviewFlow` itself: it is built around `ApprovedChange` / `WriteResult` and row updates; a create has its own approval, result and "add the row" step. Reuse instead: the shared `ResultStrip` shape and ONE copy of the "Nothing was changed." certainty rule and the half-saved suffix, extracted from `ReviewFlow` into pure helpers both use. AI_CONTRACT's "every approved save uses `ReviewFlow`" gains "— a new product uses its own steps with the same strip texts".
- `open()`: only when `DetailsStore.newValues` is ready. `back()`: not while saving; entries kept.
- `save()` (Save product tap): seals ONE `ApprovedCreate` and keeps it, so Try again sends the SAME approval (the writer then never adds it twice, US-97). Not while saving or half saved: one tap saves once.
- After each confirmed sheet: `SheetsStore.addRow` (the row shows in search, filters, pairing and Data health at once).
- Log: once the Master row is confirmed (written or half saved), ONE `StockLogStore.record({ mode: 'New product', before: null, after: opening stock })`, once per approval (never on Retry Dr Trust or a repeated confirmation).

### Review (the details review component, new mode — reuse)
- Replaces the form while open; heading "Review product" (focus on it); "Saves to: Master and Dr Trust" (or "Master"); every filled field as `Label value` in form order (blank optional fields left out); the derived Stock Status badge.
- Footer: "Save product" (primary; "Saving…" busy, Back off while saving; status "Saving to <targets>…") and "Back". No Undo.

### Results (shared `<stoqr-strip>`)
- Saved: the form closes and the NEW product opens in the card (`ProductNavigation.openCreated`), with a green "Product added. Master and Dr Trust." (or "Master.") under the card header for about 5 s (the Details saved slot). A pending log line's amber Retry log strip takes that slot instead (US-96 rule).
- Conflict (red): "That SKU was added by someone else since you started. Nothing was saved." with Back.
- Couldn't save (red): the reason, plus "Nothing was changed." only when certain (shared rule), with Try again and Back.
- Half saved (amber): "Master was added. Dr Trust was not: <reason> The sheets differ until you retry." with "Retry Dr Trust" and "Close". Retry appends only Dr Trust (the writer's `remaining`); success → saved (both sheets). Close → the form closes and the new product opens without the green strip; it stays Master only (Data health lists it as missing from Dr Trust).
- Save product is reached through `ProductNavigation.saveNewProduct()` (it opens the product after a save; the store can't inject navigation).

## Edge Cases
- Someone adds the same SKU while the review is open: conflict, nothing written; Back to the form, whose live SKU check shows the clash after the next load.
- Unconfirmed Master append: failed without "Nothing was changed."; Try again re-reads and, finding the row (same SKU and name), reports it saved.
- Sign-out during a save: the form and its state go with the session (US-98).

## Files
`core/details/new-product-review-store.ts` (new), `core/sheets/review-flow.ts` (helpers extracted), `core/navigation/product-navigation.ts` (`saveNewProduct`, Retry / Close paths), `features/stock-editor/details-review/*` (new mode), `features/stock-editor/details-form/*` (Review product wired), `features/stock-editor/product-summary/*` (Product added strip).

## Rule tests to add when tests resume
`approveCreate` only from `core/details/`; one tap saves once; Try again reuses the approval; the New product log line once per approval; addRow after each confirmed sheet; the result texts.

## Acceptance
- [ ] Spec approved before code.
- [ ] Typechecks and build pass; first-load size reported (tests not run).
- [ ] Owner checks (TEST): add a Dr Trust product (both sheets + log line) and another brand (Master only); SKU taken → conflict; half saved → Retry Dr Trust once; the new product opens and shows in search without Refresh.
