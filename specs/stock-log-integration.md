# Feature: Stock log integration — line per confirmed change, Retry log, switch-off (US-95, C5-h CORE)
# Sprint 11. Classification: CORE (write path, stock and details stores). Approved 2026-11-01; built 2026-11-01 (tests not run). Rules: `specs/cr05-docs-rules.md`, `specs/stock-log.md` (US-94, built).

## Problem
US-94 built the log's config, header check, line builder and `SheetsWriter.appendLogLine`, but nothing calls them. Each confirmed Master stock change must add its line as part of the same tap; a failed line must be retryable; without log access stock changes must be off.

## Non-Goals
- The amber "Retry log" strip, "Logging…", the no-access message and the visibly disabled controls (US-96). This story exposes them as state only.
- The New product line (US-97 calls the same `record()`).

## Behavior Rules
### When a line is written (one hook, in `ReviewFlow`)
- `ReviewFlow` gains one optional outcome hook, `masterConfirmed(context, master)`, called when a FIRST save confirms the Master row: result `written`, or `partial` (Master written, Dr Trust not). Never from `retry()` (Master is never rewritten there), so Retry Dr Trust never logs again.
- Never called for conflict, failed (incl. `unconfirmed`: may have saved — not logged, per CR-05) or a refused approval.
- Stock (`StockReviewStore`): Apply → Mode `Add` / `Subtract` / `New total` (from the entry); Undo → Mode `Undo`, Note `Reverses <Change ID>` of the Apply it undoes. Qty Before = Master before (the guarded value), Qty After = the confirmed Master qty, SKU = the confirmed Master SKU.
- Details (`DetailsReviewStore`): Mode `Form edit` only when the approval changed Stock qty AND the confirmed Master qty differs from before. Other fields, a SKU change and the Dr Trust qty are never logged.
- User = `Auth.firstName()`, else "Signed in" (existing profile; no email, no new scope).

### `StockLogStore.record(change)` — the one caller of `appendLogLine` for stock
- Builds the line once with `logLine` (so its Change ID is fixed) and returns the Change ID at once; `StockSaved` keeps it as `changeId` for Undo's Note (even while the line is pending).
- Not awaited by the save: the stock outcome (saved strip, Undo for 10 s, half saved) is shown and unchanged whatever the log does.
- Lines are appended IN ORDER: while any line is pending, a new line joins the queue behind it (not sent), so the log never goes out of order. Suggested owner choice; alternative: send new lines at once.
- `logged` → done. `failed` / `unconfirmed` → the line (and any behind it) stays in `pending`, with the reason.

### Retry log (`StockLogStore.retryLog()`, an explicit tap)
- Works only when lines are pending and no append is running (`logging`), so a double tap sends once.
- Never twice: first reads the log's Change ID column (one read; column found by header) and drops queued lines already there (an `unconfirmed` append that did land). Then appends the rest in order, stopping at the first failure.
- Undo of the change stays available while its line is pending (the 10 s window is unchanged).

### Pending lines' lifetime
- Kept across product changes, Refresh and session expiry/renewal (memory only). Dropped on sign-out or another account (`Auth.sessionId`), like all work. A page reload loses them (no storage; trade-off to log).

### Switch-off when the log can't be used
- `StockLogStore.stockChangesOff` = status `no-access` or `unusable` (incl. "not set up"), with `offReason` = the status message. `checking` and `unknown` stay ON (a failed append becomes Retry log).
- While off, refused in core (UI shows it in US-96): `StockReviewStore.apply()` and `undo()` (and `undoAvailable` false); a details save that changes Stock qty (`DetailsStore.stockQtyLocked` for the form; `DetailsReviewStore.approve()` refuses it — other fields still save); Add product (`ProductNavigation` does not open the New product shell).
- Re-checked on every Refresh (US-94), so sharing the log and refreshing switches stock changes back on.

## As built (2026-11-01)
- `ReviewFlow.masterConfirmed` hook; `SheetsReader.readColumn`; `StockLogStore` (`record`, `pending`, `hasPending`, `logging`, `failure`, `retryLog`, `stockChangesOff`, `offReason`, reset on `sessionId`); `StockSaved.changeId`; `DetailsStore.stockQtyLocked` / `stockQtyLockedReason` (a changed Stock qty gets that field error); `DetailsReviewStore` Form edit line; `ProductNavigation.toggleNewProduct` refuses while off.
- UI (strip, "Logging…", the no-access message, visibly disabled controls) is US-96.

## Edge Cases
- An `unconfirmed` Master write that did land: Try again re-reads, sees the new qty and is a conflict, so no line is written for it. Rare (5xx/network after Google saved); the owner can add the line by hand. Accepted.
- A View-only person on the log: passes the load check; the first append fails (403) → pending, Retry log; they should be shared as Editor.
- Two changes, first line pending: the second line queues; one Retry log sends both, in order.
- Sign-out with lines pending: lines dropped (no warning in this story; US-96 may add one).

## Files
`core/sheets/review-flow.ts` (`masterConfirmed` hook), `core/sheets/sheets-reader.ts` (read one column), `core/stock-adjust/stock-log-store.ts` (`record`, `pending`, `logging`, `retryLog`, `stockChangesOff`, `offReason`, session reset), `core/stock-adjust/stock-review-store.ts` (modes, `changeId` on `StockSaved`, switch-off), `core/details/details-review-store.ts` + `details-store.ts` (Form edit, `stockQtyLocked`), `core/navigation/product-navigation.ts` (Add product off).

## Rule tests to add when tests resume
A line only after a confirmed Master write; none for conflict, failed, unconfirmed, a details save without a qty change, or a SKU change; Mode, signed Change, Before/After for Add, Subtract, New total, Undo, Form edit; Undo names the original Change ID; User is the first name only; a log failure keeps the stock outcome and leaves a pending line; Retry log appends once (and skips a line already in the sheet); order kept; switch-off refuses Apply, Undo, Stock qty in the form and Add product; a double tap writes once.

## Acceptance
- [ ] Spec approved before code.
- [ ] Typechecks and build pass; first-load size reported (tests not run).
- [ ] Owner checks (TEST): Add / Subtract / New total / Undo / Form edit each add one correct line; Retry Dr Trust adds none; with the log unshared, Apply, Undo, form Stock qty and Add product are refused.
