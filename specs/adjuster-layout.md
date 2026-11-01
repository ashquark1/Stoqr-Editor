# Feature: New adjuster layout with one Apply button (US-75, S6-a + UI-6)
# Sprint 8. Classification: UI (template and scoped SCSS; store from US-62/64). Depends on US-62, US-64.

## Behavior Rules
- Heading "Adjust stock" (small uppercase). Labels "Amount" and "New total" always visible above their boxes.
- From 768px: two equal columns with a vertical "or" divider; left: Amount box then "+" and "−"; right: New total box. Boxes stop at 240px; boxes and signs 44px; columns aligned at the top.
- Under 768px: stacked full width — Amount over its row (box, +, −), a horizontal "or" with a line each side, New total, the preview, Apply full width. At 320px the Amount row fits on one line (the box shrinks, the signs stay 44px).
- Footer under the columns, separated by a thin line: preview left, Apply right (primary, 44px, min 120px). Reserved height (44px) so the preview never shifts the layout.
- Preview: "Current 24 → +5 → New 29" with the Stock Status badge (a new total shows its delta the same way), and the red "Below the low-stock threshold (T)." line. Red messages replace the preview, `role="alert"`, tied to the box in use with `aria-describedby` / `aria-invalid`. Hints: nothing typed → "Enter an amount or a new total."; amount without a sign → "Choose + or −." (owner, 2026-10-31).
- Sign buttons show only "+" / "−", 44px square, accessible names "Add" / "Subtract" with the shared tooltip; the chosen one uses the new shared `.stoqr-btn--pressed` (Dew fill, Pine outline) and `aria-pressed="true"`; tapping it again keeps it chosen; the other sign switches.
- Typing in one box clears the other box and the sign (store rule, US-64); the way not in use gets a grey fill. Both boxes `inputmode="numeric"`; Enter applies (US-64 rules). Boxes reach the store through their `input` events.
- Removed: the Add/Subtract text buttons, the "Choose Add or Subtract." hint, the Review button.
- Saving: Apply shows the shared busy state ("Saving…"); boxes and signs are off while saving or half saved. The saving line and strips are US-76.

## Owner checks (signed in, TEST sheets)
- [ ] 320, 360, 768, 1024, 1440, 1920: layout as above; no sideways scroll; Amount row on one line at 320.
- [ ] Empty: hint, Apply off. Amount without sign: "Choose + or −.". + / −: preview with badge; low-stock line when below threshold.
- [ ] New total: preview with delta; typing it clears the amount and sign and greys the Amount side (and back).
- [ ] Blocked cases show the red message in place of the preview; screen reader announces it with the box.
- [ ] Keyboard only: Amount → + → − → New total → Apply; Enter applies; focus rings visible.
- [ ] Screenshots at 320 and 1440 (each state: empty, amount, total, blocked).

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run. Stale: `quantity-adjuster.spec.ts`.
- Typechecks and the production build pass; first load 496.8 kB.
