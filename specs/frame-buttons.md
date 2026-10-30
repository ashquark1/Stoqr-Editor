# Feature: One button spec (US-42, UI-4)
# Sprint 5. Classification: Local (styling and markup; no data impact). Depends on US-39.

## Problem
Buttons were 44px on phones but 36px from desktop (US-26), and a small size (`stoqr-btn--sm`, 32px from desktop, 11px text) was used on 9 buttons, so the same kind of button looked different across screens and differed from V1. V1's icon-only button and its busy Refresh button lived only in V1's search component.

## Non-Goals
- No new buttons and no behaviour change. Screens that later stories redesign (mode toggles, Change product, Review) only get the new size here.
- PrimeNG's own dialog close (✕, 35px) is not a `.stoqr-btn` and is unchanged. The data-health list links (36px) are text links, not buttons of this spec.
- The busy state is made available, not applied (US-43 and later stories apply it).

## Behavior Rules
- `.stoqr-btn`: `min-height: 44px` at every width; padding `0 var(--space-4)`, `0 var(--space-5)` from 768px; 13px / 500; radius `--radius-control`. Variants primary / secondary / ghost / danger with V1's colours and hover; disabled opacity .45 and not-allowed; Pine focus ring on `:focus-visible` (Sage in dark mode, from the token).
- Press: `translateY(1px)` while active (transform only, no layout shift; no transition under reduced motion).
- `stoqr-btn--sm` is retired: removed from the theme and from every template. Rule in `architecture.spec.ts`: "no small button size" (written, not run).
- `.icon-btn` (V1's name), in the theme, used with `.stoqr-btn`: 44×44, no padding and an 18px icon under 768px with the label hidden; auto width, `0 var(--space-5)` and the label shown from 768px. Give it an `aria-label` for the icon-only size.
- Busy: `.stoqr-btn--busy` with `disabled` and `aria-busy="true"`; opacity .65 and a progress cursor; the spinner takes the button's text colour so it shows on every variant. Reduced motion slows the spinner (US-26).

### Busy pattern (copy exactly in later stories)
```html
<button
  type="button"
  class="stoqr-btn stoqr-btn--primary"
  [class.stoqr-btn--busy]="busy()"
  [disabled]="busy()"
  [attr.aria-busy]="busy()"
  (click)="…"
>
  @if (busy()) {
    <span class="stoqr-spinner" aria-hidden="true"></span>Saving…
  } @else {
    Save changes
  }
</button>
```

## Measured before (product screen, signed in)
| Width | Sign out | Data health | Change product | Mode toggles | Add / Subtract | Review |
|---|---|---|---|---|---|---|
| 320 | 44 | 44 | 44 | 44 | 44 | 44 |
| 1440 | 32 | 32 | 32 | 32 | 32 | 36 |

## Measured after (browser pane, dark mode)
Every visible button is 44px high at 320, 360, 768, 1024, 1440 and 1920 on: the editor home, the product screen (Sign out, Data health, Change product, Adjust stock, Edit details, Add, Subtract, Review), the Data health panel (Close), the details form (Review changes, Cancel) and the Discard dialog (Discard, Keep editing). No sideways scroll at any width. Widths grew with the 13px text and 16 / 20px padding (e.g. Sign out 64 → 84px on phones, 92px from 768px).

Probe at 1440 (temporary buttons, removed after): primary, secondary, ghost, danger all 44px, opacity 1; disabled 0.45; busy primary "Saving…" and busy secondary "Refreshing…" 0.65 with a visible spinner; `.icon-btn` 44×109 with its label at 1440 and 44×44 icon-only at 320. Hover rule (primary opacity .88) and press rule present; focus ring solid.

## Keyboard pass (product screen, 1440)
Tab order: Sign out → Data health → search → Change product → Adjust stock → Edit details → Add → Subtract → Amount; every button shows the focus ring. Review is skipped while disabled.

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run. New rule added to `architecture.spec.ts` (not run).
- Typechecks (`tsconfig.app.json`, `tsconfig.spec.json`) and the production build pass; initial bundle 455.7 kB.

## Acceptance Checks
- [x] Every `.stoqr-btn` is 44px at all six widths; 16 / 20px padding; 13px / 500; control radius
- [x] Four variants: hover, press, disabled and focus ring
- [x] `stoqr-btn--sm` gone from the theme and all templates; rule written
- [x] `.icon-btn` in the shared theme (V1 name), no per-component copies
- [x] Shared busy pattern (spinner, `aria-busy`, "…ing" label) available
- [x] Dialog and Discard prompt buttons follow the spec; the toast's Retry and ✕ unchanged
- [ ] Owner: look at the product screen, details form, Data health panel and Discard dialog at 320 and 1440
- Tests not run (owner decision 2026-10-29).
