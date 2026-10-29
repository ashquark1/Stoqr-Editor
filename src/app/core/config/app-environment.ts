/** The two linked spreadsheets (AI_CONTRACT: Linked Sheets). */
export type SheetKey = 'master' | 'dr-trust';

/** `test` = duplicate spreadsheets; `live` = production spreadsheets (production build only). */
export type AppMode = 'test' | 'live';

/** One spreadsheet the app reads and writes. `tab` is config, never hard-coded. */
export interface SheetDefinition {
  readonly key: SheetKey;
  readonly label: string;
  readonly spreadsheetId: string;
  readonly tab: string;
  /**
   * Optional (US-31): the brand of the products this sheet holds, e.g. `Dr Trust`.
   * Data health uses it to find Master products missing from this sheet.
   */
  readonly brand?: string;
}

/** Shape of `src/environments/environment*.ts`. Values only; no secrets. */
export interface AppEnvironment {
  readonly production: boolean;
  readonly mode: AppMode;
  readonly google: { readonly clientId: string };
  readonly sheets: readonly SheetDefinition[];
}

const REQUIRED_KEYS: readonly SheetKey[] = ['master', 'dr-trust'];

/**
 * Checks an environment at startup and throws with a clear message instead of
 * letting a bad config reach the Sheets API. Returns the same object when valid.
 */
export function validateEnvironment(env: AppEnvironment): AppEnvironment {
  const problems: string[] = [];

  if (env.production !== (env.mode === 'live')) {
    problems.push(`production is ${env.production} but mode is '${env.mode}'`);
  }
  if (env.google.clientId.trim() === '') {
    problems.push('google.clientId is blank');
  }
  if (env.sheets.length !== REQUIRED_KEYS.length) {
    problems.push(`expected ${REQUIRED_KEYS.length} sheets, found ${env.sheets.length}`);
  }

  const keys = env.sheets.map((s) => s.key);
  for (const key of REQUIRED_KEYS) {
    const count = keys.filter((k) => k === key).length;
    if (count === 0) {
      problems.push(`sheet '${key}' is missing`);
    } else if (count > 1) {
      problems.push(`sheet '${key}' is defined ${count} times`);
    }
  }

  for (const sheet of env.sheets) {
    for (const field of ['label', 'spreadsheetId', 'tab'] as const) {
      if (sheet[field].trim() === '') {
        problems.push(`sheet '${sheet.key}' has a blank ${field}`);
      }
    }
    if (sheet.brand !== undefined && sheet.brand.trim() === '') {
      problems.push(`sheet '${sheet.key}' has a blank brand (leave it out instead)`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment config: ${problems.join('; ')}.`);
  }
  return env;
}
