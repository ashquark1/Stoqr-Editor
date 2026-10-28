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
