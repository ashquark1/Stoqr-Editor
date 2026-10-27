# Stoqr — Brand Identity System

> In-repo copy of the brand spec. Design tokens live in
> `src/styles/stoqr-theme.scss`; reference them via `var(--token)` only — never
> hardcode hex/font/spacing in component SCSS. Breakpoint mixins live in
> `src/styles/_breakpoints.scss`.

---

## 0. Responsive (project convention)

Mobile-first. Write base styles for mobile, then add overrides with **`min-width`
only** at these breakpoints. **Never use `max-width` media queries.**

| Breakpoint | Min width |
|---|---|
| Tablet | 768px |
| Desktop | 1024px |
| Wide | 1440px |

Use the `from()` mixin from `src/styles/_breakpoints.scss` rather than raw queries.

---

## 1. Logo

### Concept
The Stoqr mark is a four-leaf clover arranged as a medical cross. Four
heart-shaped leaves radiate from a shared center point — one upward, one
downward, one left, one right — forming a cross silhouette. A curved stem
extends from the base. The form is entirely organic: no geometric primitives,
no sharp angles.

### Logo File
`public/stoqr-logo.svg` — standalone SVG. Scale via `width`/`height`.

### Sizing
| Context | Mark size | Font size |
|---|---|---|
| Hero (initial state) | 36×36px | 34px |
| Inline (search bar) | 16×16px | 14px |
| Favicon | 32×32px | — |
| App icon | 48×48px | — |

### Colorways
| Background | Mark fill | Wordmark fill |
|---|---|---|
| White / Paper | `#1A7A4A` Pine | `#0D2B1E` Forest |
| Dark / Forest | `#2ECC79` Sage | `#F4FAF7` Paper |
| Tinted / Dew | `#1A7A4A` Pine | `#0D2B1E` Forest |

### Lockup
Mark to the left of the wordmark **stoqr**, aligned to cap height. Gap: `8px`
hero, `6px` inline. Wordmark in Lora (serif) bold. Sub-label `INVENTORY` below
the wordmark in DM Sans, 11px, 3px letter-spacing, Pine — hero state only.

### Don'ts
- Do not rotate or tilt the mark
- Do not use the mark without the stem
- Do not recolor individual leaves
- Do not use on backgrounds below WCAG AA (4.5:1)

---

## 2. Color Palette

All colors WCAG AA compliant on their intended pairings. Tokens defined in
`stoqr-theme.scss`.

### Brand Greens
| Token | Name | Hex | Usage |
|---|---|---|---|
| `--color-forest` | Forest | `#0D2B1E` | Brand dark, primary headings, logo on light |
| `--color-pine` | Pine | `#1A7A4A` | Primary interactive — buttons, links, focus rings, logo mark |
| `--color-sage` | Sage | `#2ECC79` | Accent only — never body text; logo on dark |
| `--color-mint` | Mint | `#A8EDCA` | Highlight, selected row background |
| `--color-dew` | Dew | `#E8F5EF` | Surface tint, modal section dividers |
| `--color-paper` | Paper | `#F4FAF7` | Page background |

### Neutrals
| Token | Name | Hex | Usage |
|---|---|---|---|
| `--color-ink` | Ink | `#0F1E18` | Primary text |
| `--color-ink-mid` | Ink Mid | `#3A4F45` | Secondary text, table cells |
| `--color-ink-light` | Ink Light | `#6B7D74` | Tertiary text, timestamps, field labels |
| `--color-mist` | Mist | `#7B9E8D` | Column headers, placeholder icons |
| `--color-fog` | Fog | `#C5D8CE` | Borders, dividers, input borders |
| `--color-white` | White | `#FFFFFF` | Card/modal backgrounds |

### Semantic
| Token | Name | Hex | Usage |
|---|---|---|---|
| `--color-success` | Teal | `#0F7B6C` | In Stock badge text, success toast |
| `--color-success-bg` | Teal Light | `#E0F5F2` | In Stock badge background |
| `--color-warning` | Amber | `#E07B2A` | Low Stock badge text, warning toast |
| `--color-warning-bg` | Amber Light | `#FDF2E6` | Low Stock badge background |
| `--color-error` | Crimson | `#C0392B` | Out of Stock badge text, error toast/borders |
| `--color-error-bg` | Crimson Light | `#FDECEA` | Out of Stock badge background |
| `--color-unknown` | Mist | `#7B9E8D` | Unknown badge text |
| `--color-unknown-bg` | Fog Light | `#F0F4F2` | Unknown badge background |

---

## 3. Typography

| Role | Font | Fallback |
|---|---|---|
| Wordmark | Lora | Georgia, 'Times New Roman', serif |
| Headings / Body | DM Sans | system-ui, sans-serif |
| Monospace | DM Mono | 'Courier New', monospace |

### Type Scale
| Token | Size | Weight | Usage |
|---|---|---|---|
| `--text-display` | 34px | 700 | Wordmark only (Lora) |
| `--text-h1` | 24px | 700 | Page titles |
| `--text-h2` | 18px | 600 | Section headings, modal titles |
| `--text-h3` | 16px | 600 | Card headings |
| `--text-body` | 14px | 400 | Body text, table cells |
| `--text-label` | 11px | 600 | Column headers, field labels (uppercase, 0.08em) |
| `--text-small` | 12px | 400 | Timestamps, meta |
| `--text-mono` | 12px | 400 | SKUs, lot numbers (DM Mono) |

---

## 4. Visual Style

**Character:** Clinical precision softened by organic warmth.

**Surfaces:** Off-white Paper page background; cards/modals on true white. Borders
in Fog do most separation work; elevation (search hero, modal) via
`--shadow-search` / `--shadow-modal`.

**Borders & radius:** input/search `--radius-xl` (10px) + `--border-input`;
cards/modals `--radius-2xl` (12px) + `--border-thin`; buttons `--radius-md` (6px);
badges `--radius-pill`; table wrapper `--radius-lg` (8px).

**Focus:** `outline: 2px solid var(--color-pine); outline-offset: 2px`. Never remove.

**Motion:** `--transition-fast` (150ms ease) for color/border; spinner 750ms linear.

---

## 5. Component Styling
Component classes are defined in `stoqr-theme.scss`: `.stoqr-logo`,
`.stoqr-search`, `.stoqr-badge` (`--in-stock`/`--low-stock`/`--out-of-stock`/
`--unknown`), `.stoqr-btn` (`--primary`/`--secondary`/`--ghost`/`--danger`/`--sm`),
`.stoqr-table` + `.stoqr-table-wrap`, `.stoqr-modal*` + `.stoqr-field-group`/
`.stoqr-field`, `.stoqr-toast*`, `.stoqr-pagination*`, `.stoqr-spinner*`,
`.stoqr-refresh`, and the page shells `.stoqr-page`/`.stoqr-topbar`/`.stoqr-results`.

Refer to `stoqr-theme.scss` for the authoritative values.

---

## 6. Spacing & Layout
Spacing tokens `--space-1`…`--space-16`. Page horizontal padding: 24px (mobile),
40px (tablet ≥768), 64px (desktop ≥1024). Page max-width 1440px, centered.
Search bar hero max-width 640px. Results table 100% width in a scrollable wrapper.

---

*Stoqr Brand Identity v1.0 — in-repo copy*
