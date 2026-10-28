# Feature: Foundation scaffold (US-01, US-02, US-03)
# Sprint 1. Classification: Core (sets the structure every later core change depends on).

## Problem
The repo holds governance docs only; nothing is scaffolded. Every later story needs a strict Angular 21 base, the Stoqr look, and the rule that PrimeNG is reached only through `shared/ui` wrappers. Getting the structure wrong now means rework in every sprint.

## Non-Goals
- No sign-in, no Sheets access, no write code, no product features (those are US-05, US-08 and later).
- No ESLint / angular-eslint. Lint is not in CLAUDE.md or the Review Gate; adding it needs a logged decision first.
- No new libraries beyond the V1 dependency set listed below.
- Do not copy V1 feature code (`product-search`, filters, sort); only the design system and the `shared/ui` pieces listed.

## Behavior Rules
- Scaffold INTO the existing repo root (`Editor V1\frontend`). Never overwrite or delete `CLAUDE.md`, `docs/`, `specs/` or `.git`. Merge `.gitignore` (keep the existing entries). If `ng new` refuses a non-empty directory, generate in a temp folder and move the files in.
- Node 22 (`nvm use 22.22.3`). Angular 21, TypeScript strict (`strict`, `strictTemplates`), standalone components only, `ChangeDetectionStrategy.OnPush` as the schematic default, SCSS.
- Dependencies match V1 so the two apps stay in step: `@angular/*` ^21.2, `@angular/cdk` ^21.2, `primeng` ^21.1.9, `@primeuix/themes` ^2.0.3, `rxjs` ~7.8, `tslib`; dev: `@angular/build`, `@angular/cli`, `@angular/compiler-cli`, `typescript` ~5.9, `vitest` ^4, `jsdom` ^28, `prettier`. Anything else needs a DECISIONS.md entry and owner approval.
- npm scripts exactly as CLAUDE.md: `start`, `build`, `watch`, `test` (plus `ng`).
- `angular.json` mirrors V1: `stylePreprocessorOptions.includePaths: ["src/styles"]`, `public/` assets, `src/styles.scss` as the global style, production budgets, a `development` configuration. The environment `fileReplacements` are added in US-04, once `src/environments/*` exists (pointing at missing files would break the dev build; see `specs/environment-config.md`).
- Path aliases in `tsconfig`: `@core/*`, `@shared/*`, `@features/*`, `@styles/*`, `@env/*`.
- Structure: `src/app/core/` (auth, sheets, models, stock-adjust, config), `src/app/shared/` (`ui/`, `util/`, `models/`), `src/app/features/stock-editor/`, `src/styles/`. Create folders only when a file lands in them.
- Design system is COPIED from V1 (`Desktop\Stoqr\V1\frontend\src\styles\`): `stoqr-theme.scss`, `_breakpoints.scss`, `_primeng-overrides.scss`, `brand-tokens.ts`, `primeng-preset.ts`, and `public/stoqr-logo.svg`; `src/styles.scss` as in V1. Do not edit token values.
- Component SCSS uses `var(--token)` only: no hex, font family or spacing literals. Mobile-first with the `from()` mixin; never `max-width`.
- `shared/ui` wrappers copied from V1 now: `logo`, `loading-overlay`, `empty-state`, `toast`. `badge` and `status-badge` move to US-08 (in V1 they import V1 core helpers). Copy `modal`, `data-table`, `toggle`, `filter-select` later, when a story needs them. PrimeNG is imported only inside `src/app/shared/ui/`, including its registration: `app.config.ts` calls `provideStoqrUi()` from `shared/ui`.
- Do NOT copy V1's `src/environments/*`: V1's development file points at a LIVE V2 spreadsheet.
- `app-root` is a shell: topbar with the logo, a content area, and a footer slot (filled by US-04). No business logic.

## Edge Cases
- Existing `.gitignore` must still ignore `node_modules`, `dist`, `.angular` after the merge.
- Wrong Node version: Angular 21 refuses to run; stop and say so rather than working around it.
- Fonts: V1's `index.html` has no font link, so check how `stoqr-theme.scss` loads Lora / DM Sans / DM Mono, and confirm all three actually render (open the app, inspect computed fonts). If they load from Google Fonts at runtime, note it in DECISIONS.md.
- The `test` target must not silently pick LIVE config (handled in `specs/environment-config.md`).

## Implementation Phases
- Phase 1: scaffold, aliases, scripts, dependencies, `angular.json` — verified by: `npm install`, `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, `npm test` all pass on a clean checkout.
- Phase 2: copy design system and the listed `shared/ui` wrappers with their specs; wire `styles.scss` — verified by: visual check at 360px and 1024px (colors, three fonts, logo), existing wrapper specs pass.
- Phase 3: architecture rule tests (one spec file that scans `src/`) — verified by: tests fail when a violation is planted, pass when removed.

## Test Plan
Rule-level tests (a single `architecture.spec.ts` scanning source files):
- No `primeng` import and no `<p-` template tag outside `src/app/shared/ui/`.
- No `max-width` media query in any `.scss` (the `max-width` CSS property is allowed).
- No hex color literal in component `.scss` (files under `src/app/`).
- No `@ts-ignore`, `@ts-nocheck` or `any` type in `.ts` files.
- No `.subscribe(` in component files.
- `HttpClient` imported only under `src/app/core/sheets/` (and `core/auth/` if ever needed).
- Every component uses OnPush; no `@NgModule` (added in Phase 2 design).
- Code rules ignore comments; the `@ts-ignore` rule reads the raw text.
Plus the copied wrapper specs from V1. Reading files needs Node types: `@types/node` is enabled for spec files only (`tsconfig.spec.json`).

## Acceptance Checks
- [x] Clean checkout: install, build, typecheck and test pass (2026-10-28: 4 files / 18 tests)
- [x] App opens at http://localhost:4200 showing the Stoqr topbar and logo; Lora, DM Sans and DM Mono render
- [x] Layout is correct at 360px (mobile-first, `min-width` only); also checked at 1024px
- [x] Architecture rule tests present and passing; each rule fails on a planted violation
- [x] No libraries beyond the list above, except `@types/node` (dev, types only; approved by the owner and logged in DECISIONS.md)
- [x] `CLAUDE.md`, `docs/`, `specs/` untouched except as noted below
- [x] docs/DECISIONS.md updated: record the scaffold choices and the font-loading finding; close the Open Questions now answered by the owner (test copies received; both sheets share headers with unique SKUs; owner has shared both test sheets as Editor); mark the "IDs supplied so far are PRODUCTION" entry as resolved
- [x] docs/projectmap.md "Last updated" refreshed; code paths marked as scaffolded where files now exist

## Follow-ups found during the build
- `logo.scss` (copied from V1) uses `gap: 6px`, a spacing literal with no matching token (brand spec: 6px inline gap). Decide: add a token to both apps, or accept it as a brand exception.
- The toast's default title is V1's "Couldn't load products"; US-08 passes its own.
