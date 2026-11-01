# Feature: One result list in the page and as an overlay (US-73, S5-c)
# Sprint 7. Classification: UI (page template and SCSS; overlay state already in `ProductSearchStore`, US-59). Depends on US-59, US-72.

## Problem
A search run with a product open showed the result list above the card, pushing the product down the page. It should float over the card while the product stays untouched underneath.

## Non-Goals
- The overlay rules (when it opens, select, clear, remembered text) are US-59 and unchanged.
- No Escape shortcut (US-59).

## Behavior Rules
- ONE list component, `app-product-picker`, used on the home screen and as the overlay (`stock-editor__picker--overlay` while `overlayOpen()` with a product open).
- The overlay sits at the top of the card's place, full content width (same edges as the home list and the toolbar), on the page background, with a 150 ms fade (none with reduced motion). It is above the card and below the toolbar's filter panel and both sticky bars. The card keeps its place, so nothing jumps; a long list makes the page scroll as on the home screen.
- The card underneath is dimmed (opacity 0.5) and `inert` (no clicks, no Tab) while the overlay shows; its unsaved work is untouched.
- Focus stays in the search box while typing; results are buttons (Tab, Enter); the toolbar's count is announced politely (`aria-live`).

## Owner checks (signed in, TEST sheets)
- [ ] Open a product, type a new search: list fades in over the card at the same edges; the card is dimmed but readable; nothing moves.
- [ ] Tab from the box goes to the results, never into the dimmed card; Enter on a result opens it (Discard question when there is unsaved work).
- [ ] A short list (1 result) leaves the rest of the dimmed card visible below; a long list scrolls with the page.
- [ ] Filter panel open over the overlay: the panel stays on top.
- [ ] Clear (×) with the overlay: list goes, card back to full strength, typed amount still there.
- [ ] 320, 360, 768, 1024, 1440, 1920 with a long product name and SKU: no sideways scroll. Screenshots at 320 and 1440; keyboard-only search and select.

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run.
- Typechecks (`tsconfig.app.json`, `tsconfig.spec.json`) and the production build pass.
