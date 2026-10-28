/**
 * Stoqr brand tokens — the single TS source of truth for brand values.
 *
 * These literals mirror the CSS custom properties in `stoqr-theme.scss` (which
 * styles native `.stoqr-*` markup). This file feeds the PrimeNG preset
 * (`primeng-preset.ts`) so library components share the exact same palette.
 *
 * If a brand value changes, update it here AND in `stoqr-theme.scss` :root.
 */
export const brand = {
  color: {
    // Brand greens
    forest: '#0D2B1E',
    pine: '#1A7A4A',
    sage: '#2ECC79',
    mint: '#A8EDCA',
    dew: '#E8F5EF',
    paper: '#F4FAF7',
    // Neutrals
    ink: '#0F1E18',
    inkMid: '#3A4F45',
    inkLight: '#6B7D74',
    mist: '#7B9E8D',
    fog: '#C5D8CE',
    white: '#FFFFFF',
  },
  /** Green ramp (50–950) for PrimeNG's primary palette, anchored on Pine 500. */
  greenRamp: {
    50: '#E8F5EF',
    100: '#A8EDCA',
    200: '#6DD9A5',
    300: '#2ECC79',
    400: '#22A861',
    500: '#1A7A4A',
    600: '#156040',
    700: '#104A32',
    800: '#0D3626',
    900: '#0D2B1E',
    950: '#081A12',
  },
  font: {
    sans: "'DM Sans', system-ui, sans-serif",
    serif: "'Lora', Georgia, 'Times New Roman', serif",
    mono: "'DM Mono', 'Courier New', monospace",
  },
  radius: {
    sm: '5px',
    md: '6px',
    lg: '8px',
    xl: '10px',
  },
} as const;
