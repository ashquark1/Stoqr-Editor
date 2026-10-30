# Feature: V1-style search row (US-50, S3-a)
# Sprint 5. Classification: Local (layout and wiring to the existing search; no store change). Depends on US-39, US-42.

## Problem
The editor's search had a "FIND A PRODUCT" label, a magnifier inside a 24px-tall box with its own placeholder, a hint line, no Search button and only the browser's unlabelled clear (×); on desktop it was half the page wide. V1 has one row: a full box, V1's placeholder and a Search button.

## Non-Goals
- When a search runs (3 characters, 300 ms, Enter/Search for shorter text) is US-56; typing still searches at once.
- The clear rules with a product open (overlay, remembered text) are US-59; for now × behaves the same with or without a product open.
- The Data health button stays above the row until US-51 moves it to the bottom bar.

## Behavior Rules
- New `app-search-row` (`features/stock-editor/search-row/`), full content width above the results and the product summary (owner choice), `role="search"`.
- The box: `.stoqr-search.stoqr-search--inline` (44px), V1's placeholder "Search by product name, SKU, brand or category...", `aria-label="Search products"`, 16px text on phones (no iOS zoom). No magnifier inside (as V1).
- Clear (×): our own 28px round button inside the box at the right, `aria-label="Clear search"`, shown whenever the box has text (follows the store's query). It empties the box and the results through the store and puts focus back in the box. The browser's own search clear is hidden.
- Search: primary `stoqr-btn icon-btn`, 44px, V1's magnifier; icon-only under 768px, "Search" from 768px (`aria-label="Search"`). Search and Enter send the box's text to the store at once.
- The Reactive Forms box and its two sync effects moved unchanged from the picker; `ProductSearchStore` is unchanged.
- `app-product-picker` now shows results only (size-only message, "No products match", 20-item note, result list). The label and the "Search by product name…" hint line are removed (the placeholder says the same).

## Measured before (signed in)
- 320: label "Find a product", box 24–296, 24px tall, hint line below.
- 1440: box 64–708 (left column only), 24px tall.

## Measured after (browser pane, signed in)
| Width | Row | Box | × (when text) | Search | Label on button |
|---|---|---|---|---|---|
| 320 | 24–296, 44px | 24–240 | 203–231, 28px | 252–296, 44×44 | no |
| 360 | 24–336 | 24–280 | 243–271 | 292–336 | no |
| 768 | 40–728 | 40–607 | 571–599 | 619–728 | yes |
| 1024 | 64–945 (rest of row: content edge 960 incl. gap) | 64–824 | 787–815 | 836–945 | yes |
| 1440 | 64–1376 | 64–1255 | 1219–1247 | 1267–1376 | yes |
| 1920 | 304–1616 | 304–1495 | 1459–1487 | 1507–1616 | yes |
No sideways scroll at any width; at 320 the box, × and Search fit on one line. With a product open at 1440 the summary sits under the row in the right column (732–1376).

Keyboard-only (320): Tab order Sign out → Data health → search box → (× when text) → Search → results. Typed "dr trust" → 20 results ("Showing 20 of 108"); Tab to ×, Enter → box and results cleared, × hidden, focus back in the box. Typed "knee", Enter → 10 results; Tab to Search, Enter → same; Tab to the first result, Enter → "Orthopaedic Knee Support 3202" opens, box keeps "knee". × and buttons show the focus ring; the box shows its Pine focus border.

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run.
- Stale: `product-picker.spec.ts` looks for the label and the input inside the picker; they now live in `app-search-row`.
- Typechecks (`tsconfig.app.json`, `tsconfig.spec.json`) and the production build pass; initial bundle 461.1 kB.

## Acceptance Checks
- [x] Row in the page body under the top bar (Data health above it until US-51); nothing in the top bar
- [x] Label and hint removed; V1 placeholder; primary Search beside the box, 44px, icon-only under 768px, word from 768px (shared `.icon-btn`)
- [x] Clear (×) 28px inside the box, `aria-label="Clear search"`, shown with text; empties the box and the results
- [x] Button and × wired to the existing search code (run rules in US-56)
- [x] G1 at six widths; one line at 320
- [x] Keyboard-only search; 16px input on phones
- [ ] Owner: search, clear and open a product on a phone
- Tests not run (owner decision 2026-10-29).
