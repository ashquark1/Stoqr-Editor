# Project: Stoqr Editor (V2) — Angular 21, TypeScript, Signals + HttpClient

V2 scope: a single-page, frontend-only editor for the Stoqr Google Sheet. Pick a product, adjust its stock quantity (add / subtract, review, approve), and edit every product field except the internal `id`. V1 (separate repo) stays read-only search & view.

## Build & Dev Commands
- Requires Node 22 (`nvm use 22.22.3` — fresh terminals may default to Node 20.18.0, which Angular 21 rejects).
- `npm start` — dev server (`ng serve`, http://localhost:4200)
- `npm run build` — production build
- `npm run watch` — dev build, rebuild on change
- `npm test` — unit tests (Vitest via `ng test`)

## Stack Decisions (don't deviate without asking)
- State: Angular Signals in injectable services only. No NgRx.
- Backend: NONE. Frontend-only. Staff sign in with Google (Google Identity Services token flow) and the app calls the Google Sheets API v4 directly with their access token. No server, no service account, no Apps Script endpoint.
- Two spreadsheets: master (all brands) + a separate Dr Trust file. Rows are paired by SKU; a linked product is written to BOTH sheets, success only when both confirm. See the Linked Sheets rules in @docs/AI_CONTRACT.md.
- Data access: Angular `HttpClient` only, wrapped in `core/sheets/` services. No `HttpClient` in components. Reads AND writes go through those services — never gviz.
- Writes: only through the single `SheetsWriter`, only after explicit user approval, only to allowlisted columns. See @docs/AI_CONTRACT.md.
- Forms: Reactive Forms + built-in Validators only. No external validation library.
- Styling: component-scoped SCSS over the Stoqr design system (`src/styles/stoqr-theme.scss`, copied from V1). Reference design tokens via `var(--token)` and the `.stoqr-*` classes — never hardcode hex, font, or spacing. Mobile-first: base styles target mobile; add overrides with `min-width` only (768/1024/1440) via the `from()` mixin in `src/styles/_breakpoints.scss` — never `max-width`. Brand spec: @docs/stoqr-brand.md. No third-party CSS/UI framework — ask before adding one.
- UI components: PrimeNG (styled mode, `StoqrPreset`) is the approved component library. Features consume our `shared/ui` wrappers (`<stoqr-modal>`, `<stoqr-toast>`, …) — never `p-*` directly.
- Testing: Vitest via `ng test`.
- Components: standalone, `ChangeDetectionStrategy.OnPush`, signal-based. No NgModules.

## Project Structure (feature-based, layered)
- `src/app/core/` — singletons, domain models, auth, data-access (no UI). `src/app/shared/` — reusable presentational kit (`ui/` wraps vendor libs, `util/`, `models/`). `src/app/features/<feature>/` — feature areas (V2 has three: `sign-in`, `session`, `stock-editor`). `src/styles/` — design system.
- Path aliases: `@core/*`, `@shared/*`, `@features/*`, `@styles/*`, `@env/*`. Wrap third-party libraries in `shared/ui/` so features stay vendor-agnostic.

## Naming Conventions (Angular 21 style guide)
- Files: kebab-case, NO `.component`/`.service` suffix (e.g. `sheets-writer.ts`, `stock-adjust.ts`).
- Component class: PascalCase; selector: kebab-case with a feature prefix (`app-`).
- Template-only members: `protected readonly`. State: `signal()` / `computed()`.

## Code Rules
- Strict TS. No `any`, no `@ts-ignore`, no `@ts-nocheck`.
- No manual `.subscribe()` in components — use the `async` pipe or `toSignal()`.
- No business logic in components — it belongs in services/stores/pure functions.
- Components never call `HttpClient` or Google APIs directly.
- Quantity is a whole number ≥ 0. Never write without an explicit user tap (Apply, Undo, Retry, Save changes). Never write `id`.
- Stock Status is derived (`deriveStockStatus`) and written with every quantity change; never typed, never computed in a component.
- Standalone components only. No NgModules.

## Off-Limits (never modify without explicit confirmation)
- `src/environments/*` — spreadsheet IDs and Google OAuth client ID. Enforced by the deny rule in `.claude/settings.json`.
- `.claude/settings.json` — holds that deny rule; never loosen it without explicit confirmation.
When other auth or env config is added, list it here and in `.claude/settings.json`.

## Reference Docs (use @-syntax to load when needed)
- Project map: @docs/projectmap.md
- AI contract: @docs/AI_CONTRACT.md
- Decisions log: @docs/DECISIONS.md
- Brand spec: @docs/stoqr-brand.md

## Core Domain Changes (models, Sheets data-access/write path, auth, shared state)
ALWAYS read @docs/AI_CONTRACT.md and @docs/projectmap.md before starting.
ALWAYS update @docs/DECISIONS.md if a trade-off was made.

## Session End Protocol
After any core domain change:
- New pattern introduced → update @docs/DECISIONS.md
- New anti-pattern found → update @docs/AI_CONTRACT.md
- Domain ownership changed → update @docs/projectmap.md
- Spec deviated from plan → update @specs/[feature].md
