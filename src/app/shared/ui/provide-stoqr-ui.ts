import { EnvironmentProviders } from '@angular/core';
import { providePrimeNG } from 'primeng/config';

import { StoqrPreset } from '@styles/primeng-preset';

/**
 * Registers the UI component library (PrimeNG, styled mode) with the Stoqr preset.
 * Lives in `shared/ui` so vendor coupling stays inside the wrapper layer: the app
 * config calls this instead of importing PrimeNG directly (US-03).
 */
export function provideStoqrUi(): EnvironmentProviders {
  return providePrimeNG({
    theme: {
      preset: StoqrPreset,
      options: {
        // PrimeNG styles go into a named @layer so our unlayered overrides win.
        cssLayer: { name: 'primeng', order: 'theme, base, primeng' },
      },
    },
  });
}
