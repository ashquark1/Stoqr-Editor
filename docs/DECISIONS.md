# DECISIONS.md — Stoqr Editor (V2)
# Log of non-obvious design choices. Add an entry whenever a trade-off is made.
# Format: ## [DATE]: [Decision title]
# Status tags: [confirmed] = agreed with the owner; [proposed] = recommended default, awaiting confirmation.

## 2026-10-21: V2 is a separate repo; V1 stays untouched and read-only [confirmed]

- Decision: the editor is a new app in its own repo (`Editor V1` folder). V1 is not modified and keeps its read-only contract.
- Reason: V1's AI contract forbids any write path; mixing writes into it would break its rules and risk the working search app.
- Note: V1's git repo root is its `frontend/` folder; V2 mirrors that layout.

## 2026-10-21: Stack carried over from V1; design system copied, not linked [confirmed]

- Decision: Angular 21 (standalone, signals, OnPush), strict TypeScript, `HttpClient`, Reactive Forms, SCSS, Vitest, PrimeNG (styled mode, `StoqrPreset`) behind `shared/ui` wrappers. The Stoqr design system (`stoqr-theme.scss`, `brand-tokens.ts`, `primeng-preset.ts`, `_primeng-overrides.scss`, `_breakpoints.scss`, logo) is copied from V1 so the look matches.
- Reason: same aesthetic and conventions with no new dependencies to learn.
- Risk: the two copies will drift. Revisit by extracting a shared design-system package once both apps are stable.

## 2026-10-21: Frontend-only; Google sign-in + Sheets API v4 from the browser [confirmed]

- Decision: no backend. Staff sign in with Google (Identity Services token flow); the app calls the Sheets API directly with the user's access token. The sheet's own sharing (Editor access) is the access control.
- Reason: owner wants a frontend-only app used by the owner plus staff. A browser cannot write to Sheets with gviz or an API key; per-user OAuth is the only keyless way, and it gives real per-user identity.
- Rejected: backend + service account (needs hosting); Apps Script web app (public endpoint, weak auth); making the sheet publicly editable (never).
- Consequences: every user needs a Google account with Editor access to the sheet; while the OAuth app is in "Testing" mode, users must be on the test-user list (max 100); access tokens last about an hour, so a re-sign-in prompt is expected; tokens are kept in memory only.
- Risk: no server-side enforcement — anyone with sheet Editor rights could edit the sheet directly anyway, so this is not a new exposure.
- One-time setup (owner): Google Cloud project, Sheets API enabled, OAuth client ID, allowed origins (localhost:4200 + the hosted site).

## 2026-10-21: Cost and quotas [confirmed, verify before launch]

- Fact (Google Sheets API usage-limits page, checked 2026-10-21): standard use is free; quotas are 300 reads and 300 writes per project per minute, and 60 of each per user per minute; exceeding returns HTTP 429. The same page says charges for exceeding quota are planned to start later in 2026 — re-check before launch.
- Decision: stay far below quota — load the sheet once per session, re-read only the single target row at approval time, retry 429s with exponential backoff.
- Update 2026-10-28 (US-10): each write re-reads the WHOLE tab of its sheet (one extra read per sheet per write), because the row must be found by `id` and the headers re-checked; still far below the quotas.
- Update 2026-10-29 (US-11): retries for 429/5xx/network are built (see "Busy or unreachable Google"). Each retry costs a request, at most 3 per request.

## 2026-10-21: Read via Sheets API, not gviz [confirmed]

- Decision: V2 reads through the authenticated Sheets API. gviz is not used.
- Reason: gviz can lag behind recent edits, which would show a stale quantity right after a save; the API returns fresh data and also works if the sheet is made private.
- Note: V1 keeps reading via the public gviz link, so making the sheet private would break V1.

## 2026-10-21: Rows are located by `id`; `id` is an opaque `RowRef` [confirmed]

- Decision: the sheet's `id` column (confirmed unique for every row) is used to locate the row on every load and write. It lives only inside `core/sheets/` and reaches features as an opaque `RowRef`; it is never on `Product`, never in a form, never displayed, never editable.
- Reason: row numbers shift when rows are sorted or inserted; `id` is stable. Keeping it opaque honours V1's rule that `id` never reaches UI code while still letting V2 write to the right row.
- Decision: columns are mapped by header label (as in V1), so reordering columns does not corrupt writes.

## 2026-10-21: Quantity rules — whole numbers, never below zero [confirmed], cap [confirmed 2026-10-28]

- Decision [confirmed]: whole numbers only (no decimals). The amount is a positive whole number. Subtracting past zero is blocked with a message, not silently clamped.
- Decision [confirmed 2026-10-28]: a sanity cap of 1,000,000 on the amount or resulting quantity to catch typos such as an extra zero.
- Decision [confirmed 2026-10-28; shown live in the adjuster, and again in review]: show a low-stock warning in the review step when the proposed quantity is below `Low Stock Threshold` (strictly; equal is still In Stock). It uses the same `deriveStockStatus` rule that is written to the sheet (see the 2026-10-27 Stock Status entry), so the preview and the stored value cannot disagree.

## 2026-10-21: Approval flow with a re-read guard [confirmed]

- Decision: quantity changes require an explicit review step ("120 → −15 → 105") and Approve. On Approve the app re-reads the row, verifies the `id` and that the quantity still equals what the user reviewed, then writes. If anything differs it aborts and shows the fresh value.
- Reason: the browser cannot do an atomic compare-and-set; this narrows the race window to milliseconds, which is acceptable for a small team.
- Rejected: writing the computed absolute value blindly; optimistic UI before API confirmation.

## 2026-10-27: Last Updated is stamped as a static value; old rows left alone [confirmed]

- Finding: the sheet's Last Updated column is `=NOW()`, which recalculates continuously, so for those rows it shows the current time rather than when a product changed.
- Decision: the app stamps a real, static timestamp on every approved quantity change and details edit, displayed as `dd/MM/yyyy HH:mm:ss` (e.g. `27/10/2026 14:26:03`). Existing rows are NOT bulk-converted or touched; a row's Last Updated cell is replaced with a static value only when that row is edited through the app. V1 keeps working (it only displays the text).
- Consequence: until a row is edited, its Last Updated keeps behaving as before (a `=NOW()` row keeps showing the current time). This is the owner's choice; revisit if it causes confusion.
- Decision [confirmed 2026-10-28 — sent RAW, see SheetsWriter; the `USER_ENTERED` part is superseded]: write the timestamp as a date-time serial number (days since 1899-12-30, from the user's local wall-clock time) with `USER_ENTERED`, so it is a real date in the sheet. Writing the text `27/10/2026 …` instead would be misread under a US-locale spreadsheet or stored as plain text. Superseded 2026-10-29: the column had NO date format (it showed `46324.53178`); the writer now sets the cell's format itself — see "Last Updated cell format".
- Assumption: all staff work in the same time zone (IST).

## 2026-10-27: Stock Status is typed text, so the app derives and writes it [confirmed]

- Finding: Stock Status is plain typed text in the sheet, not a formula. After a quantity change it would go stale unless the app updates it.
- Decision [confirmed]: the app writes Stock Status together with the new quantity in the same request, and again whenever a details edit changes Stock Qty's inputs (Low Stock Threshold). Widened 2026-10-29 (US-24): written on EVERY save, per sheet — see "Details saved to both sheets".
- Decision [confirmed]: ONE pure function, `deriveStockStatus(qty, lowStockThreshold)`, in `core/stock-adjust/`, using the sheet's exact label texts (confirmed by the owner):
  - qty = 0 → `Out of Stock`
  - 0 < qty < threshold → `Low Stock`
  - qty ≥ threshold → `In Stock` (a quantity EQUAL to the threshold is In Stock)
  - threshold is empty → `In Stock` when qty > 0 (no low-stock band)
- Decision [confirmed 2026-10-29]: in the details form Stock Status is read-only (derived); users do not type it. The review step previews the new status and the low-stock warning from the same function.
- Note: this deliberately supersedes V1's rule that stock status is "read verbatim, never derived". That rule belongs to V1's read-only contract; V2 owns the write, so it must own the derivation.

## 2026-10-21: Quantity is edited only via the adjuster [confirmed 2026-10-29]

- Decision: the details form shows Stock Qty read-only; all quantity changes go through adjuster → review → approve. Created At is read-only; Last Updated is app-stamped; Stock Status is app-derived; `id` is excluded.
- Reason: one reviewed path for quantity prevents unreviewed changes.

## 2026-10-27: Stock Log tab deferred [confirmed]

- Decision: no audit log in this version. It may be wanted later (idea: append timestamp, user, `id`, old qty, new qty, delta, optional reason to a separate "Stock Log" tab).
- Consequence: only the `spreadsheets` scope is requested now; no `email` scope. Add the scope and a spec when the log is picked up.

## 2026-10-27: Staff access [confirmed]

- Fact: all staff have Google accounts, so they can be given Editor access to the sheet (and added as OAuth test users while the app is in Testing mode).

## 2026-10-27: Test sheets are required; IDs supplied so far are PRODUCTION [confirmed]

- RESOLVED 2026-10-27: test copies of both sheets received (IDs differ from production) and shared as Editor with the owner and staff. The remaining rule is unchanged: development and tests use TEST IDs only.
- Fact (2026-10-27): the master and Dr Trust spreadsheet IDs the owner supplied are both PRODUCTION sheets (the master is the one V1 reads). Test copies of both are still needed; the owner earlier mentioned a duplicate master copy, but its ID has not been supplied, and no Dr Trust test copy is confirmed.
- Rule: development, tests and any write testing use TEST copies only (IDs in `src/environments/environment.development.ts`). Production IDs go only in `src/environments/environment.ts`, which is used by an explicit production build.
- Consequence: no write feature is built or run until both test copies exist and their IDs are in the development config. Read-only work (scaffold, sign-in, loading, pairing) may start earlier, using placeholders for the development IDs.
- Note: the Google OAuth Client ID is public by design and is not affected; one Client ID serves all four spreadsheets.

## 2026-10-27: Two linked spreadsheets — master + Dr Trust, synced by SKU [scope confirmed, mechanics proposed]

- Requirement [confirmed]: the owner edits two spreadsheets — the master (all brands) and a separate spreadsheet FILE holding only Dr Trust products. Dr Trust products exist in both and are also edited directly in each. Stock changes AND all detail edits made in the app must be applied to both. Rows are matched by SKU (the sheet-local `id` values differ between the files).
- Decision [confirmed]: the app loads both spreadsheets, each with its own spreadsheet ID and tab, from environment config as a list of sheet definitions (`master`, `dr-trust`), with separate test and production IDs.
- Constraint: Google cannot write to two spreadsheets atomically. A linked write is two requests; the app reports success only when BOTH are confirmed.
- Decision [confirmed 2026-10-28 — see SKU pairing rules] — pairing: SKU is normalised (trimmed, case-insensitive). A product is "linked" when its SKU appears exactly once in each sheet. Master-only products (other brands) are edited in master only. The picker is driven by the master sheet.
- Decision [confirmed 2026-10-29, data-health view built in US-31] — data health: a duplicate SKU in either sheet blocks that product (not editable) with a message. Dr Trust rows with no master match, and master Dr Trust products missing from the Dr Trust sheet, are shown as warnings and are not synced.
- Decision [confirmed 2026-10-27] — quantity mismatches are ALWAYS overridden: if a linked product's stock qty differs between the sheets, there is no reconcile step and nothing is blocked. The approved final quantity is written to BOTH sheets, replacing whatever the Dr Trust sheet held.
- Decision [confirmed 2026-10-28 for the adjuster; the review note lands in Sprint 3 story B] — base quantity: the adjuster's "current qty" and the add/subtract maths use the MASTER's quantity (the picker is driven by master). When the Dr Trust quantity differs, the review step shows a non-blocking note ("Dr Trust currently has X; it will be set to Y") so the overwrite is never invisible.
- Decision [confirmed 2026-10-28, owner choice "check both first"; built in Sprint 3 story B] — write sequence: re-read BOTH rows, verify each sheet-local `id` still matches, and verify the master quantity (the base the user reviewed) is unchanged; compute final ABSOLUTE values; write master then Dr Trust. The Dr Trust quantity is not guarded — it is overwritten by design. Absolute values make retries idempotent.
- Decision [confirmed 2026-10-29: reporting in story B, Retry in story C (US-34)] — partial failure: if one write fails, show which sheet was updated and which was not, and offer Retry. Retry re-reads the failed row, re-verifies its `id` (and, for a master retry, the base quantity), then rewrites the same absolute values. The linked pair is held in memory by row refs, so retry does not depend on SKUs matching. If the user abandons it, the next load flags the product as out of sync. Owner choice (2026-10-29): Retry is offered only while the review panel is open; Close leaves the product out of sync, and its next quantity change sets both sheets.
- Decision [confirmed 2026-10-29, built in US-24/36] — details edits: only CHANGED fields are written, to both sheets. Fields that already differ but were not edited are left alone. Last Updated is stamped on both; Stock Status is derived per sheet from the final qty and that sheet's own threshold.
- Decision [confirmed 2026-10-27] — SKU is editable, including for linked products. A SKU change is written to BOTH sheets in the same approved action, so the pair stays linked.
- Decision [confirmed 2026-10-29, built in US-38; see "SKU change"] — SKU safeguards: the new SKU must be non-empty and, normalised (trimmed, case-insensitive), must not match any OTHER row in either sheet — otherwise the save is blocked with a message. The review diff shows "old → new" and that it applies to both sheets. If a SKU change fails on only one sheet, the two sheets briefly hold different SKUs and the product would no longer pair on a reload; Retry (pair held in memory) completes it, and the data-health view lists it if abandoned.
- Decision [confirmed 2026-10-28] — access: a user needs Editor access to BOTH spreadsheets to change a linked product. If a sheet is not accessible the app names it and blocks the change. Master-only products need master access only.
- Decision [proposed] — both sheets must have the required headers (matched by label per sheet); a missing or renamed header in either blocks loading and names the sheet and column.
- Cost: linked writes roughly double API calls; still far below the quotas.
- Testing: needs a duplicate of the Dr Trust sheet as well as the master test copy.

## 2026-10-28: Scaffold mirrors V1 by hand; lockfile seeded from V1 [confirmed]

- Decision: the project config (`package.json`, `tsconfig*.json`, `angular.json`, `.prettierrc`, `.editorconfig`) is copied from V1 and renamed `stoqr-editor`, instead of running `ng new`. `package-lock.json` is seeded from V1's so both apps resolve identical versions. New components default to OnPush in the schematics.
- Reason: V1 is a proven Angular 21 + Vitest setup; no starter files to delete; no risk to `.git` or `.gitignore` in a non-empty repo.

## 2026-10-28: Fonts load from Google Fonts at runtime [confirmed]

- Finding: `stoqr-theme.scss` (copied from V1) loads Lora, DM Sans and DM Mono via `@import url(fonts.googleapis.com…)`. All three verified loading on 2026-10-28.
- Consequence: needs internet (otherwise falls back to Georgia / system-ui), and Google sees page loads. Same as V1. Revisit if self-hosting the fonts is wanted.

## 2026-10-28: PrimeNG is registered through `provideStoqrUi()` in shared/ui [confirmed]

- Decision: `src/app/shared/ui/provide-stoqr-ui.ts` wraps `providePrimeNG` with `StoqrPreset` and the CSS layer. `app.config.ts` calls it rather than importing `primeng/config` (which V1 does).
- Reason: keeps every PrimeNG import inside `shared/ui`, so the US-03 rule test needs no exceptions.

## 2026-10-28: Architecture rules are tests that read the source tree; `@types/node` added [confirmed]

- Decision: `src/app/architecture.spec.ts` reads `src/` with `node:fs` and asserts 10 contract rules: PrimeNG/PrimeUIX imports and `<p-` tags only in `shared/ui`; no `@media (max-width…)`; no hex in `src/app` SCSS; no `@ts-ignore`/`@ts-nocheck`; no `any`; no `.subscribe(` in components; `HttpClient` imported only under `core/sheets` or `core/auth`; every component OnPush; no NgModules. Code rules ignore comments. Each rule was checked against a planted violation.
- Decision: `@types/node` (^22, dev only, types only) is added and enabled only in `tsconfig.spec.json`; the app typecheck still rejects Node APIs (verified).
- Rejected: hand-written Node types (maintenance); a separate Node script (would change the `npm test` contract).
- Note: the `max-width` rule targets media queries only. The `max-width` CSS property is allowed (e.g. the 1440px page bound in the brand spec).

## 2026-10-28: Wrappers are copied from V1 when first used [confirmed]

- Decision: the Sprint 1 scaffold copies `logo`, `loading-overlay`, `empty-state` and `toast`. `badge` and `status-badge` move to US-08: in V1 they import V1 core helpers (`@core/stock-status`, and `@core/product-status` with its `Product` model and filter logic), which should not enter V2 before its own domain exists.

## 2026-10-28: Environment config — typed files, one reader, checked at startup [confirmed]

- Decision: `src/environments/environment.development.ts` (TEST) and `environment.ts` (LIVE) hold values only; types live in `core/config/app-environment.ts`. `AppConfig` (`core/config/app-config.ts`) is the only file that imports `@env/*` and exposes read-only signals (`mode`, `isLive`, `clientId`, `sheets`, `sheet(key)`).
- Decision: `validateEnvironment` runs at startup and throws a message listing every problem: wrong sheet count, duplicate or missing `master`/`dr-trust`, blank ID/tab/label/Client ID, and `production` disagreeing with `mode` (added beyond the spec as a guard against half-edited files).
- Decision: the `ng test` target is pinned to `stoqr-editor:build:development`. Angular already defaults to it; pinning stops a future default change from silently running tests against LIVE. Proved by `app-config.spec.ts` (`mode() === 'test'`).
- Verified 2026-10-28: the production bundle contains the LIVE master ID and not the TEST one.

## 2026-10-28: Footer mode badge reuses `.stoqr-badge` [confirmed]

- Decision: TEST = `stoqr-badge--unknown` (grey), LIVE = `stoqr-badge--low-stock` (amber), per Q-G3 reuse.
- Trade-off: the classes are named for stock status, so the LIVE colour follows the Low Stock colour if the theme changes it.
- Consequence: on the deployed app every staff member always sees an amber LIVE pill. Confirm at US-27.

## 2026-10-28: Tab ranges are fully percent-encoded [confirmed]

- Decision: `tabRange(tab)` (`core/sheets/a1-range.ts`) single-quotes the tab, doubles inner apostrophes, and percent-encodes everything including `'` (which `encodeURIComponent` leaves alone), e.g. `Ash's Stock` → `%27Ash%27%27s%20Stock%27`.

## 2026-10-28: Claude deny rule for environment files [confirmed]

- Decision: `.claude/settings.json` denies `Edit(/src/environments/**)` and `Edit(src/environments/**)`. An `Edit` rule covers every file-writing tool (a `Write(...)` rule is not matched). Verified: an edit attempt was refused.
- Consequence: changing an ID or the Client ID needs the owner (edit by hand, or lift the rule for that change).

## 2026-10-28: Google sign-in — GIS token flow, token in memory only [confirmed]

- Decision: only `core/auth/` touches GIS. Local types (`gis-types.ts`), no types package. The script is injected by `GIS_LOADER` (an InjectionToken, faked in tests).
- Decision: the script loads at startup in the background (not awaited), so `requestAccessToken()` runs inside the user's click and the popup is not blocked; the button stays disabled until it loads. Offline, the app still renders and offers Retry.
- Decision: scope is `spreadsheets` only (`SHEETS_SCOPE`). Superseded 2026-10-28 by D1: `userinfo.profile` added for the first name.
- Decision: the token is a private field read only by `core/sheets` via `accessToken()`; `expiresAt` = now + `expires_in` − 60 s. `markExpired()` (for 401s) clears it with "Your session expired. Please sign in again." Superseded 2026-10-28 by US-06: expiry keeps the session and asks the user to Continue; `core/sheets` uses `freshToken()`.
- Finding (verified 2026-10-28): GIS enables granular consent, so users can untick the Sheets permission; `hasGrantedAllScopes` treats that as denied.

## 2026-10-28: Auth redirects live in one place [confirmed]

- Decision: `provideAuthRedirects()` (an app initializer) starts the GIS load and follows `Auth.status`: signed out on a protected page → `/sign-in`; signed in on `/sign-in` → home. Route guards cover URLs typed directly. Components never navigate on auth state.

## 2026-10-28: Sign-in errors use `<stoqr-toast>`; second feature folder [confirmed]

- Decision: errors show in the existing toast (title "Couldn't sign in", Retry → `Auth.retry()`, 8 s auto-dismiss). Trade-off: the message disappears on its own; the button stays usable.
- Decision: the sign-in screen is its own feature, `src/app/features/sign-in/` (owner choice), so V2 has two feature folders.

## 2026-10-28: Loading both sheets — Sheets API values.get, all-or-nothing [confirmed]

- Decision: `GET …/values/{tabRange(tab)}` with `majorDimension=ROWS`, `valueRenderOption=UNFORMATTED_VALUE`, `dateTimeRenderOption=FORMATTED_STRING`. The reader skips the call (and marks the session expired) when there is no token or `expiresAt` has passed.
- Decision: both sheets load in parallel, once per session (`SheetsStore.ensureLoaded`); data is set only when both load and map. Any failure shows no data and a message naming the sheet, with Retry. The store clears on sign-out; a load finishing after sign-out is discarded.
- Decision: errors — 401 → back to sign-in; 403 → no access to <sheet>; 400 "Unable to parse range" → tab not found; 404 → spreadsheet not found; 429/5xx/network → generic. Automatic retry with backoff since US-11 (2026-10-29).
- Decision: an empty tab (no values) counts as missing every column; a header-only tab is zero products.
- Decision: the load-check page shows errors in a persistent panel (empty-state + Retry), not the toast, which auto-dismisses.
- Deferred (owner choice): the Phase 0 raw-value check moved to after sign-in; the page shows MRP, tax rate and last updated for it. Done 2026-10-28: the owner confirmed the values on the TEST sheets match the mapping's assumptions; no change needed.

## 2026-10-28: Row issues and the opaque RowRef [confirmed]

- Decision: a row with a blank `id` (`missing-id`), an `id` repeated in its sheet (`duplicate-id`), or a stock qty that is not a whole number ≥ 0 — blank included (`invalid-quantity`, owner-approved) — is loaded and shown but not editable. Other number fields that are blank or non-numeric load as `null` with no flag (V1 rule). Only required headers are checked for duplicates; unknown extra columns are ignored.
- Decision: `RowRef` carries only the sheet key; the sheet-local `id` is held in a module `WeakMap`, so it never appears on the object or in its JSON. `createRowRef` / `rowRefId` / `new RowRef` are for `core/sheets` only (architecture rule).
- Decision: `FIELD_LABELS` is a typed `Record<keyof Product, label>` (replaces V1's field list), so a new `Product` field without a label fails to compile.
- Decision: V1's badge helpers were copied without filter code: `core/stock-adjust/stock-status-display.ts` and `core/models/product-status.ts`; `shared/util/display-value.ts` copied as is.

## 2026-10-28: SKU pairing rules [confirmed]

- Decision: one pure function, `pairSheets(master, drTrust)` in `core/sheets/sheet-pairing.ts`; inputs never mutated, input order kept, refs carried through untouched. Never compares `id`, `RowRef`, row number or name (rule test: different ids → same pairing).
- Decision: the normaliser is trim + lowercase only — no punctuation, inner-space or leading-zero rewriting. So `123` and `00123` do not pair; US-31 will surface such rows.
- Decision: a SKU appearing more than once in EITHER sheet is blocked, and every row carrying it in both sheets is blocked; blocked rows are never orphans.
- Decision: a blank SKU never pairs and never counts as a duplicate: master → master-only (`hasSku` false, for a "no SKU" note), Dr Trust → unmatched.
- Decision: pairing keeps loader issues; a linked pair does not make a flagged row editable. Later, "editable" = no issues AND not blocked.
- Decision: `SheetsStore` exposes `pairing` and `pairingCounts` as computed signals; the load-check page shows "Blocked N SKUs (M rows)" (owner choice) so totals reconcile.

## 2026-10-28: D1 resolved — first name in the topbar via the profile scope [confirmed]

- Decision (owner): show the signed-in person's first name. The app requests `spreadsheets` + `userinfo.profile` only — no `email`, no `openid`. Only the Sheets scope must be granted; without the profile the topbar shows "Signed in".
- Decision: the name comes from `GET https://www.googleapis.com/oauth2/v3/userinfo` (`given_name`, else the first word of `name`), read by `core/auth/user-profile.ts`, held in memory only, cleared on sign-out/expiry; a failed or late lookup is ignored.
- Consequence: the consent screen gains a "personal info" line, and every user approves again on next sign-in. Owner adds the scope to the OAuth consent screen in Google Cloud.

## 2026-10-28: Sign-out revokes the token; every failing sheet is named [confirmed]

- Decision: `Auth.signOut()` revokes the token with Google (not awaited) and always signs out locally. Trade-off: the next sign-in shows the consent screen again; chosen for shared shop computers.
- Decision: `SheetsStore` waits for both reads (`Promise.allSettled`); `combineLoadErrors` names every sheet refusing access in one message, else lists each sheet's message; `noAccess` adds Sign out next to Retry. Both sheets are mapped before either is set (all-or-nothing holds).

## 2026-10-28: Product picker — V1 matcher, master only, every status [confirmed]

- Decision: V1's search rules are copied UNCHANGED into `core/search/` (`search-fields.ts`, `product-matcher.ts`, `search-validation.ts` + specs): case-insensitive, every typed word must match; core fields name, brand, SKU and category; size/colour/packing count only alongside a core match, otherwise "Please include a product name or brand in your search." Kept identical so drift from V1 is easy to compare.
- Decision: the picker lists MASTER products only (Dr Trust rows are never pickable) of EVERY status (owner choice), in sheet order; at most 20 are shown with the total ("keep typing to narrow"). [Superseded 2026-10-31 by US-55: every match is listed (no cap; 122 products on TEST, a 108-match list renders in about 23 ms); no-match text is V1's "No products match your search."; the count moves to the toolbar in US-69.]
- Decision: all search and selection state lives in `ProductSearchStore` (query, selected `RowRef`, matches, selected product, its linked Dr Trust row, the quantity-differs note, editability). The query is a Reactive Forms `FormControl` forwarded via `toSignal` + `effect`.
- Decision: ONE rule decides whether a product may be adjusted or edited: `editability(loaded, syncStatus)` in `core/sheets/editability.ts` — no row issues AND not blocked; it returns the reasons shown in the summary.
- Decision: the temporary load-check view is removed; its counts return with data health (US-31).
- Consequence: each load creates fresh row refs, so any Retry/reload clears the selection (cautious: never points at stale data).

## 2026-10-28: Sync badge — "out of sync" means stock qty differs [confirmed]

- Decision (owner): a LINKED product is "Out of sync" when its stock qty differs between the sheets. Other differing fields do not count (Dr Trust is also edited by hand; details edits write only changed fields).
- Decision: display only. `syncBadges()` (`core/sheets/sync-badge.ts`) is built on `syncStatuses()`; pairing and `editability()` are unchanged, and an out-of-sync product stays editable. `linkedQtyDiffers()` is the single "quantities differ" rule, shared with the summary's Dr Trust qty note.
- Decision: a blank/invalid qty (`null`) counts as a value: null vs null is in sync; null vs a number is out of sync.
- Decision: `<stoqr-sync-badge>` reuses the outlined `.stoqr-status-badge` pill with component-scoped token colours (theme not edited). Blocked is filled so it never looks like the outlined Discontinued pill; Out of sync uses crimson text (amber text fails contrast). The text label carries the meaning.

## 2026-10-28: Session renewal — expiry keeps the work (US-06) [confirmed]

- Decision: expiry is no longer sign-out. New Auth statuses `expired` (token gone, work kept) and `renewing`; expiry (session clock, `expiresAt` passed, or HTTP 401) forgets ONLY the token. Data, search, selection and the first name stay; there is no redirect. Only Sign out or a page reload returns to sign-in.
- Decision: a session clock (reset on every token): 5 minutes before `expiresAt` a warning offers Stay signed in (owner choice); at `expiresAt` a non-dismissable "Session expired" dialog offers Continue or Sign out. Renewal needs one click (browsers only allow Google's popup from a click) and uses `prompt: ''`.
- Decision: `Auth.freshToken()` is the only way `core/sheets` gets a token: immediate when valid; otherwise it waits for the renewal and resolves with the new token; it rejects on sign-out. `SheetsReader` retries a 401 once after renewal, so an interrupted load finishes after Continue; a load interrupted beyond that offers Retry.
- Decision: `Auth.sessionId` changes only on a sign-in from signed out, on sign-out, and when renewal brings a DIFFERENT account (Google's `sub` from userinfo; fallback: first name, weaker). Stores reset on it; `SheetsStore` reloads for the new account. One person's work never carries into another's session.
- Decision: wrappers extended, not forked: `<stoqr-toast>` gains `variant` (`error`/`warning`), `actionLabel`, and `autoDismissMs = 0` meaning never; `<stoqr-modal>` (copied from V1) gains `dismissable` (default `true`). The prompts live in `features/session/` and are `@defer`red until someone has a session, keeping the first load under the 500 kB budget (the dialog library is a ~126 kB lazy chunk).
- Note: found while building — a 401 can land while a warning-started renewal is open, so "renewal in progress" is tracked with a flag, not inferred from the status.

## 2026-10-28: SheetsWriter — one guarded path for every change (US-10) [confirmed]

- Decision: `SheetsWriter.write(sheet, approved)` (`core/sheets/sheets-writer.ts`) is the only code that changes a spreadsheet. One row in one sheet per call, parameterised by the sheet definition; linked (both-sheet) writes are US-33 and call it once per sheet. Superseded 2026-10-28 by story B: see "Review & approve".
- Decision: approval cannot be faked. The writer accepts only an `ApprovedChange`, which only `approve()` (`core/sheets/approval.ts`) can create, using a module-private key; `isGenuine()` rejects lookalikes. `approve()` refuses empty changes, `id`/`createdAt`/`stockStatus`/`lastUpdated`, and a qty that is not a whole number ≥ 0. Only the review steps (`core/stock-adjust/`, `core/details/`) may call it (architecture rule).
- Decision: every write re-reads the whole tab, re-resolves headers by label, finds the row by its sheet-local `id` (exactly once; never a remembered row number), and re-checks every value the user reviewed. Any difference is a conflict with the fresh product; nothing is sent.
- Decision: exact single cells only, all in ONE `values:batchUpdate` per spreadsheet. The writer fills in what only the app writes: Last Updated on every write (date serial), and Stock Status via `deriveStockStatus` whenever qty or threshold changes.
- Decision: success only after confirmation — the request asks for the written values back (unformatted, dates as serials), and `written` is returned only when every cell echoes the value sent (numbers within a tiny tolerance, so a rounded date serial is not a false failure).
- Decision: a 401 waits for renewal and redoes the whole write once, re-read and re-check included (safe: absolute values). A session ended instead fails as `expired`. Every other error fails, naming the sheet; never success.
- Decision [confirmed for now; revisit]: values are sent `RAW`, so text is stored as text and no formula can be written; the typed-input option may not appear in source (architecture rule). This supersedes the earlier proposal to send values as if typed.

## 2026-10-28: Quantity adjuster (US-15–17) [confirmed]

- Decision: one pure function computes the new quantity, `proposeQuantity(current, mode, amount)` in `core/stock-adjust/stock-adjust.ts`, with `parseAmount(raw)` for the typed text (blank → nothing yet; whole digits → that number; anything else → not whole). It returns the new whole quantity or a reason it is blocked — not whole, not above 0, below zero ("You can't subtract N: only M in stock."), over the 1,000,000 cap — and never clamps.
- Decision: the base is the MASTER quantity. The preview status uses `deriveStockStatus` with the master threshold (the writer's rule, so preview and saved value cannot disagree); the low-stock warning shows only when a threshold is set and the new quantity is below it.
- Decision (owner): Add/Subtract starts unselected; nothing is calculated until one is chosen, so a wrong sign is never applied silently.
- Decision: state lives in `StockAdjustStore`, which resets whenever the selected product changes or the selection clears (including a new session). The adjuster appears only for editable products (`editability()`).
- Decision: only `core/` may import `proposeQuantity`, `parseAmount` or `deriveStockStatus` (architecture rule).

## 2026-10-28: Review & approve, written to both sheets (US-18, 19, 33, 35, 20) [confirmed]

- Decision: the call is now `SheetsWriter.write(approved)`. One `ApprovedChange` covers one row, or one Master row then one Dr Trust row (`approve(masterRow, drTrustRow)`); `approve()` refuses any other shape and checks every row. The writer finds each sheet through `AppConfig`.
- Decision (owner: "check both first"): the writer re-reads and checks EVERY sheet before writing any. A conflict, missing row or no access in either sheet writes nothing and names the sheet. Then it writes Master, then Dr Trust, one `batchUpdate` each, with the same absolute quantity. The Master qty the user reviewed is re-checked; the Dr Trust qty is not (overwritten by design), but its row must still exist by `id`.
- Decision: results are `written`, `conflict`, `failed` (nothing written) and `partial` (Master written, Dr Trust not, with the reason). A partial is never shown as success.
- Decision: a 401 waits for renewal, then re-reads and re-checks only THAT sheet and sends again once, so an already-written Master is never rewritten. If Dr Trust changed meanwhile, the result is partial.
- Decision: `StockReviewStore` (`core/stock-adjust/`) holds the steps (editing → reviewing → saving → editing | conflict | partial | failed) and is the only caller of `approve()` for stock changes. Approve works only from reviewing or failed and only for an editable product, so a double click writes once. It returns to editing when the selected product changes.
- Decision: the product summary shows the review panel (`features/stock-editor/review-panel/`) in place of the adjuster while a review is open. It shows the sheets it saves to, current → change → new with the status badge, the low-stock warning and the Dr Trust note, then Approve / Back, a disabled "Saving…", or the outcome with its own buttons.
- Decision: after a write, `SheetsStore.applyRow` puts the API-confirmed values into the loaded data (no reload). On success a "Stock saved" toast names the product, new qty and sheets; the amount resets and the selection clears, while the search is kept. A conflict applies the fresh row so a new review uses it. A partial applies the written sheet and clears the amount, since Master already holds the new qty and the amount must not be applied twice.
- Decision: `<stoqr-toast>` gains a `success` variant, and an empty `actionLabel` hides the action button (extended, not forked).

## 2026-10-29: Retry a half-done save (US-34) [confirmed]

- Decision: a `partial` result carries `remaining`, the approval for the rows not yet written, made by `ApprovedChange.remaining(writtenSheets)` from the user's ORIGINAL approval (same targets and values). It works only on a genuine approval and refuses an empty result. Retry finishes that approval; it never calls `approve()` again.
- Decision: Retry goes through the same `SheetsWriter.write(remaining)`, so there is still one write path. With only the Dr Trust row left, the writer re-reads Dr Trust only, finds the row by `id` (held by row ref, never re-matched by SKU), and writes the same absolute qty, derived Stock Status and a fresh Last Updated, confirmed by Google's echo. Dr Trust's qty is not checked (overwritten by design); Master is never re-read or rewritten.
- Decision: `StockReviewStore.retry()` works only from the partial step ("Saving…" while it runs, so a double click writes once). Written → the normal success (toast naming both sheets, amount reset, selection cleared). Anything else stays partial ("Master was updated to N. Dr Trust still not updated: reason"), never a plain failure or success.
- Decision (owner): Close, choosing another product, sign-out or a reload drops the pending retry; the product keeps the Out of sync badge. Approve does nothing from the partial step, so the Master change cannot be sent twice.
- Noted, not changed: Change product stays clickable while a save runs; the write stays safe but its message would be lost. Candidate small fix.

## 2026-10-29: Busy or unreachable Google — backoff and honest messages (US-11) [confirmed]

- Decision: `core/sheets/backoff.ts` — up to 3 automatic retries per request, after about 1 s, 2 s and 4 s (±20% random spread). A `Retry-After` header in whole seconds wins, capped at 30 s. The wait is the `RETRY_WAIT` injection token (a timer by default, instant in tests).
- Decision: reads (both sheet loads and the re-read before every write) retry on 429, 5xx and network failures, asking for a fresh token on every try. 401 (renewal), 403, 404 and a missing tab are never retried by backoff.
- Decision (owner: "429 only, re-check first"): a write is retried automatically ONLY after 429, because Google saved nothing; before each resend the writer re-reads and re-checks that sheet, so a conflict found meanwhile stops it. A 5xx or network failure on a write may have saved, so it is never resent automatically: it fails as `unconfirmed` — "Google didn't confirm the save to <sheet>, so it may or may not have been saved. Try again re-checks the sheet first." Try again and Retry always re-read first, so a save is never applied twice.
- Decision: messages once retries run out — load busy: "Google is busy right now (too many requests). Wait a minute, then Retry."; load unreachable: "Couldn't reach Google to load <sheet>. Check your connection, then Retry."; write busy: "Google is busy right now (too many requests). Nothing was saved to <sheet>. Wait a minute and try again." A 400 that is not a missing tab keeps "Couldn't load <sheet>…" (not a network problem).
- Decision: no "retrying…" indicator; the loading overlay or "Saving…" stays up while waiting. Change product is disabled while a save runs, so a save's result is never lost (the gap noted in story C).

## 2026-10-29: Last Updated cell format — the app sets it (US-19 fix) [confirmed]

- Finding: `=NOW()` cells display as dates on their own; replacing them with a plain number left the "Automatic" format, so the sheet, V1 and V2 (after a reload) showed the raw date serial.
- Decision (owner, option B): on every save the writer formats the exact stamped cell `dd/mm/yyyy hh:mm:ss` (number format only) before writing values. Rejected: writing text (not a real date; gviz drops minority-type cells, breaking V1); relying on hand-formatted columns (fragile).
- Decision: order is check all → format all → write values, so a sheet the user can only view fails with nothing written. This closes the Viewer-only half-save gap (re-reads prove read access only).
- Decision: the tab number is fetched fresh per save (`SheetsReader.tabId`), never cached. Each sheet gets one renewal and 3 busy resends in total across its format and value requests; a value resend after a re-check formats the cell again first (the row may have moved).
- Cost: a linked save is 8 requests (was 4); still far below quota.
- Consequence: cells written before this fix keep showing a number until their row is next saved (the owner may format the column by hand).

## 2026-10-29: Details form and validation (US-21, US-22) [confirmed]

- Decision (owner): required fields are brand, product name, category, sub category, SKU, unit of measure, packing, status, low stock threshold and tax rate. Created At and Last Updated are not checked (never blank / app-stamped). A blank threshold can no longer be saved from the form.
- Decision: low stock threshold is a whole number 0–1,000,000 (the quantity cap); tax rate and the three prices are numbers ≥ 0 (digits, optional decimal part); the prices may be blank. Text is kept exactly as typed; whitespace-only counts as blank. Tax rate is checked as stored (no upper bound), so it does not depend on 18 vs 0.18.
- Decision: rules follow the adjuster's pattern — pure functions in `core/details/`, the component only forwards input; no Angular Validators, no validation library.
- Decision: one editor at a time in the summary (Adjust stock | Edit details), because a stock save clears the selection, which would drop unsaved details. Leaving with edits asks "Discard changes?". The picker needs no guard (it hides results while a product is selected).
- Decision: required blanks already in the sheet are flagged as soon as the form opens; nothing is filled in automatically, so such a row must be completed before any details save.
- Decision: shared `.stoqr-input` (`--mono`, `--invalid`, `--multiline`) and `.stoqr-field__error` added to `stoqr-theme.scss` (V2 extension, tokens only); the adjuster uses `.stoqr-input` (reuse over duplication).
- Decision: the form is lazy-loaded (`@defer`, 7 kB); the initial bundle is 455 kB.
- Finding: a store setter that read its own signal, called from the form's effect, looped forever; setters use `update()` (now in AI_CONTRACT Forbidden Shortcuts).

## 2026-10-29: Details saved to both sheets (US-23, US-24, US-36) [confirmed]

- Decision: only CHANGED fields are written, compared by value (`18.0` for 18 is no change), the same new values to both sheets of a linked product. Each sheet's row is guarded by THAT sheet's own current values of the changed fields: someone else's edit to the same field is a conflict; an edit to another field is not, and is never overwritten. Untouched fields that differ between the sheets are left alone.
- Decision: `DetailsStore` keeps only the user's edits; untouched fields show current data, so after a conflict or save they follow the fresh values and a save can never undo someone else's change.
- Decision (owner): after a successful details save the product stays open showing the saved values ("Details saved" toast). Stock saves still clear the selection.
- Decision: Stock Status is written on EVERY save (stock or details), derived per sheet from that sheet's own qty and threshold; this also repairs rows whose status was blank or stale.
- Decision: a text field whose fresh cell holds a number is written back as a number when the new text is a plain number (`12`, `0.5`); `007`, `1.50` and `12 pcs` stay text. Reason: RAW would store `"12"` as text, and gviz (V1) drops a column's minority-type values.
- Decision: a changed SKU blocked Review until US-38 (superseded the same day by "SKU change").
- Decision (reuse, Q-G3): the stock review's save steps were extracted into `ReviewFlow` (`core/sheets/review-flow.ts`), and the review buttons into `review-actions/`; both reviews use them. The stock specs passed unchanged, proving stock behaviour did not change.
- Decision: the conflict message names the fields and sheet ("Brand changed in Master since you opened this product. Nothing was saved."); the edits are kept and Review again uses the fresh values. A partial keeps the stock behaviour: Retry from the original approval while the review is open; the edits are dropped because the written sheet already holds them.
- Cost: the details chunk is 12 kB (lazy); the initial bundle stays 455 kB.

## 2026-10-29: SKU change in both sheets (US-38) [confirmed]

- Decision: a new SKU is compared normalised (trimmed, case-insensitive) against every OTHER row of both sheets; the product's own Master row and linked Dr Trust row never count, so a case-only change is allowed. Spaces at either end are refused, never trimmed. Messages name the sheet and product ("SKU RM-B1 is already used in Master (Bandage Roll).").
- Decision (owner: "allow and link"): a master-only product may take the SKU of exactly ONE unmatched Dr Trust row, which links them. That save writes the SKU (as typed, so the case matches) and the other changed fields to both rows in one approval; the review says it links. A linked product may not take any other row's SKU (its Dr Trust row would share it, blocking both). Rejected: blocking all matches (no way to link an orphan from the app).
- Decision: checked live in the form (`checkNewSku`, `core/sheets/sku-check.ts`) and again at save: whenever an approval changes SKU, the writer reads BOTH sheets fresh — even for a master-only product, one extra read — and refuses with nothing written if a row outside the original approval now holds it (`sku-taken`).
- Decision: `ApprovedChange.owners` keeps the original approval's rows through `remaining()`, so a Retry after Master took the new SKU counts Master as its own row and can finish Dr Trust.
- Finding: an abandoned half-done SKU change leaves the sheets with different SKUs, so the next load shows the product as Master only and the Dr Trust row as unmatched (not "Out of sync" as the backlog said); US-31 will list such rows.

## 2026-10-29: Unit tests suspended (owner) [confirmed]

- Decision (owner): from US-31 on, no new spec files are written and `npm test` is not run, because test writing and runs were taking too much time.
- Still done before every commit: both typechecks (`tsconfig.app.json`, `tsconfig.spec.json`) and the production build.
- Consequence: the AI_CONTRACT rules in `architecture.spec.ts` (only `SheetsWriter` mutates, `id` stays in `core/sheets`, approvals only from the review stores, OnPush, no `any`, …) are no longer checked automatically; new code is checked against AI_CONTRACT by reading it. Existing specs may go stale as code changes. The charter's Review Gate is amended to match; each spec's acceptance checks say "tests not run".
- Last full run: 583 tests, 50 files, all passing (US-38, commit 64fbd97).
- Revisit before US-25 (end-to-end smoke test) and before go-live (US-27).

## 2026-10-29: Data-health summary (US-31) [confirmed]

- Decision (owner: "brand in config"): Dr Trust products in Master are recognised by an optional `brand` on the Dr Trust `SheetDefinition` (compared trimmed, case-insensitive, inner spaces collapsed); not a hard-coded brand check. The owner adds the value to both environment files (off-limits to Claude). Present-but-blank fails the startup check; absent shows a hint instead of the list.
- Decision: four lists from the pairing only — repeated SKUs, unmatched Dr Trust rows, master-only products of the Dr Trust brand, linked products whose quantities differ (the sync badge's rule). One pure function, `dataHealth` (`core/sheets/data-health.ts`), via `DataHealthStore`. Display only: nothing is blocked or written.
- Decision: a "Data health (N)" button above the picker opens a lazy panel (8 kB). Master rows can be picked (through "Discard changes?"; disabled while saving); Dr Trust rows are text. Loader-flagged rows are not listed.

## 2026-10-29: Accessibility and small screens (US-26) [confirmed]

- Finding: small text in Mist (2.95:1) and Ink Light (4.37:1) failed WCAG AA in light mode; crimson error text failed in dark mode (2.80:1) — the theme's dark block follows the phone's setting. Buttons were ~29px (small ~21px) tall. The whole summary card was a live region.
- Decision: two V2 text tokens, `--color-text-muted` (light `#56685F`, dark `#7B9E8D`) and `--color-text-error` (light `#C0392B`, dark `#F0857A`), used for all small and error text in the theme and components. The brand's own colour tokens are unchanged (Mist and Ink Light stay for borders, icons and large text). Badges already passed.
- Decision: buttons min-height 44px on phones, 36px from desktop (`--sm` 32px, still above WCAG 2.2's 24px) [superseded 2026-10-30 by US-42: every button 44px at every width; `--sm` retired, guarded by an architecture rule]; explicit Pine `:focus-visible` ring. Inputs 16px on phones so iOS does not zoom on focus. The theme now uses the `from()` mixin (`@use 'breakpoints'`).
- Decision: the summary card is labelled by its heading instead of being a live region; targeted messages announce themselves. `prefers-reduced-motion` turns off transitions and slows the spinner.
- Trade-off: V2's look now differs slightly from V1 (darker small text, taller buttons on phones); V1's copy of the theme is untouched.

## 2026-10-30: Sticky bottom bar and shared tooltip (US-41) [confirmed]

- Decision: the footer is a sticky bottom bar mirroring the top bar (68.5px, same content bounds, one line). The TEST/LIVE pill never shrinks; the sheet labels shorten with "…" first.
- Decision (owner: "shared tooltip now"): `[stoqrTooltip]` in `shared/ui/tooltip/` wraps PrimeNG's Tooltip as a host directive; shows on hover and keyboard focus, Escape hides it, `stoqrTooltipOnEllipsis` shows it only while text is cut short. Defaults go through PrimeNG's `setOption()` (its input fields alone have no effect). Rejected: a plain `title` (never shows on keyboard focus).
- Decision: the tooltip library is about 45 kB; in the shell it pushed the first load to 503 kB, so the footer labels span is `@defer (on idle)` with a plain-text placeholder (first load 458 kB; tooltip a lazy chunk).
- Trade-off: the footer labels are one extra Tab stop, even when nothing is cut short.

## 2026-10-31: Data health button in the bottom bar (US-51) [confirmed]

- Decision: the button lives in the shell's bottom bar, so the panel's open state moved into a shared `PanelStore` (`core/layout/panel-store.ts`), read by the shell and the editor page; features never import each other. One "open panel" value, ready for the filter panel and "one at a time" (US-71). It closes on a session change.
- Decision (owner): the button shows once the sheets have loaded with no error and are not reloading — including an empty master sheet; never on sign-in, loading or error.
- Trade-off: the shell now reads the data-health count, which brings the pairing code into the first load (+14.6 kB, 475.4 kB; about 25 kB before the 500 kB warning). Accepted rather than deferring the button; later stories should lazy-load where they can.

## 2026-10-31: Development-only session keeper — REMOVE BEFORE GO-LIVE [confirmed, temporary]

- Owner request: stop having to sign in after every code change during development. Skipping sign-in outright would leave no Google token, so the sheets could not load; the owner chose "keep me signed in" over fake data or no data.
- Decision: `core/auth/dev-session.ts` saves the access token, its expiry, the first name and account id in this tab's `sessionStorage` after sign-in; `Auth` resumes it on start-up. It runs only when `isDevMode()` (false in every production build) AND `mode === 'test'`; it is cleared on sign-out and on expiry. The token still lasts about an hour, so a sign-in is still needed hourly.
- Trade-off: a temporary exception to "tokens in memory only" (AI_CONTRACT). The code is present but inert in the production build (both guards false there). Architecture rule exempts only this file and checks its guard.
- Action: delete `dev-session.ts`, its calls in `auth.ts` and the architecture-rule exemption as part of the US-27 cutover checklist.

## 2026-10-31: Refresh keeps the last good data on failure (US-58) [confirmed]

- Decision: `SheetsStore.refresh()` reloads both sheets with the same read and mapping as Retry while the loaded data stays on screen (`refreshing`). Success replaces the data and `fetchedAt`; any failure keeps them and sets `refreshError` (shown by US-69). A second call while a load or refresh runs, or before the first load, does nothing (`skipped`).
- Reason: safe because every write re-reads its rows first, so stale data on screen can never be written.
- Unchanged: the first load and Retry stay all-or-nothing (any failure shows no data).

## 2026-10-31: Results toolbar (US-69) [confirmed]

- Decision: V1's toolbar and its `relativeTime` pipe are copied (V1 untouched). The exact time in the tooltip is a small pure `exactTime` (Angular's `d MMM y, h:mm a`) instead of `DatePipe`, which added 13 kB to the first load.
- Decision: the filter panel's open state is a second key in `PanelStore` (`filters`), so Data health and filters already share one "which panel is open" (US-71).
- Decision (interim, until US-60): Refresh is disabled while a product is open, because a reload makes new row refs and would close the product and drop unsaved edits.
- Decision: a refresh failing for no named reason says "The list shown is unchanged. Please try again." under the title "Couldn't refresh the products".

## 2026-10-31: Floating filter panel (US-70) [confirmed]

- Decision (reuse, Q-G3): the filter panel uses the shared `<stoqr-floating-panel>` with a new `placement="below"` (under the toolbar, inside a relative anchor) instead of a second floating piece. Its height is measured on open/resize so it stops above the bottom bar.
- Decision: V1's `<stoqr-filter-select>` (PrimeNG MultiSelect with "All") and `<stoqr-toggle>` are copied into `shared/ui` (V1 untouched); the toggle is 44px at every width (US-42).
- Decision: opening a product closes the filter panel from `ProductSearchStore.select()`. Rejected: an effect in `PanelStore` reading the search store, which put the whole search store into the first load (+23 kB, over 500 kB).
- Trade-off: the panel chunk is lazy (133 kB), but the MultiSelect shares PrimeNG utility modules with the start-up PrimeNG setup, so the first load grew 480 → 496 kB (4 kB under the warning). Later stories must not add to the first load; candidates to win it back: deferring more of the shell.

## Open Questions
- REMINDER: remove the development-only session keeper (`core/auth/dev-session.ts`) before go-live (US-27).
- Revisit RAW vs typed input for writes (chosen RAW 2026-10-28 to rule out formulas), e.g. if a sheet's formatting or locale needs typed input.
- Do all staff have Editor access to both LIVE spreadsheets? (TEST copies: yes, confirmed 2026-10-27.)
- Hosting choice for the static site (Cloudflare Pages / Netlify / Firebase Hosting).

## Answered 2026-10-27
- Both sheets have identical column headers and clean, unique SKUs (owner confirmed).
- The product tab is named `Sheet1` in all four spreadsheets; it stays config, not hard-coded. Non-secret config values are kept in the Stoqr project note `claude/stoqr-editor-config-values.md` until the environment files exist (US-04).
