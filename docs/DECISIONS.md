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
- Decision [confirmed 2026-10-28 — sent RAW, see SheetsWriter; the `USER_ENTERED` part is superseded]: write the timestamp as a date-time serial number (days since 1899-12-30, from the user's local wall-clock time) with `USER_ENTERED`, so it is a real date in the sheet and the column's `dd/MM/yyyy HH:mm:ss` format applies. Writing the text `27/10/2026 …` instead would be misread under a US-locale spreadsheet or stored as plain text. Verify the column's number format at M1.
- Assumption: all staff work in the same time zone (IST).

## 2026-10-27: Stock Status is typed text, so the app derives and writes it [confirmed]

- Finding: Stock Status is plain typed text in the sheet, not a formula. After a quantity change it would go stale unless the app updates it.
- Decision [confirmed]: the app writes Stock Status together with the new quantity in the same request, and again whenever a details edit changes Stock Qty's inputs (Low Stock Threshold).
- Decision [confirmed]: ONE pure function, `deriveStockStatus(qty, lowStockThreshold)`, in `core/stock-adjust/`, using the sheet's exact label texts (confirmed by the owner):
  - qty = 0 → `Out of Stock`
  - 0 < qty < threshold → `Low Stock`
  - qty ≥ threshold → `In Stock` (a quantity EQUAL to the threshold is In Stock)
  - threshold is empty → `In Stock` when qty > 0 (no low-stock band)
- Decision [proposed]: in the details form Stock Status is read-only (derived); users do not type it. The review step previews the new status and the low-stock warning from the same function.
- Note: this deliberately supersedes V1's rule that stock status is "read verbatim, never derived". That rule belongs to V1's read-only contract; V2 owns the write, so it must own the derivation.

## 2026-10-21: Quantity is edited only via the adjuster [proposed]

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
- Decision [proposed] — data health: a duplicate SKU in either sheet blocks that product (not editable) with a message. Dr Trust rows with no master match, and master Dr Trust products missing from the Dr Trust sheet, are shown as warnings and are not synced.
- Decision [confirmed 2026-10-27] — quantity mismatches are ALWAYS overridden: if a linked product's stock qty differs between the sheets, there is no reconcile step and nothing is blocked. The approved final quantity is written to BOTH sheets, replacing whatever the Dr Trust sheet held.
- Decision [confirmed 2026-10-28 for the adjuster; the review note lands in Sprint 3 story B] — base quantity: the adjuster's "current qty" and the add/subtract maths use the MASTER's quantity (the picker is driven by master). When the Dr Trust quantity differs, the review step shows a non-blocking note ("Dr Trust currently has X; it will be set to Y") so the overwrite is never invisible.
- Decision [proposed] — write sequence: re-read BOTH rows, verify each sheet-local `id` still matches, and verify the master quantity (the base the user reviewed) is unchanged; compute final ABSOLUTE values; write master then Dr Trust. The Dr Trust quantity is not guarded — it is overwritten by design. Absolute values make retries idempotent.
- Decision [proposed] — partial failure: if one write fails, show which sheet was updated and which was not, and offer Retry. Retry re-reads the failed row, re-verifies its `id` (and, for a master retry, the base quantity), then rewrites the same absolute values. The linked pair is held in memory by row refs, so retry does not depend on SKUs matching. If the user abandons it, the next load flags the product as out of sync.
- Decision [proposed] — details edits: only CHANGED fields are written, to both sheets. Fields that already differ but were not edited are left alone. Last Updated is stamped on both; Stock Status is derived per sheet from the final qty and that sheet's own threshold.
- Decision [confirmed 2026-10-27] — SKU is editable, including for linked products. A SKU change is written to BOTH sheets in the same approved action, so the pair stays linked.
- Decision [proposed] — SKU safeguards: the new SKU must be non-empty and, normalised (trimmed, case-insensitive), must not match any OTHER row in either sheet — otherwise the save is blocked with a message. The review diff shows "old → new" and that it applies to both sheets. If a SKU change fails on only one sheet, the two sheets briefly hold different SKUs and the product would no longer pair on a reload; Retry (pair held in memory) completes it, and the data-health view lists it if abandoned.
- Decision [proposed] — access: a user needs Editor access to BOTH spreadsheets to change a linked product. If a sheet is not accessible the app names it and blocks the change. Master-only products need master access only.
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
- Decision: errors — 401 → back to sign-in; 403 → no access to <sheet>; 400 "Unable to parse range" → tab not found; 404 → spreadsheet not found; 429/5xx/network → generic. No automatic retry yet (US-11).
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
- Decision: the picker lists MASTER products only (Dr Trust rows are never pickable) of EVERY status (owner choice), in sheet order; at most 20 are shown with the total ("keep typing to narrow").
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

- Decision: `SheetsWriter.write(sheet, approved)` (`core/sheets/sheets-writer.ts`) is the only code that changes a spreadsheet. One row in one sheet per call, parameterised by the sheet definition; linked (both-sheet) writes are US-33 and call it once per sheet.
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

## Open Questions
- Revisit RAW vs typed input for writes (chosen RAW 2026-10-28 to rule out formulas), e.g. if a sheet's formatting or locale needs typed input.
- Do all staff have Editor access to both LIVE spreadsheets? (TEST copies: yes, confirmed 2026-10-27.)
- Hosting choice for the static site (Cloudflare Pages / Netlify / Firebase Hosting).

## Answered 2026-10-27
- Both sheets have identical column headers and clean, unique SKUs (owner confirmed).
- The product tab is named `Sheet1` in all four spreadsheets; it stays config, not hard-coded. Non-secret config values are kept in the Stoqr project note `claude/stoqr-editor-config-values.md` until the environment files exist (US-04).
