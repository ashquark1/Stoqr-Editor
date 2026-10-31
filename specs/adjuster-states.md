# Feature: Adjuster states and strips (US-76, S7-b)
# Sprint 8. Classification: UI (adjuster template; strip view model in `StockReviewStore`). Depends on US-54, US-64, US-65, US-75.

## Behavior Rules
- Saving: Apply shows the spinner and "Saving…"; boxes, signs, the pencil and Refresh are off; the footer reads "Saving to Master and Dr Trust…" / "Saving to Master…" (config labels, `targetsText()`). The entry and sign stay visible until the result. Undo: the footer reads "Undoing…".
- One result strip (the shared `<stoqr-strip>`, US-54) under the footer, built by `StockReviewStore.strip()`; buttons call `stripAction()`:
  - Saved (green): "**Stock saved.** Now 29 in Master and Dr Trust." (master-only "…in Master."), plus " Dr Trust had 22." when it differed; "Undo" while offered; gone after 10 s (store timer). A new entry can be typed meanwhile.
  - Restored (green): "Stock restored to 24." for 5 s, no buttons.
  - Refused undo (red): "Can't undo: the stock is now 30, changed by someone else. Nothing was saved." + "Dismiss".
  - Conflict (red): "The stock changed to 30 since you opened this product. Nothing was saved." + "Dismiss".
  - Couldn't save (red): the writer's reason + " Nothing was changed." + "Try again" (repeats the last Apply or Undo). Not added when the reason already says nothing was saved, or when Google did not confirm (`unconfirmed`: it may have saved).
  - Half saved (amber): the existing message + " The sheets differ until you retry." + "Retry Dr Trust" / "Close"; boxes, signs and Apply off until Retry succeeds or Close.
  - Retry success (green): "**Dr Trust updated.** Both sheets now show 29." (no Undo).
- The saved strip ends on another Apply, another product, Refresh or the form opening (store `close()` / `apply()`).
- Focus after a result: the strip's first button, else the Amount box.
- Removed: the "Stock saved" toast and the interim `review-panel/`.

## Owner checks (TEST sheets)
- [ ] Each state above at 320 and 1440 with a long product name; strip text wraps; buttons full width on phones.
- [ ] Saving: every control off, footer saving line, no layout jump.
- [ ] Saved strip leaves after ~10 s; restored after ~5 s.
- [ ] Keyboard: after Apply, focus lands on Undo; after a conflict, on Dismiss.
- [ ] Screen reader: success read politely, problems at once. No top toast for stock.

## Test Plan
- Unit tests suspended (2026-10-29); not written or run. `review-panel` and its spec removed with the component; `product-summary.spec.ts` import fixed only (assertions stale).
- Typechecks and build pass; first load 496.75 kB.
