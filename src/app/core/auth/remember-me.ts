/**
 * Remember me (US-67, US-68; AI_CONTRACT Auth). The ONLY file in `core/auth`
 * that may touch browser storage (besides the temporary `dev-session.ts`):
 * - `localStorage`: the record `{ remember: true, savedAt }` — no token, no
 *   name, no account id. Valid for 30 days after the last sign-in.
 * - `sessionStorage`: the one-time random `state` of the silent round trip and
 *   a flag so at most one silent attempt is made per tab.
 * The silent return is a top-level redirect to Google with `prompt=none`; the
 * token comes back in the URL fragment, is removed from the address bar at
 * once, and is handed to `Auth` (memory only). Every storage call is guarded:
 * a private window or blocked storage simply means no Remember me.
 */

const RECORD_KEY = 'stoqr-remember-me';
const STATE_KEY = 'stoqr-silent-state';
const ATTEMPT_KEY = 'stoqr-silent-attempted';

/** The record lasts this long after the last successful sign-in (owner, 2026-10-30). */
export const REMEMBER_DAYS = 30;
const REMEMBER_MS = REMEMBER_DAYS * 24 * 60 * 60 * 1000;

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

interface RememberRecord {
  readonly remember: true;
  readonly savedAt: number;
}

/** What came back from Google in the URL fragment. */
export type SilentResult =
  | {
      readonly kind: 'token';
      readonly token: string;
      readonly expiresIn: number;
      readonly scope: string;
    }
  | { readonly kind: 'failed' };

/** True when a record exists and is under 30 days old; an expired or unreadable one is deleted. */
export function hasValidRecord(now = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    if (raw === null) {
      return false;
    }
    const record = JSON.parse(raw) as Partial<RememberRecord>;
    if (
      record.remember === true &&
      typeof record.savedAt === 'number' &&
      now - record.savedAt < REMEMBER_MS
    ) {
      return true;
    }
    localStorage.removeItem(RECORD_KEY);
    return false;
  } catch {
    return false;
  }
}

/** After a successful ticked sign-in (or silent return): (re)starts the 30 days. */
export function saveRecord(now = Date.now()): void {
  try {
    const record: RememberRecord = { remember: true, savedAt: now };
    localStorage.setItem(RECORD_KEY, JSON.stringify(record));
  } catch {
    // Storage blocked: no Remember me, the app works as before.
  }
}

/** Unticked sign-in or Sign out. */
export function clearRecord(): void {
  try {
    localStorage.removeItem(RECORD_KEY);
  } catch {
    // Nothing stored.
  }
}

/** A silent attempt already ran in this tab (so a failure never loops). */
export function silentAttempted(): boolean {
  try {
    return sessionStorage.getItem(ATTEMPT_KEY) !== null;
  } catch {
    return true; // no storage: no way to guard a loop, so never try
  }
}

/**
 * The Google address for one silent attempt (`prompt=none`, no UI). Stores a
 * random `state` and marks the attempt; null when storage is unavailable.
 */
export function silentSignInUrl(
  clientId: string,
  scopes: string,
  redirectUri: string,
): string | null {
  try {
    const state = randomState();
    sessionStorage.setItem(STATE_KEY, state);
    sessionStorage.setItem(ATTEMPT_KEY, '1');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: scopes,
      prompt: 'none',
      include_granted_scopes: 'true',
      state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  } catch {
    return null;
  }
}

/**
 * Reads Google's answer from the URL fragment, once: removes it from the
 * address bar straight away, checks `state`, and returns the token or a
 * failure. Null when the page was not opened by a silent return.
 */
export function takeSilentResult(): SilentResult | null {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const params = new URLSearchParams(hash);
  if (!params.has('access_token') && !params.has('error')) {
    return null;
  }
  // Never leave a token in the address bar or history.
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  );

  let expected: string | null = null;
  try {
    expected = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
  } catch {
    expected = null;
  }
  const token = params.get('access_token');
  if (
    expected === null ||
    params.get('state') !== expected ||
    params.has('error') ||
    token === null
  ) {
    return { kind: 'failed' };
  }
  return {
    kind: 'token',
    token,
    expiresIn: Number(params.get('expires_in') ?? 0),
    scope: params.get('scope') ?? '',
  };
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
