# Feature: Stock rules — set a new total, one shared limit (US-62, S6-b)
# Sprint 8. Classification: CORE (quantity rules). Depends on CR-04. Before US-63.

## Problem
Staff can only change stock by an amount (+ / −). Correcting a count to a known total means working out the difference by hand. CR-04 adds "set a new total" as a second way, under the same rules and limit.

## Non-Goals
- The adjuster state and screen for the new way (which box is in use, Apply) are US-64 / US-75.
- No write-path change; the writer still writes the absolute quantity after the re-read guard.

## Behavior Rules
- ONE pure function still computes every proposed quantity: `proposeQuantity(current, entry)` in `core/stock-adjust/stock-adjust.ts`, where `entry` is `{ way: 'amount', mode, amount }` or `{ way: 'total', total }`. The result shape is unchanged (`current`, signed `delta`, `proposed`, or a block with a message). The single caller (`StockAdjustStore`) passes `{ way: 'amount', … }`.
- Amount way: unchanged rules and messages — "Enter a whole number (no decimals).", "Enter an amount above 0.", "You can't subtract N: only C in stock.", "That's more than 1,000,000. Check for an extra zero." (and the resulting-quantity cap message).
- Total way: a whole number from 0 to 1,000,000 that is not the current quantity. Blocks: not whole → "Enter a whole number (no decimals)."; below 0 → "Enter 0 or more."; over 1,000,000 → "That's more than 1,000,000. Check for an extra zero."; equal to current → "That's already the current quantity." `delta = total − current`.
- `parseAmount` reads an optional leading minus (`-3` → −3), so a negative entry gets the sign message ("Enter an amount above 0." / "Enter 0 or more.") instead of the whole-number one. Decimals, `1e3`, text → not whole, as before.
- Never clamps; the base is always the MASTER's current quantity; an invalid current quantity blocks both ways.
- The limit is ONE constant, `MAX_QUANTITY` (already shared with the details form's whole-number fields; US-63 uses it for Stock qty).
- Preview: the store's existing status and low-stock line (`deriveStockStatus` with the master threshold; "below" only when a threshold is set and the new quantity is under it) work from `proposed`, so both ways share them. No rule in a component.

## Edge Cases
- Total 0 (current 5) → allowed, Out of Stock. Total 1,000,000 → allowed. 1,000,001 → over-cap. Total = current → blocked. Amount −3 → "Enter an amount above 0.". Total −3 → "Enter 0 or more.". Current invalid → blocked for both.

## CR-04 contract changes (proposed now, applied on "Apply all" so Sprint 8 code follows the contract)
AI_CONTRACT.md
- Stock rule "The proposed final quantity = current ± amount, computed by ONE pure function (`proposeQuantity`)…" → "The proposed final quantity = current ± amount, or a new total (0–1,000,000, not the current quantity), computed by ONE pure function (`proposeQuantity`)…".
- "Rule: quantity changes happen only through the quantity adjuster → review → approve flow. The details form shows Stock Qty read-only." → "Rule (CR-04): quantity changes happen only through the adjuster (preview → one Apply tap), its Undo, a Retry of a half-done save, or the details form's Stock qty field (review → Save changes). No other path writes a quantity."
- Non-negotiable "ONLY after the user has explicitly approved the change in the review step" → "ONLY after an explicit user tap: Apply (after the preview), Undo, Retry, or Save changes (details review)".
- Forbidden "writing a value computed from anything but the freshly re-read sheet value + the approved delta" → "writing a quantity other than the approved absolute value, and only after the re-read shows the master quantity the user saw".
- Linked Sheets: "the review step must show a non-blocking note when it differs" → "the adjuster's saved strip says what Dr Trust had ('Dr Trust had N.'), and the details review shows the 'will be set to' note"; Forbidden "…without showing it in the review step" → "…without showing it to the user".
- Product Details: "Stock Qty, Stock Status, Last Updated and Created At are never inputs" → "Stock Status, Last Updated and Created At are never inputs; Stock qty is an ordinary required field (whole number 0–1,000,000, `MAX_QUANTITY`)".
- Product Details (owner, 2026-10-31): a Stock qty change in the details form of a linked product guards the MASTER qty only, like the adjuster; Dr Trust's qty is overwritten (review shows "will be set to"). Other changed fields keep the per-sheet guard.
- "Rule: stock and details reviews share `ReviewFlow` … never fork its steps per review." → "Rule: every approved save (stock Apply, Undo, Retry, details Save changes) uses `ReviewFlow` (`core/sheets/review-flow.ts`) for saving, outcomes and Retry; stock starts at saving (no review step). Never fork its steps."
- Writes: "ONLY after the user has explicitly approved…" also in Writes (cross-cutting) → same "explicit user tap" wording; values written are absolute, guarded by the re-read master qty the user saw (Undo: the qty just saved).
CLAUDE.md
- "Quantity is a whole number ≥ 0. Never write without the approval step." → "… Never write without an explicit user tap (Apply, Undo, Retry, Save changes)."
DECISIONS.md (new entry)
- CR-04: one function for both ways; no review page for stock (risk: a slip such as 500 for 5 is written at once; guards: preview, red limit messages, Undo ~10 s); supersedes "Quantity is edited only via the adjuster" and the stock part of "Approval flow with a re-read guard" (the re-read guard itself stays).

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run. `stock-adjust.spec.ts` call sites are updated to the new signature only so the spec typecheck stays clean.
- Rule checks by reading: every blocked case and message above; 0, 1,000,000, 1,000,001, equals-current, negative; no clamping; no quantity maths outside `core/stock-adjust/`.

## Acceptance Checks
- [ ] Rules hold (read-through; tests not run)
- [ ] Typechecks and build pass
- [ ] No new libraries; no off-limits files
- [ ] DECISIONS / AI_CONTRACT / CLAUDE.md updated on "Apply all"
