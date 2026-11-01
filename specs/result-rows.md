# Feature: Result rows with detail tiles (US-91, C5-a)
# Sprint 10. Classification: UI (row markup/SCSS; a pure row view in `core/search/result-row.ts`). Depends on US-73.

## Behavior Rules
- ONE row inside `app-product-picker`, used for the home list and the overlay; one product per row at full content width; the whole row is the button. Row values come from `ProductSearchStore.rows` (`resultRow()`: left-edge level, stock word, sync flag, accessible name) — display only.
- From 768px: a 4px left edge by stock level (success / warning / error; grey for unknown or blocked). Left: uppercase brand | Status text; product name (2 lines, then cut); SKU in mono. Right: Qty (large, min 56px), Stock (`<stoqr-badge>`, the status word), Sync (`<stoqr-sync-badge>`), then a chevron.
- Under 768px (slim row, ≥ 44px): line 1 the name with ONE Qty tile at the right (stock word over the number, tinted by level with the on-colour tokens); line 2 `SKU · brand · status` (SKU in mono, cut with an ellipsis) and, only when not plainly Linked, a small sync flag.
- Hover: Pine border, Dew background, chevron moves 2px (not with reduced motion); visible focus ring. Blocked: grey fill instead of 75% opacity (opacity would drop the muted text below AA; deviation noted) and still opens read-only (eye).
- Accessible name: "name, SKU …, quantity N, stock status, sync". Visual pieces are `aria-hidden`.
- Count, empty messages and the overlay rules unchanged.

## Owner checks (signed in, TEST)
- [ ] 320, 360, 768, 1024, 1440, 1920 with a long name, a long SKU, a 7-digit quantity and all four sync states; home list and overlay.
- [ ] Hover, focus, press; reduced motion; a Blocked row opens read-only.
- [ ] Screen reader reads the row's name; keyboard-only search and select.
- [ ] Screenshots at 320 and 1440.

## Test Plan
- Unit tests suspended (owner). To add later: each state shows the right words (not colour alone); the row is a button; long text wraps / cuts. Stale: `product-picker.spec.ts`.
- Typechecks and build pass; first load 498.9 kB (warning 550 kB).
