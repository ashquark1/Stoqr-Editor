# Feature: Details result strips; remove the toasts (US-80, S8-d)
# Sprint 9. Classification: UI (+ display state in `DetailsReviewStore`). Depends on US-54, US-66, US-79.

## Behavior Rules
- Saving: "Save changes" shows the busy "Saving…" and is off, "Back" is off, and the line "Saving to Master and Dr Trust…" (or "Master") shows.
- Saved: the review and the form close (`DetailsStore.closeForm`; focus back on the pencil), the tiles show the saved values, and a green strip "**Details saved.** Master and Dr Trust." (master-only "…Master.") sits directly under the card header for 5 s (`DETAILS_SAVED_MS`). No product name, no field count, no Undo. It ends early on another product or a new review.
- Conflict (red): the existing wording, with "Review again" and "Back"; untouched fields show the new sheet values and the edits are kept.
- Couldn't save, nothing written (red): the reason + " Nothing was changed." (only when certain — the shared `ReviewFlow.failureText`, same rule as stock), with "Try again" and "Back".
- Half saved (amber): the existing message + " The sheets differ until you retry." (`ReviewFlow.partialText`), with "Retry Dr Trust" and "Close"; Close closes the review and the form, the tiles show the written sheet's values, Sync says "Out of sync", the edits are dropped.
- Strips are the shared `<stoqr-strip>`; texts and buttons come from `DetailsReviewStore.strip()` / `stripAction()`. `ResultStrip<A>` is now shared with the stock strips (`core/sheets/review-flow.ts`).
- Removed: the "Details saved" toast. The top toast remains only for Refresh problems, sign-in problems and "product no longer in the sheet".

## Owner checks (signed in, TEST sheets)
- [ ] Save a details edit: form closes, tiles updated, green strip for ~5 s, focus on the pencil; no top toast.
- [ ] Conflict (edit the same field in the sheet first): red strip, Review again / Back, edits kept.
- [ ] Offline: red strip with Try again / Back.
- [ ] Dr Trust unreachable: amber strip, Retry Dr Trust / Close; Close shows Out of sync.
- [ ] Longest strip text at 320 and 1440; screen reader: success polite, problems at once.

## Test Plan
- Unit tests suspended (2026-10-29); not written or run. `details-review-store.spec.ts` assertions on the old toast text replaced by `savedSheets()` only (stale otherwise). Typechecks and build pass (first load 496.9 kB).
