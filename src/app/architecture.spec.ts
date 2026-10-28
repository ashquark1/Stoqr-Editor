import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Architecture rule tests (US-01, US-03; AI_CONTRACT.md). Each test scans the
 * source tree and lists the files that break one contract rule, so a violation
 * fails with the offending paths. Rules, not cases: add a rule here when the
 * contract gains one.
 */

interface SourceFile {
  /** Project-relative path with forward slashes, e.g. `src/app/app.ts`. */
  readonly path: string;
  readonly text: string;
  /** `text` with block and line comments removed, for rules about code only. */
  readonly code: string;
}

/** Drops comments so prose like "any feature" is not read as code. Keeps `://` in URLs. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const ROOT = process.cwd();
const SELF = 'src/app/architecture.spec.ts';

function collect(dir: string): SourceFile[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return collect(full);
    }
    const path = relative(ROOT, full).split(sep).join('/');
    if (path === SELF) {
      return [];
    }
    const text = readFileSync(full, 'utf8');
    return [{ path, text, code: stripComments(text) }];
  });
}

const files = collect(join(ROOT, 'src'));

/** Paths of files passing `filter` whose code (or raw text, incl. comments) matches. */
function offenders(
  filter: (f: SourceFile) => boolean,
  pattern: RegExp,
  source: 'code' | 'text' = 'code',
): string[] {
  return files.filter((f) => filter(f) && pattern.test(f[source])).map((f) => f.path);
}

const inApp = (f: SourceFile) => f.path.startsWith('src/app/');
const isTs = (f: SourceFile) => f.path.endsWith('.ts');
const isScss = (f: SourceFile) => f.path.endsWith('.scss');
const isComponent = (f: SourceFile) => isTs(f) && f.code.includes('@Component(');
const inSharedUi = (f: SourceFile) => f.path.startsWith('src/app/shared/ui/');
const inDataAccess = (f: SourceFile) =>
  f.path.startsWith('src/app/core/sheets/') || f.path.startsWith('src/app/core/auth/');

describe('architecture rules', () => {
  it('scans the real source tree (guards against a vacuous pass)', () => {
    expect(files.map((f) => f.path)).toContain('src/app/app.ts');
  });

  it('PrimeNG / PrimeUIX is imported only inside shared/ui', () => {
    const vendorImport = /['"](?:primeng|@primeuix\/themes)(?:\/[^'"]*)?['"]/;
    expect(offenders((f) => inApp(f) && isTs(f) && !inSharedUi(f), vendorImport)).toEqual([]);
  });

  it('no <p-*> template tag outside shared/ui', () => {
    const vendorTag = /<p-[a-z]/;
    expect(offenders((f) => inApp(f) && !inSharedUi(f), vendorTag)).toEqual([]);
  });

  it('no max-width media queries (mobile-first, min-width only)', () => {
    expect(offenders(isScss, /@media[^{]*max-width/)).toEqual([]);
  });

  it('no hex colour literals in component SCSS (use var(--token))', () => {
    expect(offenders((f) => inApp(f) && isScss(f), /#[0-9a-fA-F]{3,8}\b/)).toEqual([]);
  });

  it('no @ts-ignore / @ts-nocheck', () => {
    // These directives live in comments, so match the raw text.
    expect(offenders(isTs, /@ts-(?:ignore|nocheck)/, 'text')).toEqual([]);
  });

  it('no `any` type annotations or casts', () => {
    expect(offenders(isTs, /(?::|\bas)\s*any\b|<any>/)).toEqual([]);
  });

  it('no manual .subscribe() in components', () => {
    expect(offenders(isComponent, /\.subscribe\(/)).toEqual([]);
  });

  it('HttpClient is imported only under core/sheets or core/auth', () => {
    const httpClientImport =
      /import\s*(?:type\s*)?\{[^}]*\bHttpClient\b[^}]*\}\s*from\s*['"]@angular\/common\/http['"]/;
    expect(offenders((f) => isTs(f) && !inDataAccess(f), httpClientImport)).toEqual([]);
  });

  it('every component uses ChangeDetectionStrategy.OnPush', () => {
    const missingOnPush = files
      .filter(isComponent)
      .filter((f) => {
        const components = f.code.match(/@Component\(/g)?.length ?? 0;
        const onPush = f.code.match(/changeDetection:\s*ChangeDetectionStrategy\.OnPush/g)?.length ?? 0;
        return onPush < components;
      })
      .map((f) => f.path);
    expect(missingOnPush).toEqual([]);
  });

  it('no NgModules (standalone only)', () => {
    expect(offenders(isTs, /@NgModule\s*\(/)).toEqual([]);
  });
});

describe('auth rules (US-05)', () => {
  const inAuth = (f: SourceFile) => f.path.startsWith('src/app/core/auth/');
  const inSheets = (f: SourceFile) => f.path.startsWith('src/app/core/sheets/');

  it('Google Identity Services is touched only inside core/auth', () => {
    expect(offenders((f) => !inAuth(f), /google\.accounts|accounts\.google\.com/)).toEqual([]);
  });

  it('tokens (freshToken / accessToken) are requested only from core/auth or core/sheets', () => {
    expect(
      offenders((f) => isTs(f) && !inAuth(f) && !inSheets(f), /\.(?:freshToken|accessToken)\(/),
    ).toEqual([]);
  });

  it('core/auth and core/sheets never use browser storage or cookies', () => {
    const storage = /\b(?:localStorage|sessionStorage|indexedDB)\b|document\.cookie/;
    const offending = offenders(
      (f) => isTs(f) && (inAuth(f) || inSheets(f)) && !f.path.endsWith('.spec.ts'),
      storage,
    );
    expect(offending).toEqual([]);
  });
});

describe('sheets data-access rules (US-08)', () => {
  const inSheets = (f: SourceFile) => f.path.startsWith('src/app/core/sheets/');

  it('only sheets-writer.ts may send a mutating request (PUT/POST/PATCH/DELETE)', () => {
    // Only files that do HTTP are checked, so e.g. Map.delete() elsewhere is not a false alarm.
    const doesHttp = (f: SourceFile) =>
      f.code.includes('@angular/common/http') || /\bfetch\s*\(/.test(f.code);
    const mutating =
      /\.(?:put|post|patch|delete)\s*[<(]|['"](?:PUT|POST|PATCH|DELETE)['"]|\bmethod\s*:\s*['"](?!GET)/;
    expect(
      offenders(
        (f) => isTs(f) && doesHttp(f) && f.path !== 'src/app/core/sheets/sheets-writer.ts',
        mutating,
      ),
    ).toEqual([]);
  });

  it('RowRef internals (createRowRef, rowRefId, new RowRef) are used only in core/sheets', () => {
    expect(
      offenders((f) => isTs(f) && !inSheets(f), /\bcreateRowRef\s*\(|\browRefId\s*\(|new\s+RowRef\s*\(/),
    ).toEqual([]);
  });
});

describe('search rules (US-12)', () => {
  it('matching and validation are imported only inside core/search', () => {
    const searchInternals = /from\s*['"](?:@core\/search\/|\.\.?\/(?:[\w.-]+\/)*)(?:product-matcher|search-validation|search-fields)['"]/;
    // Spec files may import the message constants to assert on them.
    const isAppCode = (f: SourceFile) => isTs(f) && !f.path.endsWith('.spec.ts');
    expect(
      offenders((f) => isAppCode(f) && !f.path.startsWith('src/app/core/search/'), searchInternals),
    ).toEqual([]);
  });
});

describe('environment config rules (US-04)', () => {
  const ENV_DIR = 'src/environments/';
  const DEV_FILE = `${ENV_DIR}environment.development.ts`;
  const LIVE_FILE = `${ENV_DIR}environment.ts`;

  function envFile(path: string): SourceFile {
    const file = files.find((f) => f.path === path);
    if (file === undefined) {
      throw new Error(`${path} is missing`);
    }
    return file;
  }

  /** All `name: '<value>'` values in a file, in order. */
  function values(file: SourceFile, name: string): string[] {
    return [...file.code.matchAll(new RegExp(`${name}:\\s*'([^']*)'`, 'g'))].map((m) => m[1]);
  }

  /** Google spreadsheet IDs are 44 characters of [A-Za-z0-9_-]; letters and digits both occur. */
  function idLikeTokens(text: string): string[] {
    return (text.match(/[A-Za-z0-9_-]+/g) ?? []).filter(
      (t) => t.length === 44 && /\d/.test(t) && /[A-Za-z]/.test(t),
    );
  }

  it('@env is imported only by core/config/app-config.ts', () => {
    const envImport = /from\s*['"]@env\//;
    expect(
      offenders((f) => isTs(f) && f.path !== 'src/app/core/config/app-config.ts', envImport),
    ).toEqual([]);
  });

  it('no spreadsheet ID appears outside src/environments', () => {
    const leaks = files
      .filter((f) => !f.path.startsWith(ENV_DIR) && idLikeTokens(f.text).length > 0)
      .map((f) => f.path);
    expect(leaks).toEqual([]);
  });

  it.each([DEV_FILE, LIVE_FILE])('%s defines exactly master and dr-trust', (path) => {
    const file = envFile(path);
    expect(values(file, 'key').sort()).toEqual(['dr-trust', 'master']);
    expect(values(file, 'spreadsheetId').map(idLikeTokens)).toEqual([
      [expect.any(String)],
      [expect.any(String)],
    ]);
  });

  it('TEST and LIVE files share no spreadsheet ID', () => {
    const testIds = values(envFile(DEV_FILE), 'spreadsheetId');
    const liveIds = values(envFile(LIVE_FILE), 'spreadsheetId');
    expect(testIds.filter((id) => liveIds.includes(id))).toEqual([]);
  });

  it('development file is TEST; default file is LIVE', () => {
    expect(envFile(DEV_FILE).code).toMatch(/production:\s*false/);
    expect(values(envFile(DEV_FILE), 'mode')).toEqual(['test']);
    expect(envFile(LIVE_FILE).code).toMatch(/production:\s*true/);
    expect(values(envFile(LIVE_FILE), 'mode')).toEqual(['live']);
  });
});
