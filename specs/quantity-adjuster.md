# Feature: Quantity adjuster — add/subtract with a live preview (US-15, US-16, US-17)
# Sprint 3, story A. Classification: Core (quantity rules; shared signal state).
> **Superseded in part by CR-04 (2026-10-31):** a new total is a second way in the same `proposeQuantity` (`specs/stock-rules-set-total.md`, US-62); there is no review step — Apply writes at once (`specs/stock-apply.md`, US-64), with Undo (`specs/stock-undo.md`, US-65). The quantity rules below still hold.


## Problem
Staff need to change a product's stock by a whole amount and see, before anything is saved, exactly what the new quantity and Stock Status will be — with impossible results (below zero, a typo like an extra zero) stopped and explained rather than silently adjusted.

## Non-Goals
- No review, approval or write (story B: US-18, 19, 33, 35, 20).
- No Dr Trust quantity note (shown in review, story B).
- No editing of other fields (Sprint 4).

## Behavior Rules
- One pure function computes the proposal: `proposeQuantity(current, mode, amount)` in `core/stock-adjust/stock-adjust.ts`; `parseAmount(raw)` turns the typed text into an amount (blank → none; whole digits, trimmed → that number; anything else → not whole).
- Quantities are whole numbers. The amount must be a whole number above 0. Subtracting past zero is BLOCKED with "You can't subtract N: only M in stock." — never clamped. Owner-confirmed cap: the amount and the result may not exceed 1,000,000 ("That's more than 1,000,000. Check for an extra zero.").
- `proposeQuantity` never returns a negative, fractional or over-cap quantity.
- The base is the selected product's MASTER quantity.
- The new Stock Status preview uses `deriveStockStatus(proposed, master threshold)` — the same rule the writer uses. A low-stock warning shows when the new quantity is below a set threshold.
- State lives in `core/stock-adjust/stock-adjust-store.ts` (mode, typed amount, proposal, status, warning, `readyForReview`). It resets when the selected product changes or the selection clears (including a new session).
- Add/Subtract starts unselected: nothing is calculated until one is chosen.
- The adjuster appears in the summary card only for an editable product (`editability()`); the card keeps showing the reasons otherwise.
- Only `core/` may import `proposeQuantity`, `parseAmount` or `deriveStockStatus` (architecture rule): quantity maths and status are never computed in a component.

## Edge Cases
- Amount `2.5`, `-3`, `1e3`, `abc`: "Enter a whole number (no decimals)."
- Amount `0`: "Enter an amount above 0."
- Subtract more than in stock: blocked with the counts.
- Subtract exactly the stock: 0, Out of Stock.
- Amount or result over 1,000,000: blocked.
- No threshold set: no warning; status follows the no-threshold rule.
- A different product selected: mode and amount reset.

## Implementation Phases
- Phase 1: `stock-adjust.ts` — verified by: rule and table tests.
- Phase 2: `StockAdjustStore` — verified by: unit tests.
- Phase 3: `quantity-adjuster` component in the summary — verified by: component tests; owner check at phone width.

## Test Plan
Rule-level:
- `proposeQuantity` never returns a negative, non-integer or over-cap quantity (sweep of currents × amounts × modes).
- A subtraction past zero is blocked, never clamped.
- The preview status equals `deriveStockStatus` for the proposed quantity.
- Quantity maths is imported only in `core/` (architecture rule).
Case tests: the edge cases above; store resets; component states.

## Acceptance Checks
- [x] All behavior rules hold (rule, store and component tests; the import rule caught a planted violation, 2026-10-28)
- [x] Edge cases have tests
- [x] Owner tries add, over-subtract, 2.5, 0, 5000000 and a drop below the threshold at phone width (owner confirmed 2026-10-29)
- [x] No new libraries
- [x] docs/DECISIONS.md (cap and warning confirmed; mode starts unselected), docs/AI_CONTRACT.md and docs/projectmap.md updated
