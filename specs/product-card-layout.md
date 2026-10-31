# Feature: Product card under the search row and toolbar (US-72, S5-a)
# Sprint 7. Classification: UI (layout; one line in `ProductSearchStore.select()`). Depends on US-69, US-84.

## Problem
An open product showed as a summary beside the results with a "Change product" button and mode buttons. The product should open in place of the list, under the search row and toolbar, at the full content width.

## Non-Goals
- The result list as an overlay over the card is US-73.
- The tiles, header and pencil / eye are US-74 (`specs/product-card-tiles.md`).

## Behavior Rules
- `app-product-summary` is a card directly under the toolbar, full content width, in the one-column layout from US-84. No side-by-side layout, no "Change product" button. Closing a product is the search box's clear (×) or emptying the box (US-59 rules).
- The search row and the toolbar stay while a product is open.
- Opening a product closes the filter panel and the Data health panel (`ProductSearchStore.select()`).
- The card is re-created when another product opens (`@for` keyed on `selectionKey`), giving a 150 ms fade; a refresh keeps the key, so no fade and no focus move. No animation with `prefers-reduced-motion`.
- Focus moves to the card heading (`tabindex="-1"`, `preventScroll`) when a product opens.

## Owner checks (signed in, TEST sheets)
- [ ] 320, 360, 768, 1024, 1440, 1920: card edges line up with the search row and toolbar; no sideways scroll.
- [ ] Open a product with the filter panel open → it closes; with Data health open, pick from the overlay list → Data health closes.
- [ ] Opening a product fades the card in; the toolbar does not jump; focus is on the product name (screen reader reads it).
- [ ] Refresh with a product open: no fade, focus stays where it was.
- [ ] Clear (×) with no overlay closes the product (Discard question when there is unsaved work).
- [ ] Screenshots at 320 and 1440; keyboard-only pass.

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run. Stale: `product-summary.spec.ts` (mode buttons, Change product).
- Typechecks (`tsconfig.app.json`, `tsconfig.spec.json`) and the production build pass.
- Screenshots and keyboard pass: owner checks above (Google sign-in is not possible from the build environment).
