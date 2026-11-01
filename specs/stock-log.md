# Feature: Stock log — sheet access, config and append (US-94, C5-g)
# Sprint 10 (spec) / Sprint 11 (build). Classification: CORE (config, data access, write path). Approved 2026-11-01; built 2026-11-01 (tests not run).

## Problem
Nobody can see who changed stock, when, or by how much. CR-05 adds an append-only Stock Log spreadsheet with one line per confirmed stock change.

## Non-Goals
- Wiring the log into Apply / Undo / Form edit / New product, "Retry log" state and the no-access switch-off (US-95); the strip and message (US-96); the New product line (US-97).
- Reading old log lines (the app only appends; it never shows the log).

## Behavior Rules
### Config
- `AppEnvironment` gains `stockLog: { label, spreadsheetId, tab }` — a separate field, NOT a third entry in `sheets` (the product-sheet code keeps iterating exactly Master and Dr Trust). `validateEnvironment` checks it like the others (no blank label / ID / tab). Read only through `AppConfig.stockLog()`.
- Environment files (owner-approved one-time edit, asked for at build time): TEST = `1F8c1lJpGhIal_azVBDexzGHVtdrsGVipM78cqLzxpWg`, tab `Stock Log`, label `Stock Log`; LIVE = blank ID until US-27, so a LIVE start fails the startup check with a clear message until the LIVE log sheet exists. Architecture rules (ID only in env files; TEST and LIVE share no ID) cover it.

### Load: header and access check
- After the product sheets load (never blocking or failing them), `StockLogStore` reads row 1 of the log tab (`GET values/'Stock Log'!1:1`, same backoff and 401 renewal as other reads).
- Header check: the nine labels Change ID, Logged At, User, SKU, Mode, Qty Before, Change, Qty After, Note — trimmed, case-insensitive, any order (columns found by label). A missing label → state `unusable` with "The Stock Log sheet is missing the column <label>."
- Access: 403 → `no-access` ("You don't have access to the Stock Log sheet…"); 404 / missing tab → `unusable` naming the sheet or tab; network / 5xx after backoff → `unknown` (offered again on Refresh; stock changes stay on — the append itself will fail visibly). States: `checking` | `ready` | `no-access` | `unusable` | `unknown`. The switch-off itself is US-95.
- Limit: a read proves read access only. A person with View-only access passes the check; their first append fails (403) and becomes a "Retry log" case (US-95/96). The owner shares the log as Editor with all staff.

### The line (one pure function, `core/stock-adjust/stock-log-line.ts`)
- `logLine(change, now, random)` → the nine values:
  - Change ID `yyyyMMdd-HHmmss-XXXX` from the user's local time + 4 random characters `[A-Z0-9]` (sorts by time; unique in practice).
  - Logged At: a date serial (with the `dd/mm/yyyy hh:mm:ss` cell format, like Last Updated).
  - User: the signed-in first name, or "Signed in" when unknown (never an email or token).
  - SKU: the Master SKU at the time of the change.
  - Mode: `Add`, `Subtract`, `New total`, `Form edit`, `Undo`, `New product`.
  - Qty Before: Master before (blank for New product); Change: a number (`+5` → 5, `-3` → −3; New total / Form edit / Undo = after − before; New product = opening stock); Qty After: Master after.
  - Note: blank, or `Reverses <Change ID>` for Undo.
- The Change ID of a confirmed Apply is kept on `StockSaved` so its Undo can name it (US-95).

### Append (in `SheetsWriter`, the only mutating file)
- `SheetsWriter.appendLogLine(line)`: re-reads row 1 (headers by label), builds ONE row in header order (unknown columns blank), then `values:append` on `'<tab>'!A1` with `valueInputOption=RAW`, `insertDataOption=INSERT_ROWS`, `includeValuesInResponse=true`; confirmed only when Google echoes every value. Then the Logged At cell's number format (`repeatCell`, the existing mask) on the exact appended cell from `updates.updatedRange`.
- Allowlist: the nine columns only; numbers as numbers; no formulas (RAW); never edits or deletes a line; never touches any other range.
- Errors: 429 → backoff and resend (append is safe to resend only after 429: Google saved nothing); 401 → renewal, then once more; 5xx / network → `unconfirmed`, NEVER resent automatically (a resend could double the line); 403 / 404 → failed with the reason.
- It is not an `ApprovedChange` write: it is called only by the stock and details stores right after their own confirmed Master write (the AI_CONTRACT named exception) and by "Retry log". An architecture rule will check `appendLogLine` callers when tests resume.

## As built (2026-11-01)
- `stockLog?: SheetLocation` in `AppEnvironment` is OPTIONAL in the type: without the block the app still compiles and the log reads as `unusable` ("not set up"). The environment files could not be edited by Claude (the deny rule is loaded at session start); the owner pastes the block.
- Files: `core/config/app-environment.ts` (`SheetLocation`, `stockLog`, validation), `app-config.ts` (`stockLog()`), `core/sheets/a1-range.ts` (`tabRange(tab, rows)`), `sheets-reader.ts` (`readHeader`), `core/sheets/stock-log-map.ts` (labels, `resolveLogHeaders`, `logRowCells`), `core/stock-adjust/stock-log-line.ts` (`logLine`, `changeId`), `core/sheets/sheets-writer.ts` (`appendLogLine`, `LogAppendResult`), `core/stock-adjust/stock-log-store.ts` (`StockLogStore`: status + message; created with `StockReviewStore`).
- Nothing calls `appendLogLine` yet: US-95 wires Apply, Undo and Form edit.

## Edge Cases
- Log sheet headers reordered → still found by label. Extra columns → left blank.
- The format step fails after the values append → the line stays (it is confirmed); Logged At shows as a number until fixed by hand. Reported as logged.
- Two staff changing stock at once → two appended rows; Google keeps both.

## Rule tests to add when tests resume
Line builder for all six modes; signed Change; Change ID format and uniqueness over 10,000 calls; allowlist / header order; append-only (no other request types); no resend after `unconfirmed`; header check; no token or email in a line.

## Owner checks (TEST)
- [ ] The TEST log tab is named `Stock Log` and row 1 has exactly the nine headers; shared as Editor with staff; column G formatted `+0;-0;0`.
- [ ] Approve the one-time environment-file edit when asked.

## Acceptance
- [ ] Spec approved before code (Sprint 11).
- [ ] Typechecks and build pass; first-load size reported.
