# Feature: Frame tests, docs and decisions (US-81, UI-7)
# Sprint 9. Classification: TEST/DOC. Depends on US-39 to 43.

## Done (2026-10-31)
- DECISIONS: "The Editor's design system now differs from V1 on purpose"; the shared design-system package is revisited and stays deferred until after go-live.
- `docs/stoqr-brand.md` §7: one table of the Editor's differences from V1.
- `docs/projectmap.md`: App shell points to that table.
- Already in place: the architecture rule that retires `stoqr-btn--sm` (US-42).

## Deferred while unit tests are suspended (owner, 2026-10-29)
- `app.spec.ts`: top bar and bottom bar structure (bounds row, sticky, no bottom bar on sign-in, Data health button pressed state with `.stoqr-btn--pressed`).
- `logo.spec.ts`: "stoqr" + "Editor", accessible name "Stoqr Editor".
- Architecture rule: no component SCSS re-declares the bar bounds (`max-width: 1440px` + gutters outside `.stoqr-bounds`) or the button look (`min-height: 44px`, the pressed Dew/Pine pair) outside `stoqr-theme.scss`.

## Owner checks
- [ ] Side by side with V1 at 320, 360, 768, 1024, 1440 and 1920: bars, bounds, buttons, logo; differences match §7.
