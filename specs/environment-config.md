# Feature: Environment config for two sheets (US-04)
# Sprint 1. Classification: Core (config that decides which real spreadsheet gets touched).

## Problem
The app needs the Google Client ID and two sheet definitions (master, Dr Trust). A mistake here could send development or test traffic to the LIVE spreadsheets. Development, `npm start`, `npm run watch` and `npm test` must always use the TEST copies; only the production build may use LIVE.

## Non-Goals
- No secrets (the OAuth Client ID is public by design; there is no client secret, API key or token in this app).
- No runtime switch between test and live; no config UI.
- No spreadsheet ID anywhere outside `src/environments/`.

## Behavior Rules
- `src/environments/` is OFF-LIMITS (CLAUDE.md). The owner must explicitly confirm at the start of the session that these two files may be created. Then add the `.claude/settings.json` deny rule for `src/environments/*` in the same session, AFTER the files exist.
- Values come from the Stoqr project note `claude/stoqr-editor-config-values.md` (the owner pastes it into the session). Do not copy IDs into specs, docs or tests.
- `environment.development.ts` holds the TEST values; `environment.ts` holds the LIVE values (default Angular layout: the `development` build configuration replaces `environment.ts` with `environment.development.ts`).
- Shape (typed, readonly):
  - `production: boolean`
  - `mode: 'test' | 'live'`
  - `google: { clientId: string }` (the scope is a constant in `core/auth`, not config)
  - `sheets: readonly SheetDefinition[]`, exactly two: `{ key: 'master' | 'dr-trust', label: string, spreadsheetId: string, tab: string }`; `tab` is `Sheet1` for all four today but is config, never hard-coded.
- Only `core/config/app-config.ts` (a signal-exposing service) imports `@env/*`. Components and other services read config through it.
- `dev`, `watch`, `test` resolve to TEST. `npm run build` (the default production configuration) resolves to LIVE.
- The unit-test target must be pinned to the `development` build configuration. V1's `test` target has no build target set, so verify what `ng test` resolves and set `buildTarget` explicitly if needed.
- The footer always shows the active mode and both sheet labels, e.g. `TEST · Master (Sheet1) · Dr Trust (Sheet1)`. In `live` mode the mode badge uses the warning color so it cannot be missed.
- The reader (US-08) must build the A1 range from `tab` with correct quoting (`'` doubled inside quotes) and URL-encoding.

## Edge Cases
- A tab name with spaces or an apostrophe: range is quoted and escaped correctly.
- Someone edits the development file to a LIVE ID: the rule test fails.
- Two definitions with the same key, or a missing `master` / `dr-trust`: fails at startup with a clear message, not silently.

## Implementation Phases
- Phase 1: `SheetDefinition` type, both environment files, `angular.json` `fileReplacements`, test target pinned to development — verified by: unit test + `ng test` run showing `mode === 'test'`.
- Phase 2: `AppConfig` service (signals, validation of the two definitions) — verified by: unit tests (valid, duplicate key, missing sheet).
- Phase 3: footer UI with mode badge and sheet labels — verified by: visual check in test mode; temporary local check of the LIVE badge style.

## Test Plan
- Rule: in the unit-test run, `environment.production === false` and `mode === 'test'`.
- Rule: development and production environment files share no `spreadsheetId` (read both files as text, because `fileReplacements` swaps the module and would hide the difference in a normal import).
- Rule: exactly two definitions with keys `master` and `dr-trust` in each file.
- Rule: no file outside `src/environments/` contains a spreadsheet ID (scan `src/` for the 44-character ID pattern).
- Range builder: plain tab, tab with space, tab with apostrophe.

## Acceptance Checks
- [x] All behavior rules hold
- [x] `npm start` footer shows `TEST` and both sheet labels; production build (`npm run build`) config resolves to LIVE (bundle holds the LIVE master ID, not the TEST one)
- [x] `ng test` resolves to TEST (proved by the rule test in `app-config.spec.ts`)
- [x] `.claude/settings.json` deny rule for `src/environments/*` added after the files were created; an edit attempt was refused
- [x] No IDs outside `src/environments/` (rule test; planted leak caught)
- [x] Verified against TEST sheets only (no sheet access in this story; the LIVE build was never served)
- [x] docs/DECISIONS.md updated (test-target pinning; mode badge)

## Built differently from plan (2026-10-28)
- Deny rule uses `Edit(/src/environments/**)` and `Edit(src/environments/**)`: an `Edit` rule covers every file-writing tool, and a `Write(...)` rule is not matched.
- The range builder is `tabRange(tab)` in `core/sheets/a1-range.ts`; it also percent-encodes `'` (which `encodeURIComponent` leaves alone).
- `validateEnvironment` also rejects `production` disagreeing with `mode`.
- The footer mode badge reuses `.stoqr-badge` (`--unknown` for TEST, `--low-stock` for LIVE); TEST/LIVE are shown in capitals by CSS.
- The LIVE badge style is checked in `app.spec.ts` with a stand-in `AppConfig`, not by serving a LIVE build.
- Edge case "development file edited to a LIVE ID" was proved by planting it; the rule test failed and the file was restored byte-for-byte.
