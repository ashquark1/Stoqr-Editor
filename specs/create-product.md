# Feature: Create-product write path (US-97, C5-f)
# Sprint 10 (spec) / Sprint 12 (build; needs US-94 built). Classification: CORE (write path). Spec for approval; rules from `specs/cr05-docs-rules.md` (owner, 2026-11-01).

## Problem
Products can only be edited. CR-05 lets staff add a product: one new row in Master, plus one in Dr Trust for a Dr Trust-brand product, with a log line for the opening stock.

## Non-Goals
- The form, its state and its review/strips (US-98, US-99, US-100). Deleting rows (still forbidden).

## Behavior Rules
### Approval
- A new, sealed kind: `ApprovedCreate`, made only by `approveCreate(values)` in `core/sheets/approval.ts` (module-private key, `isGenuine` like `ApprovedChange`), called only by the New product review store in `core/details/` after Save product. It holds the typed product values (every `WritableField`; Stock qty = opening stock) and the target sheets: Master, plus Dr Trust when the brand equals the config Dr Trust `brand` (trimmed, case-insensitive, inner spaces collapsed — the US-31 rule). It refuses: a blank required field, a quantity outside 0–1,000,000 (`MAX_QUANTITY`), a threshold that is not a whole number ≥ 0, and any `id`, `stockStatus`, `lastUpdated` or `createdAt` value.

### `SheetsWriter.create(approved)` — the only code that appends a product row
1. **Check every sheet first** (no write until all pass): re-read the whole tab of Master AND Dr Trust (always both: the SKU must be unique across both); headers by label; the new SKU (normalised) must match no row in either sheet → else `conflict` ("SKU … is already used in <sheet> (<name>)"), nothing written.
2. **Build each row by header**: the typed values in their columns; Stock Status = `deriveStockStatus(qty, threshold)`; Created At and Last Updated = the same date serial; `id` = highest numeric `id` in THAT sheet + 1 (non-numeric ids ignored; 1 when none); columns the app does not know stay blank. No formulas (RAW). The writer fills `id`, Stock Status, Created At and Last Updated itself; callers never pass them.
3. **Append** Master, then Dr Trust: `values:append` on `'<tab>'!A1`, `RAW`, `INSERT_ROWS`, `includeValuesInResponse=true`; confirmed only when Google echoes every value. Then the number format of the two date cells (`repeatCell`, the existing mask) on the appended row from `updates.updatedRange` — a format failure after a confirmed append keeps the row (reported as saved; the dates show as numbers until fixed by hand).
4. **Results**: `written` (every sheet confirmed); `conflict` (SKU taken; nothing written); `failed` (nothing written, with the reason, e.g. no access); `partial` (Master appended, Dr Trust not) with `remaining` = the Dr Trust append of the SAME values.
- **Errors**: 429 → re-check, then resend (Google saved nothing); 401 → renewal, once more; 5xx / network on an append → `unconfirmed`, NEVER resent automatically.
- **Retry / Try again** (always re-read first, so nothing is added twice): a sheet already holding a row with this SKU and the same product name is treated as already written (the earlier append went through); a row with this SKU and a different name → `conflict`. Retry after `partial` appends only Dr Trust, once.
- **Two people adding at once**: both may compute the same next `id`; both rows then load as "repeated id" (not editable) until fixed in the sheet (owner-accepted).

### After the write
- The confirmed row(s) go into the loaded data in memory (`SheetsStore.addRow`, which makes the `RowRef` inside `core/sheets/`), so the product appears at once in search, counts, filters, pairing and Data health — no reload.
- After the Master append is confirmed: ONE log line (US-94 builder): Mode `New product`, Qty Before blank, Change = opening stock, Qty After = opening stock. A log failure uses US-95's "Retry log" (the row stays saved).
- Outcomes as state (for US-100): saving; saved; conflict; failed; half saved; retry success. On saved, the new product opens (US-98).

## Proposed AI_CONTRACT wording (applied on "Apply all")
- Writes: "Allowlisted columns only: every product field EXCEPT `id` and `Created At`" → add "— except on a NEW row (US-97), where the writer itself fills `id` (highest numeric id + 1), Created At, Last Updated and Stock Status; a create reaches the writer only as an `ApprovedCreate` from `approveCreate()`, called only from `core/details/`."
- projectmap Data Source forbidden list: "writing … `id`, or `Created At`" → "… except on a new row (US-97)".

## Rule tests to add when tests resume
Only `SheetsWriter` appends; `approveCreate` only from `core/details/`; allowlist and header order; SKU re-check against both sheets (conflict writes nothing); Dr Trust only for the configured brand; no resend after `unconfirmed`; Retry appends only Dr Trust and never twice (row already there → written); id = max + 1; the New product log line.

## Owner checks (TEST)
- [ ] Add a Dr Trust product: a row in both sheets with the next ids, Created At / Last Updated as dates, Stock Status derived; one log line `New product`.
- [ ] Add another brand: Master only.
- [ ] SKU taken (in either sheet): conflict, nothing written.
- [ ] Dr Trust unreachable: half saved; Retry Dr Trust adds it once.
- [ ] The new product shows in search, filters and Data health without Refresh.
