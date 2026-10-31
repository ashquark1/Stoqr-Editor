# AI_CONTRACT.md — Stoqr Editor (V2)
# If a forbidden pattern isn't written here, Claude is allowed to use it.

## Non-Negotiable Rules
- The Google Sheet is edited ONLY through the single write service (`SheetsWriter`, `src/app/core/sheets/`), ONLY after an explicit user tap (Apply after the preview, Undo, Retry, or Save changes in the details review; CR-04), and ONLY to allowlisted columns. If a task seems to require a write outside this path, stop and ask.
- All Google access (Sheets API reads/writes, Google sign-in) goes through `src/app/core/sheets/` and `src/app/core/auth/`. Components and templates never call `HttpClient`, `gapi`, or Google Identity Services directly.
- No business/derivation logic in components or templates. Row→model mapping, quantity maths, validation, search and diffing live in services or pure functions. Components render and call setters.
- State is exposed as Angular signals from services. No NgRx, Akita, or ad-hoc global mutable singletons.
- No `any`, no `@ts-ignore`, no `@ts-nocheck`. Strict mode stays on. Fix the type, don't silence it.
- Standalone components only. No NgModules. Components use `ChangeDetectionStrategy.OnPush`.
- No external validation, UI, or CSS framework added without an explicit decision logged in DECISIONS.md (Q-G2: use proper framework guidelines, not one-off dependencies). The approved component library is PrimeNG (styled mode, `StoqrPreset`); the design system is first-party Stoqr SCSS.
- Features must consume the `shared/ui` wrappers, never PrimeNG `p-*` components directly. Vendor coupling lives only inside `src/app/shared/ui/`. This includes setup: PrimeNG is registered only through `provideStoqrUi()`; never import `primeng/*` or `@primeuix/*` in `app.config.ts` or anywhere else outside `shared/ui` (the design-system files in `src/styles/` are the only other exception).
- Auth: expiry never clears the user's work — only sign-out, or a different account on renewal (a new `Auth.sessionId`), does; stores that hold work reset on `sessionId`, never on expiry. `core/sheets` gets tokens only through `Auth.freshToken()`, which waits for renewal.
- Auth: only `core/auth/` touches Google Identity Services; only `core/auth/` and `core/sheets/` request tokens (`freshToken()`); neither uses `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie` — except `core/auth/remember-me.ts`, which may keep only the Remember-me record (flag + time) in `localStorage` and the one-time silent-sign-in `state` (plus a once-per-tab attempt flag) in `sessionStorage` (US-67, US-68). No token, name or account id is ever stored. Navigation driven by auth state lives only in `provideAuthRedirects()` and the route guards. Enforced by `architecture.spec.ts`.
- Auth (Remember me, US-68): the silent return is a top-level redirect to Google with `prompt=none`, at most once per tab, started only from `provideAuthRedirects()`; the token is read from the URL fragment, removed from the address bar at once, checked against `state`, and kept in memory only. Hourly renewal stays the click-based popup.
- TEMPORARY DEVELOPMENT EXCEPTION (owner, 2026-10-31; REMOVE BEFORE GO-LIVE, US-27): `core/auth/dev-session.ts` may keep the access token in `sessionStorage` so a reload keeps the session — only when `isDevMode()` AND the TEST sheets are in use, cleared on sign-out and expiry. No other file may store a token; it must never run in a production build or against LIVE.
- Node APIs (`node:*`, `process`) are for spec files only; `@types/node` is enabled only in `tsconfig.spec.json`. Never add it to the app tsconfig.
- No secrets in the repo or in browser storage. The OAuth client ID is public by design but is off-limits config; access tokens live in memory only (never `localStorage`/`sessionStorage`). The only thing persisted across visits is the Remember-me record (flag and time). No API keys, service-account keys, or client secrets — ever.

## Domain Rules

### Products
- Owner: `core/sheets/` (mapping, field map) + the `Product` model (`src/app/core/models/`).
- Rule: the Google Sheet is the single source of truth. Columns are mapped by header LABEL, never by position. Edits are field-level and go through the allowlist.
- Rule: the internal `id` column NEVER appears on the `Product` model, in a form control, template, or any feature-visible signal. It exists only inside `core/sheets/` and travels to features as an opaque `RowRef` that features pass back unchanged. It is never displayed and never editable.
- Rule: `createRowRef`, `rowRefId` and `new RowRef` are used only in `core/sheets/` (enforced by `architecture.spec.ts`).
- Rule: rows are located by `id` on every write — never by a remembered row number.
- Forbidden: hardcoding products in components; transforming fields inline in templates; adding or deleting rows (V2 edits existing rows only).

### Stock & Inventory Levels
- Owner: `core/stock-adjust/` (pure functions) + the Sheets write service.
- Rule: quantity is a whole number ≥ 0. The adjustment amount is a positive whole number; a new total is a whole number 0–1,000,000 that is not the current quantity. The proposed final quantity = current ± amount, or the new total, computed by ONE pure function (`proposeQuantity`), shown live, and never computed in a component.
- Rule: a subtraction that would go below 0 is BLOCKED with a clear message — it is never silently clamped.
- Rule: `proposeQuantity`, `parseAmount` and `deriveStockStatus` are imported only in `core/` (enforced by `architecture.spec.ts`); components only read the store's results. The amount and the resulting quantity are capped at 1,000,000.
- Rule (CR-04): quantity changes happen only through the adjuster (preview → one Apply tap), its Undo, a Retry of a half-done save, or the details form's Stock qty field (review → Save changes). No other path writes a quantity.
- Rule: before writing, re-read the target row, confirm the `id` still matches and the master quantity still equals what the user saw (for Undo: the quantity just saved). If not, abort the write and show the fresh value. No silent overwrite.
- Rule: Stock Status is typed text in the sheet, so it is DERIVED and written with EVERY save — quantity or details — per sheet from that sheet's own final qty and threshold, by ONE pure function, `deriveStockStatus(qty, lowStockThreshold)` in `core/stock-adjust/`. It is never typed by the user and never computed in a component. This supersedes V1's "stock status is read verbatim" rule, which applied only to V1's read-only contract.
- Rule: every approved change also stamps Last Updated with a static timestamp (never a formula), shown as `dd/MM/yyyy HH:mm:ss`.
- Forbidden: writing quantity without an explicit user tap; writing a quantity other than the approved absolute value, or before the re-read shows the master quantity the user saw; writing a quantity without its derived Stock Status in the same request.

### Product Details
- Owner: `core/details/` (field list, validation, form state).
- Rule: the details form shows every product field except `id`; Stock Status, Last Updated and Created At are never inputs. Stock qty is an ordinary required field (whole number 0–1,000,000, `MAX_QUANTITY`; CR-04). Field rules (groups, kinds, required, locked) live only in `core/details/details-fields.ts`.
- Rule: details validation is pure (`validateDetail`) and imported only inside `core/details/` (enforced by `architecture.spec.ts`). Invalid input blocks Review; it is never corrected.
- Rule: every step that may drop unsaved work (opening another product, closing it, clearing the search box, a Data health pick, Refresh, leaving the details form) goes through `ProductNavigation` (`core/navigation/`), which asks the one "Discard changes?" question. Unsaved work = details edits, a typed adjuster amount or a chosen sign. One editor (adjuster or details form) is open at a time; whether the form is open is `DetailsStore.formOpen`.
- Rule: `DetailsReviewStore` is the only caller of `approve()` for details. It approves only the CHANGED fields (compared by value), the same new values in both sheets, each row guarded by that sheet's own current values of those fields — except Stock qty: like the adjuster, only the master qty is guarded and Dr Trust's is overwritten (the review shows "will be set to").
- Rule: `DetailsStore` keeps only the user's edits; untouched fields always show current data, so a details save can never undo someone else's change.
- Rule: a new SKU is checked by `checkNewSku` (`core/sheets/sku-check.ts`) live in the form, and again by `SheetsWriter` on BOTH freshly read sheets whenever an approval changes SKU; any row outside the user's original approval (`ApprovedChange.owners`) holding it stops the write with nothing written.
- Rule (owner choice 2026-10-29): a master-only product may take the SKU of exactly one unmatched Dr Trust row, which links them; that save writes both rows in one approval. A linked product may not take any other row's SKU.
- Rule: every approved save (stock Apply, Undo, Retry, details Save changes) uses `ReviewFlow` (`core/sheets/review-flow.ts`) for saving, outcomes and Retry; a stock change starts at saving (no review step). Never fork its steps.

### Writes (cross-cutting)
- Rule: only `src/app/core/sheets/sheets-writer.ts` may issue a mutating HTTP request (PUT/POST/PATCH/DELETE). Enforced by `architecture.spec.ts` across every file that does HTTP.
- Rule: changes reach `SheetsWriter` only as an `ApprovedChange` from `approve()` (`core/sheets/approval.ts`), which only `core/stock-adjust/` and `core/details/` may call (enforced by `architecture.spec.ts`). Never construct, cast or fake an approval.
- Rule: a retry of a partial write uses ONLY `remaining` from the partial result (`ApprovedChange.remaining()`), never a new `approve()`, and never rewrites a sheet that is already confirmed.
- Rule: a write is retried automatically ONLY after 429 (Google saved nothing), and only after re-reading and re-checking the row. A 5xx or network failure on a write is never resent automatically and never reported as "not saved". At most 3 automatic retries per request.
- Rule: values are sent `RAW`; the typed-input option may not appear in source (enforced). Stock Status and Last Updated are filled in only by the writer — callers never pass them.
- Rule: a text field whose fresh cell holds a number is written back as a number when the new text is a plain number (no leading zeros or trailing decimal zeros); otherwise it stays text. gviz (V1) drops a column's minority-type values.
- Rule: the ONLY non-value change the app makes is the number format of the exact Last Updated cell it stamps (`LAST_UPDATED_FORMAT`, mask `userEnteredFormat.numberFormat`), one `repeatCell` per sheet, sent by `SheetsWriter` after every sheet is checked and before any value is written. No other formatting, and no other `spreadsheets:batchUpdate` request types.
- Rule: the writer re-reads the tab, finds the row by `id`, re-checks every reviewed value, and reports `written` only when Google echoes every cell it was sent.
- Allowlisted columns only: every product field EXCEPT `id` and `Created At`. Stock Status and Last Updated are written only by the app (derived / stamped), never typed by the user.
- Never write formulas (e.g. `=NOW()`), never clear ranges, never write whole-sheet or whole-row ranges — target exact cells only. Legacy rows whose Last Updated cell holds a formula get a static value only when that row is edited; no bulk conversion.
- Request only `spreadsheets` and `userinfo.profile` (first name only, D1). Do not add scopes (e.g. `email`, `openid`) without a logged decision. Sign-in must never depend on the profile scope, and the name lives in memory only.
- A write is shown as successful only after the API confirms it. No optimistic success. Errors (401, 403, 429, network) surface to the user with a retry path; they are never swallowed.
- After a write, display the value the API returned/re-read — never re-fetch through gviz (it can lag behind recent edits).

### Linked Sheets (master + Dr Trust)
- Rule: the app edits two spreadsheets — the master (all brands) and a separate Dr Trust spreadsheet. Both are described in environment config (`master`, `dr-trust`), each with a test and a production ID. Spreadsheet IDs appear nowhere else.
- Rule: only `core/config/app-config.ts` imports `@env/*`. Everything else (auth, sheets, UI) reads config through `AppConfig`. Enforced by `architecture.spec.ts`, along with: no 44-character spreadsheet ID outside `src/environments/`, the TEST and LIVE files share no ID, and the development file is `mode: 'test'`.
- Rule: rows are paired by normalised SKU (trimmed, case-insensitive). A product is "linked" only when its SKU appears exactly once in each sheet. Sheet-local `id` values are NEVER compared or matched across sheets and never leave `core/sheets/`.
- Rule: a linked product is always written to BOTH sheets in one approved action, by `SheetsWriter` only. Success is reported only when both writes are API-confirmed. A partial failure names the sheet that was updated and the one that was not, and offers a retry; it is never reported as success and never swallowed.
- Rule: a linked change is ONE `approve(masterRow, drTrustRow)`, Master first. The writer checks every row before writing any; a failure after an earlier sheet was written is `partial`, never success.
- Rule: writes use ABSOLUTE final values (re-read value ± approved delta), so retrying is idempotent. Before writing, both rows are re-read and checked (both sheet-local `id`s, and the master quantity the user reviewed); before a retry the failed row is re-read again.
- Rule: quantity mismatches between the sheets are ALWAYS overridden. A linked quantity adjustment is computed from the MASTER's current quantity and the resulting absolute quantity is written to BOTH sheets, replacing whatever the Dr Trust sheet held. There is no reconcile step and no blocking. The Dr Trust quantity is not part of the re-read guard (it is overwritten by design), but the user must see it: the Stock qty tile shows "Dr Trust sheet has N." before Apply, the saved strip says "Dr Trust had N.", and the details review shows "will be set to".
- Rule: a duplicate SKU in either sheet makes that product non-editable. Unmatched rows (orphans) are reported as warnings and never synced or guessed.
- Rule: pairing is computed only by `pairSheets` (pure). A blank SKU never pairs and never counts as a duplicate; rows of a blocked SKU are never reported as orphans.
- Rule: details edits write only the changed fields, to both sheets. Untouched fields that differ between the sheets are left alone.
- Rule: SKU is editable, including for linked products. A SKU change is part of the same dual write (both sheets, same approved action). The new SKU must be non-empty, have no spaces at either end and, normalised, must not match any other row's SKU in either sheet (except the single unmatched Dr Trust row a master-only product links to); otherwise the save is blocked. During a write and its retries the linked pair is held in memory by row refs and is never re-matched by SKU.
- Rule: changing a linked product requires Editor access to both spreadsheets; if one is inaccessible, block the change and name that sheet. A sheet the user can only view is caught by the format step, before any value is written.
- Rule: data health is display only. Its lists are computed only by `dataHealth` (`core/sheets/data-health.ts`) from the pairing; it never blocks, writes or re-pairs anything. Dr Trust products in Master are recognised only by the configured `brand` of the Dr Trust sheet, never a hard-coded brand.
- Forbidden: writing a linked product to only one sheet; pairing by `id`, row number, or product name; overwriting a differing Dr Trust quantity without showing it to the user; writing a SKU change to only one sheet; separate write code paths per sheet (one `SheetsWriter`, parameterised by sheet definition).

## Forbidden Shortcuts
- One-off "quick fixes" that bypass the data-access service or the model layer (Q-G2). Solve it in the right layer instead.
- A store setter that reads the signal it writes (`s.set(f(s()))`) when called from an effect: the effect subscribes to its own output and loops forever. Use `s.update(...)` or `untracked`.
- An effect that forwards input by calling a store method that READS signals: the effect subscribes to them and re-runs with stale input (it wiped submitted searches, US-59). Forward from the DOM event instead, or wrap the call in `untracked`.
- Manual `.subscribe()` in components to "just get the data" — use `async` pipe or `toSignal()`.
- Adding `if (specificValue)` special-cases to make one row/product behave differently — fix the model or mapping instead.
- Copy-pasting a component/service and tweaking it instead of extracting a shared piece (design deterioration — Q-G3).
- Reuse over duplication (Q-G3): when new UI shares the same element, behaviour, and a similar function as an existing component or class, REUSE that component/class rather than re-implementing or styling a one-off. If reuse needs a small variation, extend the shared piece with a modifier/input — don't fork it. Always propose the reuse before adding parallel code.
- Suppressing TypeScript or template errors instead of resolving them.
- Exposing the internal sheet column `id` anywhere outside `core/sheets/` (see Products). To treat a future column as internal, add its label to the internal-fields list in the mapping — nowhere else.
- Hardcoding hex colors, font families, or spacing values in component SCSS — use the design tokens (`var(--token)`) / `.stoqr-*` classes from `src/styles/stoqr-theme.scss`.
- `max-width` media queries. Styling is mobile-first: base = mobile, overrides via `min-width` only (768/1024/1440) using the `from()` mixin in `src/styles/_breakpoints.scss`.
- Filter/search STATE or logic in components. State lives in services; matching and filtering are pure functions.
- Matching and query validation are imported only inside `core/search/` (spec files may import message constants); features never filter products themselves. Editability is decided only by `editability()` in `core/sheets/` (enforced by `architecture.spec.ts` for the search imports).
- Developing or testing writes against the production sheet. Use a duplicate sheet (separate spreadsheet ID per environment).

## Self-Enforcing Contract
After any core domain change, Claude must:
1. Update @docs/DECISIONS.md with any trade-off made
2. Update @docs/projectmap.md if domain ownership changed
3. Confirm rule-level tests pass, e.g.:
   - no code path writes without an explicit user tap and `approve()`
   - no write payload contains the `id`, `Created At`, or a formula
   - `proposeQuantity` never returns a negative or non-integer value
   - every quantity write also carries `deriveStockStatus(qty, threshold)` for that same quantity
   - a linked-product write issues exactly one write per sheet, and reports success only when both succeed
   - a product with a duplicate SKU cannot be adjusted or edited
   - a linked quantity write sets the approved absolute quantity in both sheets even when their quantities differed beforehand
   - a SKU change is rejected when the new SKU (normalised) exists on another row in either sheet, and is otherwise written to both sheets in the same action
   - the only HTTP method that mutates the sheet is issued from `SheetsWriter`
4. Confirm no forbidden patterns above were introduced
