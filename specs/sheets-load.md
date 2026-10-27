# Feature: Load both sheets by header label (US-08, US-09)
# Sprint 1. Classification: Core (Sheets read path, Product model, mapping, shared signal state).

## Problem
The app must read the master and Dr Trust spreadsheets through the Sheets API, map rows into typed products by header label, and refuse to continue (naming the sheet and column) if the required headers are not there. Nothing downstream (picker, adjuster, pairing) is safe without this.

## Non-Goals
- No writes of any kind in Sprint 1 (`SheetsWriter` is Sprint 2).
- No SKU pairing (US-30), picker/search (US-12), sync badge (US-37), data-health view (US-31).
- No 429 backoff or retry policy (US-11); a manual Retry button is enough now.
- Full per-sheet "no access" handling (US-32); here the error only names the failing sheet.

## Behavior Rules
- `HttpClient` is used only under `core/sheets/`. Components never call it.
- Read: `GET https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}` with `Authorization: Bearer <token>` (token from `Auth`). Range is the quoted, URL-encoded tab name from config. Parameters (proposed, confirm in Phase 0): `majorDimension=ROWS`, `valueRenderOption=UNFORMATTED_VALUE`, `dateTimeRenderOption=FORMATTED_STRING`. Not gviz.
- Both sheets load in parallel, once per session after sign-in. All-or-nothing: if either fails, show the error naming the sheet and show no partial data.
- Row 1 is the header row. Required labels (all 21): id, brand, product name, category, sub category, sku, size, color, unit of measure, packing, stock qty, low stock threshold, stock status, mrp, selling price, purchase price, tax rate, status, notes, last updated, created at.
- Header matching: trimmed, case-insensitive, inner whitespace collapsed (same normaliser as V1), by label, never by position. Column order is irrelevant. Extra unknown columns are ignored.
- A missing required header, or the same label twice, stops loading with `SheetLoadError` naming the sheet and the label(s), e.g. "Dr Trust sheet is missing column: stock qty".
- `Product` keeps V1's shape (20 fields, no `id`); numeric fields are `number | null` (blank is `null`, never 0); `packing` is coerced to string; `lastUpdated` / `createdAt` are display strings.
- `id` never appears on `Product`, in a template, or in any feature-visible signal. It is held inside an opaque `RowRef` (a branded type or class whose members are not readable outside `core/sheets/`). Features receive `LoadedProduct = { ref: RowRef; product: Product; issues: readonly ProductIssue[] }`.
- Row handling: rows where every cell is blank are skipped. A row with a blank `id` gets issue `missing-id`; rows sharing an `id` within one sheet get `duplicate-id`; a `stock qty` that is not a whole number >= 0 becomes `null` with issue `invalid-quantity`. Rows with any issue are loaded but flagged non-editable, and the count is shown.
- Ragged rows (Sheets omits trailing empty cells) are padded, not errors.
- `stock status` is displayed verbatim in Sprint 1 (derivation arrives with the quantity flow).
- Errors map to clear messages: 401 → `Auth.markExpired()` and "session expired"; 403 → "You don't have access to <sheet label>"; 400 "Unable to parse range" → "Tab <name> not found in <sheet label>"; 404 → "<sheet label> spreadsheet not found, check configuration"; 429, 5xx or network → generic message. Every error has a Retry button (never swallowed).
- Exposed as signals from a store service: `loading`, `error`, `fetchedAt`, `master`, `drTrust` (arrays of `LoadedProduct`), plus the issue count.

## Temporary load-check view (replaced by the picker in Sprint 2)
So the owner can see the sprint goal working, `features/stock-editor` shows after sign-in: counts per sheet ("Master: N products · Dr Trust: M products · X flagged"), a loading state, the error panel with Retry, and a read-only table (name, brand, SKU, qty, status) with a switch between the two sheets. Uses `shared/ui` wrappers and `.stoqr-table`. No `id`, no editing, no search. Delete it when US-12 and US-13 land.

## Edge Cases
- Header row has trailing spaces or different case ("Stock Qty "): matches.
- Columns reordered or an extra "remarks" column: still loads.
- Two columns labelled `sku`: blocking error naming the label.
- A numeric SKU or packing cell: shown as text.
- `last updated` holds `=NOW()` on legacy rows: show the formatted value as returned.
- Empty sheet (header only): loads with zero products and an "empty" state, not an error.
- Token expires mid-load (401): returns to sign-in with the expiry message.
- Tab renamed in one spreadsheet: that sheet named in the error.

## Implementation Phases
- Phase 0: confirm the raw values returned for the TEST sheets (tax rate and mrp as numbers or percent, packing, last updated, created at, any blank `id` or duplicate `id`) and adjust the mapping rules and this spec before coding Phase 1. Do not log token or row data to the console.
- Phase 1: `field-map.ts`, `data-mapping.ts` (pure: header resolution, row → `LoadedProduct`, issues) — verified by: unit tests with fixture arrays (reordered, missing, duplicate, ragged, blank rows).
- Phase 2: `sheets-reader.ts` over `HttpClient` incl. error mapping — verified by: `HttpTestingController` tests (200, 401, 403, 400, 404, 429, network).
- Phase 3: store service and the load-check view — verified by: visual check against the TEST sheets at 360px; counts match the sheets.

## Test Plan
Rule-level:
- `id` is not a key of `Product` and does not appear in any template or feature signal; `RowRef` internals are not readable outside `core/sheets/`.
- `HttpClient` is imported only under `core/sheets/`.
- Sprint 1 reader issues only GET requests (no PUT/POST/PATCH/DELETE anywhere in `core/sheets/`).
- Header matching is order-independent (shuffle columns, same result).
- A missing/duplicate required header never yields partial data.
Case tests: edge cases above; error-mapping table.

## Acceptance Checks
- [ ] All behavior rules hold
- [ ] Both TEST sheets load and the counts equal each sheet's data row count (owner checks)
- [ ] Renaming a header in a scratch copy produces the named-column error (owner checks on a throwaway copy, never LIVE)
- [ ] Edge cases have tests
- [ ] No writes issued; verified against TEST sheets only
- [ ] No new libraries
- [ ] docs/DECISIONS.md updated (render options chosen, issue flags, all-or-nothing load); docs/projectmap.md updated
