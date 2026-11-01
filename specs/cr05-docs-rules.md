# CR-05 docs and rules (US-101) — owner answers, 2026-11-01
# Classification: DOC. Proposals applied on "Apply all"; implementation in US-94, 95, 97, 98.

## Owner decisions
1. **Appends:** `SheetsWriter` may APPEND rows (`values:append`, `RAW`, insert rows) only for a new product row in Master (+ Dr Trust when the brand is the config Dr Trust brand) and one Stock Log line. By header name, allowlisted columns, no formulas. Cell edits of existing rows unchanged; deleting rows stays forbidden; the log is append-only (never edited).
2. **Taps:** Apply, Undo, Retry, Save changes, Save product, Retry log. ONE named exception: the log line follows the confirmed Master write of the same tap (never on its own, never before it).
3. **New-row dates:** Created At and Last Updated of a new row are date serials with the cell's `dd/mm/yyyy hh:mm:ss` number format (the US-19 rule), not text. Logged At the same.
4. **Rule tests:** stay suspended (overrides the backlog's "required"); rules are checked by reading, and each spec lists the rule tests to add when tests resume.
5. **Environment files:** Claude edits both files ONCE for the log sheet when US-94 is built, after asking; the `.claude/settings.json` deny rule stays. LIVE log ID is a placeholder until US-27.
6. **New row id:** re-read just before appending; id = highest numeric id in that sheet + 1. A same-moment clash shows both rows as "repeated id" (not editable) until fixed in the sheet.
7. **Unconfirmed writes are not logged:** only a confirmed Master write gets a log line; a later confirming Try again logs it.
8. **Change column:** sent as a number (5, −3); the owner formats column G as `+0;-0;0` to show the sign.

## Proposed AI_CONTRACT changes
- Non-negotiable write rule: tap list → "Apply, Undo, Retry, Save changes (details review), Save product (new product review), or Retry log", plus: "One named exception: the Stock Log line follows the confirmed Master write of the same tap."
- Products, Forbidden: "adding or deleting rows" → "deleting rows; adding rows except a new product appended by `SheetsWriter` after Save product (US-97)".
- Writes: "Never … write whole-sheet or whole-row ranges" → "… Appends are the only whole-row writes: a new product row (Master, + Dr Trust for the Dr Trust brand) and one Stock Log line, by header name, allowlisted, RAW, no formulas."
- Writes: the request-type rule gains "`values:append` (insert rows) for those two cases only"; the format rule also covers the stamped date cells of a new row.
- New "Stock Log" section: third spreadsheet (config `stock-log`); append-only; one line per CONFIRMED Master stock change (Apply, Undo, Form edit with a Stock qty change, New product), Master quantities only, first name only, never for a conflict, a failure, an unconfirmed write or a SKU change; a log failure never undoes the stock change ("Retry log", once); no log access at load switches stock changes off.
- New products: id = highest numeric id + 1 after a fresh re-read; SKU re-checked against both sheets just before appending; Dr Trust only for the configured brand; Retry appends only the missing sheet, once.

## Proposed DECISIONS entry
"2026-11-01: CR-05 — appends, the log exception and new-row rules [confirmed]" with items 1–8 above.

## Proposed projectmap
- Data Source: owns appends (new product rows, log lines) and the log sheet's load/header check; `sheets-writer.ts` description gains "appends".
- Stock: owns the log-line builder and pending "Retry log" state (US-94/95).
- Config: three sheet definitions (master, dr-trust, stock-log).

## US-101 audit (2026-11-01, after US-94–100 were built) — applied 2026-11-01 (owner: Apply all)
Most of the wording above is already in AI_CONTRACT, DECISIONS and projectmap. What the built code still needs in the docs:
1. **AI_CONTRACT, Stock Log:** "config `stock-log`" → "config `stockLog` (its own `SheetLocation`, not a third `sheets` entry)".
2. **AI_CONTRACT, Writes (new rule):** "`appendLogLine` is called only by `StockLogStore` (`record` / `retryLog`); `SheetsWriter.create` only by `NewProductReviewStore`; `SheetsStore.addRow` only with a confirmed `CreatedRow`."
3. **CLAUDE.md, Code Rules:** the tap list "(Apply, Undo, Retry, Save changes)" → "(Apply, Undo, Retry, Save changes, Save product, Retry log; the Stock Log line follows the confirmed Master write of the same tap)", and "Never write `id`" → "Never write `id` (a new row's id is filled by `SheetsWriter`, US-97)".
4. **projectmap, Config:** "(master, dr-trust; stock-log from US-94)" → "(master, dr-trust) and the separate `stockLog` location (US-94)"; Data Source's last line gains "+ the `stockLog` location".
5. **specs/sheets-writer.md:** a CR-05 section — `appendLogLine`, `create`, `formatDateCells`, the append error rules (429 resend after re-check; 5xx / network `unconfirmed`, never resent), "never added twice".
6. **specs/environment-config.md:** the optional `stockLog` block, its startup check, TEST / LIVE IDs differ (owner set them; deny rule unchanged).
7. **Rule tests to add when tests resume** (suspended, item 4 above): `:append` only in `sheets-writer.ts`; `appendLogLine(` only in `stock-log-store.ts`; `approveCreate(` only in `core/details/new-product-review-store.ts`; `.create(` on the writer only there; `log.record(` only in the stock / details / new-product stores' Master-confirmed paths; the tap list.
