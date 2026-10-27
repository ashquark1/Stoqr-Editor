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

## 2026-10-21: Read via Sheets API, not gviz [confirmed]

- Decision: V2 reads through the authenticated Sheets API. gviz is not used.
- Reason: gviz can lag behind recent edits, which would show a stale quantity right after a save; the API returns fresh data and also works if the sheet is made private.
- Note: V1 keeps reading via the public gviz link, so making the sheet private would break V1.

## 2026-10-21: Rows are located by `id`; `id` is an opaque `RowRef` [confirmed]

- Decision: the sheet's `id` column (confirmed unique for every row) is used to locate the row on every load and write. It lives only inside `core/sheets/` and reaches features as an opaque `RowRef`; it is never on `Product`, never in a form, never displayed, never editable.
- Reason: row numbers shift when rows are sorted or inserted; `id` is stable. Keeping it opaque honours V1's rule that `id` never reaches UI code while still letting V2 write to the right row.
- Decision: columns are mapped by header label (as in V1), so reordering columns does not corrupt writes.

## 2026-10-21: Quantity rules — whole numbers, never below zero [confirmed], cap [proposed]

- Decision [confirmed]: whole numbers only (no decimals). The amount is a positive whole number. Subtracting past zero is blocked with a message, not silently clamped.
- Decision [proposed]: a sanity cap of 1,000,000 on the amount or resulting quantity to catch typos such as an extra zero.
- Decision [proposed]: show a low-stock warning in the review step when the proposed quantity is at or below `Low Stock Threshold`. This is a preview only; V1's "stock status is read verbatim" rule still applies to what the sheet stores.

## 2026-10-21: Approval flow with a re-read guard [confirmed]

- Decision: quantity changes require an explicit review step ("120 → −15 → 105") and Approve. On Approve the app re-reads the row, verifies the `id` and that the quantity still equals what the user reviewed, then writes. If anything differs it aborts and shows the fresh value.
- Reason: the browser cannot do an atomic compare-and-set; this narrows the race window to milliseconds, which is acceptable for a small team.
- Rejected: writing the computed absolute value blindly; optimistic UI before API confirmation.

## 2026-10-21: Last Updated becomes a static timestamp [confirmed direction, details open]

- Finding: the sheet's Last Updated column is `=NOW()`, which recalculates continuously, so it shows the current time rather than when a product changed.
- Decision: convert the column from formulas to plain values (one-time sheet change by the owner) and have the app stamp a real timestamp on every approved quantity change and details edit, in the column's existing display format. V1 keeps working (it only displays the text).
- Open: what historical rows get (today's date vs blank); the exact display format (read from the column pattern at M1).

## 2026-10-21: Quantity is edited only via the adjuster [proposed]

- Decision: the details form shows Stock Qty read-only; all quantity changes go through adjuster → review → approve. Created At is read-only; Last Updated is app-stamped; `id` is excluded.
- Reason: one reviewed path for quantity prevents unreviewed changes.

## 2026-10-21: Optional Stock Log tab [proposed]

- Decision: append a row (timestamp, user email, `id`, old qty, new qty, delta, optional reason) to a separate "Stock Log" tab on each approved quantity change. Requires the `email` scope.
- Status: awaiting owner confirmation.

## Open Questions
- Is Stock Status a formula or typed text? If a formula, the app never writes it; if typed, the app must update it on each quantity change.
- Last Updated display format and backfill choice (see above).
- Stock Log tab: yes or no.
- Do all staff have Google accounts that can be given Editor access?
- Hosting choice for the static site (Cloudflare Pages / Netlify / Firebase Hosting).
