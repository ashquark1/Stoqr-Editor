# AI_CONTRACT.md — Stoqr Editor (V2)
# If a forbidden pattern isn't written here, Claude is allowed to use it.

## Non-Negotiable Rules
- The Google Sheet is edited ONLY through the single write service (`SheetsWriter`, `src/app/core/sheets/`), ONLY after the user has explicitly approved the change in the review step, and ONLY to allowlisted columns. If a task seems to require a write outside this path, stop and ask.
- All Google access (Sheets API reads/writes, Google sign-in) goes through `src/app/core/sheets/` and `src/app/core/auth/`. Components and templates never call `HttpClient`, `gapi`, or Google Identity Services directly.
- No business/derivation logic in components or templates. Row→model mapping, quantity maths, validation, search and diffing live in services or pure functions. Components render and call setters.
- State is exposed as Angular signals from services. No NgRx, Akita, or ad-hoc global mutable singletons.
- No `any`, no `@ts-ignore`, no `@ts-nocheck`. Strict mode stays on. Fix the type, don't silence it.
- Standalone components only. No NgModules. Components use `ChangeDetectionStrategy.OnPush`.
- No external validation, UI, or CSS framework added without an explicit decision logged in DECISIONS.md (Q-G2: use proper framework guidelines, not one-off dependencies). The approved component library is PrimeNG (styled mode, `StoqrPreset`); the design system is first-party Stoqr SCSS.
- Features must consume the `shared/ui` wrappers, never PrimeNG `p-*` components directly. Vendor coupling lives only inside `src/app/shared/ui/`.
- No secrets in the repo or in browser storage. The OAuth client ID is public by design but is off-limits config; access tokens live in memory only (never `localStorage`/`sessionStorage`). No API keys, service-account keys, or client secrets — ever.

## Domain Rules

### Products
- Owner: `core/sheets/` (mapping, field map) + the `Product` model (`src/app/core/models/`).
- Rule: the Google Sheet is the single source of truth. Columns are mapped by header LABEL, never by position. Edits are field-level and go through the allowlist.
- Rule: the internal `id` column NEVER appears on the `Product` model, in a form control, template, or any feature-visible signal. It exists only inside `core/sheets/` and travels to features as an opaque `RowRef` that features pass back unchanged. It is never displayed and never editable.
- Rule: rows are located by `id` on every write — never by a remembered row number.
- Forbidden: hardcoding products in components; transforming fields inline in templates; adding or deleting rows (V2 edits existing rows only).

### Stock & Inventory Levels
- Owner: `core/stock-adjust/` (pure functions) + the Sheets write service.
- Rule: quantity is a whole number ≥ 0. The adjustment amount is a positive whole number. The proposed final quantity = current ± amount, computed by ONE pure function (`proposeQuantity`), shown live, and never computed in a component.
- Rule: a subtraction that would go below 0 is BLOCKED with a clear message — it is never silently clamped.
- Rule: quantity changes happen only through the quantity adjuster → review → approve flow. The details form shows Stock Qty read-only.
- Rule: before writing, re-read the target row, confirm the `id` still matches and the quantity still equals what the user reviewed. If not, abort the write and show the fresh value. No silent overwrite.
- Rule: every approved change also stamps Last Updated with a static timestamp (never a formula).
- Forbidden: writing quantity without approval; writing a value computed from anything but the freshly re-read sheet value + the approved delta.

### Writes (cross-cutting)
- Allowlisted columns only: every product field EXCEPT `id`, `Created At`, and any formula column. Last Updated is written by the app, never typed by the user.
- Never write formulas (e.g. `=NOW()`), never clear ranges, never write whole-sheet or whole-row ranges — target exact cells only.
- A write is shown as successful only after the API confirms it. No optimistic success. Errors (401, 403, 429, network) surface to the user with a retry path; they are never swallowed.
- After a write, display the value the API returned/re-read — never re-fetch through gviz (it can lag behind recent edits).

## Forbidden Shortcuts
- One-off "quick fixes" that bypass the data-access service or the model layer (Q-G2). Solve it in the right layer instead.
- Manual `.subscribe()` in components to "just get the data" — use `async` pipe or `toSignal()`.
- Adding `if (specificValue)` special-cases to make one row/product behave differently — fix the model or mapping instead.
- Copy-pasting a component/service and tweaking it instead of extracting a shared piece (design deterioration — Q-G3).
- Reuse over duplication (Q-G3): when new UI shares the same element, behaviour, and a similar function as an existing component or class, REUSE that component/class rather than re-implementing or styling a one-off. If reuse needs a small variation, extend the shared piece with a modifier/input — don't fork it. Always propose the reuse before adding parallel code.
- Suppressing TypeScript or template errors instead of resolving them.
- Exposing the internal sheet column `id` anywhere outside `core/sheets/` (see Products). To treat a future column as internal, add its label to the internal-fields list in the mapping — nowhere else.
- Hardcoding hex colors, font families, or spacing values in component SCSS — use the design tokens (`var(--token)`) / `.stoqr-*` classes from `src/styles/stoqr-theme.scss`.
- `max-width` media queries. Styling is mobile-first: base = mobile, overrides via `min-width` only (768/1024/1440) using the `from()` mixin in `src/styles/_breakpoints.scss`.
- Filter/search STATE or logic in components. State lives in services; matching and filtering are pure functions.
- Developing or testing writes against the production sheet. Use a duplicate sheet (separate spreadsheet ID per environment).

## Self-Enforcing Contract
After any core domain change, Claude must:
1. Update @docs/DECISIONS.md with any trade-off made
2. Update @docs/projectmap.md if domain ownership changed
3. Confirm rule-level tests pass, e.g.:
   - no code path writes without an approval step
   - no write payload contains the `id`, `Created At`, or a formula
   - `proposeQuantity` never returns a negative or non-integer value
   - the only HTTP method that mutates the sheet is issued from `SheetsWriter`
4. Confirm no forbidden patterns above were introduced
