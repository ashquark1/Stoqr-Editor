# Feature: Card header, five tiles, pencil or eye icon (US-74, S5-g)
# Sprint 7. Classification: UI (template and scoped SCSS; form open state already in `DetailsStore`, US-66). Depends on US-72, US-66.

## Problem
The summary listed six fields in the generic field grid and had two mode buttons (Adjust stock / Edit details). The facts should read at a glance as tiles, and the form should open from one icon.

## Non-Goals
- The new adjuster layout (US-75) and strips (US-76); the old adjuster / review panel stay under the tiles until Sprint 8.
- The form's own layout, read-only view and review (US-77–79).

## Behavior Rules
- Header, two lines: brand small and muted (`--color-text-muted`) above; product name as the title (`--text-h2`) below. Both wrap (`overflow-wrap: anywhere`).
- Five tiles as a `<dl>`, in order SKU, Stock qty, Stock status, Status, Sync. One tile style: small uppercase muted label, value below, `--color-paper` fill, `--radius-lg`, no border, no hover. SKU in DM Mono; Stock qty larger and bold; existing badges for statuses and sync; "Dr Trust sheet has N." inside the Stock qty tile when the quantities differ. Values wrap inside the tile; tiles in a row are equal height.
- Grid: under 768px 2 columns, SKU spans both; 768–1023px 3 columns, SKU spans two beside Stock qty; from 1024px one row of 5.
- No mode buttons. Below the tiles: the adjuster (or the stock review panel while a review is open) for an editable product, or the red list of reasons for a blocked one.
- Pencil (editable, `aria-label="Edit details"`) or eye (not editable, `aria-label="View details"`) in the header's top-right: icon only, 44px tap area, shared tooltip, hover / press / focus ring. Hidden while the form is open.
- The icon is disabled while a save runs or while a stock review or its outcome (including a half-saved Retry) is showing, so the form never hides that result. Interim until US-64 removes the stock review.
- Tapping it calls `ProductNavigation.openDetails()`: a typed adjuster amount and chosen sign are cleared silently (A-UI-30), and the form replaces the whole card body (the header stays) with a 150 ms fade (none with reduced motion).

## Owner checks (signed in, TEST sheets)
- [ ] 319/320, 767/768, 1023/1024, 1440, 1920 with a long brand, long product name, long SKU and a 7-digit quantity with the Dr Trust note: grid as above, no overflow, equal-height rows.
- [ ] Editable product: pencil, tooltip "Edit details", opens the form in place of tiles and adjuster; typed amount and sign are gone after closing it.
- [ ] Blocked product: eye, opens the form read-only; red reasons under the tiles; no pencil.
- [ ] Pencil disabled while saving and while the stock review / half-saved Retry is showing.
- [ ] Muted labels readable (AA) in light and dark mode; screenshots at 320 and 1440; keyboard-only pass (Tab reaches the icon; Enter opens the form).

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run. Stale: `product-summary.spec.ts`.
- Typechecks (`tsconfig.app.json`, `tsconfig.spec.json`) and the production build pass.
