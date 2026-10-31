# Feature: Apply without review, stay on the product, outcomes as state (US-64, S6-c + S5-e, S7-c)
# Sprint 8. Classification: CORE (stock stores, shared ReviewFlow). Depends on US-62. Replaces US-18's review step (CR-04; AI_CONTRACT applied 2026-10-31).

## Problem
A stock change needed Review → Approve, and a save closed the product. CR-04: one Apply tap after the live preview, the product stays open, and every result is state the card can show.

## Non-Goals
- Undo (US-65); the new adjuster layout with the New total box (US-75); strips and texts (US-76). Until then the old adjuster gets an Apply button, the old panel shows the outcomes, and the "Stock saved" toast stays.

## Behavior Rules
- `StockAdjustStore` holds the amount text, the sign and the new-total text. Typing a new total clears the amount and the sign; typing an amount or choosing a sign clears the total. The way in use is the total when its box has text, else the amount. `proposal` uses `proposeQuantity` for that way (an amount needs a sign). `applyReady` = editable product AND a valid proposal. `hasEntry` (any text or a sign) is what `ProductNavigation` counts as unsaved.
- `StockReviewStore.apply()` (button, or Enter in a box) writes at once: `approve()` with Master guarded by the quantity the user saw and Dr Trust (if linked) unguarded, same absolute quantity in both; then the shared `ReviewFlow` → `SheetsWriter` (re-read and check every sheet first; Stock Status and Last Updated by the writer). Nothing happens unless `applyReady`; it may start from editing, conflict or failed (so Try again repeats the same Apply with the kept entry), never while saving or half saved — one tap writes once.
- `ReviewFlow` keeps one set of steps for every save; each store passes the steps a save may start from (details: reviewing, failed — unchanged; stock: editing, conflict, failed). It gains an optional `conflict` hook, and `written` is told whether it was a Retry.
- Outcomes (state, one at a time):
  - saving: `step() === 'saving'`; every adjuster control and the pencil are off.
  - saved: `saved()` = product name, previous qty, saved qty, sheets text, what Dr Trust had when it differed, and whether it was a Retry. The product stays open (no `clearSelection()`), the tiles show the confirmed values, the adjuster is empty. Kept until the next Apply, another product, a refresh (new row ref) or the form opening.
  - conflict: the re-read row is put into the loaded data; the entry and sign are cleared; message "The stock changed to N since you opened this product. Nothing was saved."
  - failed (nothing written): the reason; entry and sign kept; Try again = Apply.
  - half saved: the written sheet's values applied; the entry cleared; message names the written and unwritten sheets; adjuster and pencil locked until Retry succeeds or Close. Retry writes only the unwritten sheet from the original approval, once per tap. Retry success → saved with `retried` ("Dr Trust updated. Both sheets now show N." in US-76).
- `close()` dismisses a conflict / failure or abandons a half-saved Retry (the product stays Out of sync).
- The old stock review summary (`review()`, `open()`, `back()`, `readyForReview`) is removed.

## Edge Cases
- Double tap on Apply → one write (step is saving after the first).
- Enter in the amount box before a sign is chosen → nothing.
- Apply after a conflict with a new entry → allowed (fresh base from the re-read row).
- Product changes during saving → impossible (navigation blocks while saving).

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run. `stock-review-store.spec.ts` and `review-panel.spec.ts` tested only the removed review step and were deleted (to be rewritten in US-88/89 when tests resume); `stock-adjust-store.spec.ts` renamed to `applyReady`. Stale: `quantity-adjuster.spec.ts`, `product-summary.spec.ts`.
- Rule checks by reading: only `StockReviewStore` calls `approve()` for stock; one write per tap; conflict writes nothing; Retry writes only `remaining`; the product stays open.

## Owner checks (TEST sheets)
- [ ] Amount + sign, Apply: both sheets updated; product stays open with new tiles; adjuster empty; toast.
- [ ] Enter in the amount box with a sign chosen applies; without a sign does nothing.
- [ ] Double-click Apply: one write (Last Updated changes once).
- [ ] Change Master qty in the sheet, then Apply: conflict message, entry cleared, tile shows the sheet's value.
- [ ] Offline Apply: failure, entry kept; Try again works when back online.
- [ ] Dr Trust unreachable (remove access): half saved, controls locked, Retry Dr Trust / Close.

## Acceptance Checks
- [ ] Rules hold (read-through; tests not run)
- [ ] Typechecks and build pass
- [ ] Docs updated (DECISIONS, projectmap)
