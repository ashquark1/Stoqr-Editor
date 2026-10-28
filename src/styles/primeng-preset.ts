import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

import { brand } from './brand-tokens';

/**
 * PrimeNG theme preset for Stoqr (styled mode).
 *
 * Channel B of the two-channel styling model: this maps PrimeNG's semantic
 * tokens onto the Stoqr brand palette so library components (p-table, p-dialog,
 * paginator) render on-brand. Native `.stoqr-*` markup is styled separately by
 * the CSS variables in `stoqr-theme.scss` (Channel A); both trace to
 * `brand-tokens.ts`.
 *
 * We override the PRIMARY palette (the most visible brand signal — active page,
 * focus rings, interactive accents). Neutral surfaces inherit Aura's clean
 * grayscale; brand-specific surface/spacing fine-tuning lives in the global
 * `_primeng-overrides.scss` (which can reach overlay-rendered DOM). Components
 * inherit the DM Sans body font from the page.
 */
export const StoqrPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: brand.greenRamp[50],
      100: brand.greenRamp[100],
      200: brand.greenRamp[200],
      300: brand.greenRamp[300],
      400: brand.greenRamp[400],
      500: brand.greenRamp[500],
      600: brand.greenRamp[600],
      700: brand.greenRamp[700],
      800: brand.greenRamp[800],
      900: brand.greenRamp[900],
      950: brand.greenRamp[950],
    },
    colorScheme: {
      light: {
        primary: {
          color: '{primary.500}',
          contrastColor: brand.color.white,
          hoverColor: '{primary.600}',
          activeColor: '{primary.700}',
        },
      },
    },
  },
});
