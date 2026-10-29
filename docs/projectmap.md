# Project Map — Stoqr Editor (V2)
# Domain ownership reference. Read this before any core domain change.
# Last updated: 2026-10-29
# NOTE: the scaffold landed 2026-10-28 (US-01–03). Paths marked (planned) do not exist yet. Update as files land.

## Purpose
A frontend-only Angular 21 SPA with one page, used by the owner and staff to edit the Stoqr Google Sheet: find a product, adjust its stock quantity (add / subtract → see proposed final quantity → approve), and edit every product field except the internal `id`. There is no backend; users sign in with Google and the app calls the Sheets API directly. V1 (a separate repo) is the read-only search & view app and is not touched by V2.

## Core Domains

### Products
- **Owns:** the typed `Product` model, row→model mapping by header label, the opaque `RowRef` (wraps the internal `id`), and the field allowlist (which columns are editable).
- **Does NOT own:** quantity maths (Stock domain), HTTP/auth (Data Source, Auth), rendering (UI).
- **Code lives in:** `src/app/core/models/product.ts` (+ `product-status.ts`, display only), `src/app/core/sheets/field-map.ts` (label ↔ field), `data-mapping.ts`, `row-ref.ts`.
- **The rule:** the sheet is the single source of truth; `id` never leaves `core/sheets/` except as an opaque `RowRef`.
- **Forbidden:** `id` on `Product` or in any form/template; creating or deleting rows; transforming fields inline in templates.

### Stock & Inventory Levels
- **Owns:** `proposeQuantity` (pure: current ± amount, whole numbers, blocks < 0), `deriveStockStatus` (pure: quantity + Low Stock Threshold → `In Stock` / `Low Stock` / `Out of Stock`; Stock Status is typed text in the sheet so the app keeps it in step), the adjuster state (mode add/subtract, amount, proposed quantity), the review/approve state machine, and the low-stock warning preview.
- **Does NOT own:** the write itself (Data Source) or product identity (Products).
- **Code lives in:** `src/app/core/stock-adjust/` — landed: `stock-status.ts` (`deriveStockStatus`, the one Stock Status rule), `stock-status-display.ts` (display only), `stock-adjust.ts` (`proposeQuantity`, `parseAmount`, `formatDelta`; 1,000,000 cap), `stock-adjust-store.ts` (adjuster state; resets on product change), `stock-review-store.ts` (review → approve → write, plus Retry after a partial save, via the shared `ReviewFlow`; the only caller of `approve()` for stock changes).
- **The rule:** quantity changes only via adjuster → review → approve; the proposed value is computed in exactly one place.
- **Forbidden:** clamping silently; decimals; computing the written value from anything but the re-read sheet value + approved delta.

### Product Details
- **Owns:** the details field list (groups, kinds, required, locked), validation, form state (the user's edits over current data, errors, changes by value, the "Discard changes?" step), the changed-fields diff, and the review/approval of details edits (US-23, US-24, US-36).
- **Does NOT own:** the write itself (Data Source), editability (`editability()` in Data Source), or rendering (UI).
- **Code lives in:** `src/app/core/details/` — `details-fields.ts`, `details-validation.ts` (`validateDetail`), `details-store.ts` (`DetailsStore`; edits only; resets on product change), `details-diff.ts` (pure: parse, changed values, diff and status lines, one guarded change per sheet), `details-review-store.ts` (`DetailsReviewStore`; the only caller of `approve()` for details; uses `ReviewFlow`).
- **The rule:** components forward input; rules and state live here. Validation is imported only in `core/details/` (enforced).
- **Forbidden:** `id` in the field list; correcting typed values; a second copy of the field rules.

### Auth (Google sign-in) — cross-cutting
- **Owns:** Google Identity Services token flow, the in-memory access token, sign-in status and the first name (memory only; D1: profile scope, no email), expiry (~1 hour) with in-place renewal (session clock, `expired`/`renewing` statuses, `freshToken()`, `sessionId`; US-06), sign-out (revokes the token), and auth-driven navigation (guards + redirects).
- **Does NOT own:** any sheet reads/writes (it only supplies the token).
- **Code lives in:** `src/app/core/auth/` — `gis-types.ts`, `gis-loader.ts`, `auth-scope.ts`, `auth.ts`, `user-profile.ts`, `auth-guards.ts`, `auth-redirects.ts`, `testing/fake-gis.ts`.
- **The rule:** tokens in memory only; the app is unusable until signed in; expiry never clears work (only sign-out or another account does); 403 surfaces as a clear "no access" message naming the sheet.
- **Forbidden:** persisting tokens; embedding secrets or API keys; components touching GIS directly.

### Data Source (Google Sheets API v4) — cross-cutting
- **Owns:** all communication with the two spreadsheets (master + Dr Trust, defined in `src/environments/`) via `HttpClient`: loading both sheets, header-label→column resolution per sheet, SKU pairing of rows into linked products (plus data-health results: repeated SKUs, unmatched Dr Trust rows, Dr Trust products missing from the Dr Trust sheet, quantity differences), locating each row by its sheet-local `id`, the pre-write re-read guard on both rows, dual writes with partial-failure reporting and idempotent retry, targeted cell writes (quantity + derived Stock Status + Last Updated, with its date-time format), 429 retry with backoff, and exposing results as signals (`loading`, `saving`, `error`, `fetchedAt`).
- **Does NOT own:** quantity maths, form state, or UI.
- **Code lives in:** `src/app/core/sheets/` — landed: `a1-range.ts` (`tabRange`), `field-map.ts`, `data-mapping.ts`, `row-ref.ts`, `sheet-load-error.ts`, `sheets-reader.ts` (GET only: tab values, and `tabId` for the format request), `sheets-store.ts` (both sheets as signals; `applyRow` puts confirmed write results in), `testing/sheet-fixtures.ts`, `sheet-pairing.ts` (pure SKU pairing, sync statuses, counts), `editability.ts` (the one "may this product be changed" rule), `sync-badge.ts` (sync badge per master row; display only), `sheets-writer.ts` (the ONLY file that issues a mutating request — values and the Last Updated cell format; one or both sheets, checks all before writing any; a partial carries `remaining` for Retry), `write-plan.ts` (pure plan: row by id, re-check, exact cells, Stock Status on every write, number cells kept as numbers), `approval.ts` (`approve()` / `ApprovedChange`, `remaining()` for Retry), `sku-check.ts` (pure: a new SKU against both sheets, the orphan it may link to, and the save-time re-check), `review-flow.ts` (`ReviewFlow`: the save steps, outcomes and Retry shared by the stock and details reviews), `sheet-timestamp.ts` (Last Updated serial), `backoff.ts` (retry timing for busy/unreachable Google, `RETRY_WAIT`), plus `cellRange` in `a1-range.ts`. `data-health.ts` (pure `dataHealth`) and `data-health-store.ts` (`DataHealthStore`; display only, US-31). Spreadsheet IDs live in `src/environments/` as a list of sheet definitions.
- **The rule:** this is the ONLY place `HttpClient` is used. Writes only after approval, only allowlisted columns, only exact cells, success shown only after API confirmation.
- **Forbidden:** gviz; writing formulas, `id`, or `Created At`; clearing/overwriting ranges; any mutating request outside `SheetsWriter`.

### Config — cross-cutting
- **Owns:** the environment shape (`SheetDefinition` incl. the optional Dr Trust `brand`, `AppEnvironment`), startup validation, and read access to the Client ID and the two sheet definitions.
- **Does NOT own:** the values themselves (`src/environments/`, off-limits) or any Google call.
- **Code lives in:** `src/app/core/config/` — `app-environment.ts` (types + `validateEnvironment`), `app-config.ts` (the only `@env` reader).
- **The rule:** everything else reads config through `AppConfig`.
- **Forbidden:** importing `@env/*` anywhere else; spreadsheet IDs outside `src/environments/`.

### Sign-in (UI / feature)
- **Owns:** the sign-in screen (logo card, one button, errors in `<stoqr-toast>`).
- **Code lives in:** `src/app/features/sign-in/`.
- **The rule:** reads `Auth` signals and calls its methods; no logic, no navigation.

### Session (UI / feature)
- **Owns:** the "session ends in 5 minutes" warning and the non-dismissable "Session expired" dialog (US-06).
- **Code lives in:** `src/app/features/session/` (`session-prompts.*`), rendered once in the app shell inside `@defer (when auth.hasSession())`.
- **The rule:** reads `Auth` signals and calls `renew()`, `signOut()`, `dismissExpiryWarning()`; no logic.

### Stock Editor (UI / feature) — cross-cutting
- **Owns:** the single page: product picker (search-as-you-type), quantity adjuster, review & approve panel, and the details form (grouped: Product / Stock / Pricing / Additional — same groups as V1, `id` excluded, Stock Qty read-only, Stock Status read-only/derived, Created At read-only, Last Updated app-stamped), including the changed-fields diff before save.
- **Does NOT own:** fetching, mapping, quantity maths, or write rules (services own those).
- **Code lives in:** `src/app/features/stock-editor/` (landed: `stock-editor.*` (the page: loading/error/empty states, picker + summary), `product-picker/`, `product-summary/`, `quantity-adjuster/` (inside the summary, editable products only), `review-panel/` (replaces the adjuster while a review is open; Retry after a partial save), `details-form/` (lazy; inside the summary, one editor at a time with the adjuster), `details-review/` (replaces the form while a details review is open), `review-actions/` (the review buttons shared by both reviews), `data-health/` (lazy panel opened by the "Data health (N)" button above the picker), and the success toast on the page; the temporary load-check view was removed in US-12), consuming `shared/ui/` wrappers. Landed: `<stoqr-logo>`, `<stoqr-toast>`, `<stoqr-loading-overlay>`, `<stoqr-empty-state>`, `<stoqr-badge>`, `<stoqr-status-badge>`, `<stoqr-sync-badge>`, `<stoqr-modal>` (from V1, plus `dismissable`), `<stoqr-toast>` (plus `variant` incl. `success`, `actionLabel` (empty hides it), never-dismiss), `shared/util/display-value.ts`, and `provideStoqrUi()` (the only PrimeNG registration). Search rules are V1's, copied unchanged into `src/app/core/search/` (`search-fields.ts`, `product-matcher.ts`, `search-validation.ts`), with all search/selection state in `product-search-store.ts`.
- **The rule:** components hold view state as signals only and render via the `shared/ui` kit; Reactive Forms for inputs.
- **Forbidden:** `HttpClient`/Google calls, business logic, manual subscriptions, importing PrimeNG outside `shared/ui/`.

### App shell & architecture rules — cross-cutting
- **Owns:** the page frame (topbar with the logo, the first name and Sign out, routed content area, footer showing the TEST/LIVE mode and both sheet labels from `AppConfig`) and the contract rule tests.
- **Code lives in:** `src/app/app.*` (shell; no logic), `src/app/app.config.ts` (providers), `src/app/app.routes.ts`, `src/app/architecture.spec.ts` (scans `src/` and asserts AI_CONTRACT rules).
- **The rule:** when the contract gains a rule that can be checked by reading source, add it to `architecture.spec.ts`.

## Data Flow (high level)
User opens the SPA → signs in with Google (`core/auth`) → `SheetsReader` loads both sheets, maps rows into `Product` + opaque `RowRef` signals and pairs them by SKU (linked / master-only / blocked) → the picker narrows the list → the user selects a product and enters an amount → `proposeQuantity` shows the proposed final quantity → the user approves → `SheetsWriter` re-reads the row (both rows for a linked product), verifies `id` + quantity unchanged, writes the new quantity, the derived Stock Status and Last Updated to exact cells in each sheet → the UI shows the API-confirmed values (or, on partial failure, which sheet is behind plus Retry). The details form follows the same re-read → targeted write → confirm path for changed fields only.

## Where Changes Belong
- Change how a field is read/named/editable → `Product` model + `field-map.ts` / `data-mapping.ts` (`src/app/core/`).
- Change quantity rules (limits, warnings) → `src/app/core/stock-adjust/`.
- Change what/how we write → `SheetsWriter` only, then update the allowlist + AI_CONTRACT rule tests.
- Change sign-in/session behaviour → `src/app/core/auth/`.
- Change the spreadsheet ID or OAuth client ID → `src/environments/` (off-limits; confirm first).
- Change layout/styling → the relevant component's template + scoped SCSS (tokens only). Small and error text use `--color-text-muted` / `--color-text-error` (US-26); buttons and inputs get touch sizes from the theme.
