import { Injectable, computed, signal } from '@angular/core';

import { environment } from '@env/environment';
import { AppMode, SheetDefinition, SheetKey, validateEnvironment } from './app-environment';

/**
 * The only reader of `src/environments/*` (US-04). Validates the environment
 * once at startup and exposes it as read-only signals; everything else reads
 * config through this service.
 */
@Injectable({ providedIn: 'root' })
export class AppConfig {
  private readonly env = validateEnvironment(environment);

  readonly mode = signal<AppMode>(this.env.mode).asReadonly();
  readonly isLive = computed(() => this.mode() === 'live');
  readonly clientId = signal(this.env.google.clientId).asReadonly();
  readonly sheets = signal<readonly SheetDefinition[]>(this.env.sheets).asReadonly();

  /** The definition for one sheet; validation guarantees both keys exist. */
  sheet(key: SheetKey): SheetDefinition {
    const found = this.sheets().find((s) => s.key === key);
    if (found === undefined) {
      throw new Error(`Sheet '${key}' is not configured.`);
    }
    return found;
  }
}
