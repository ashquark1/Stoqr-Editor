/**
 * Minimal local types for the parts of Google Identity Services (GIS) the app
 * uses: the OAuth 2.0 token model. Declared here instead of adding a types
 * package; if Google changes the library, this is the single place to update.
 * Only `core/auth/` may use these.
 */

/** Response passed to the token client's `callback`. `error` is set when the user refuses. */
export interface GisTokenResponse {
  readonly access_token?: string;
  /** Seconds until the token expires. GIS documents a number; accept a numeric string too. */
  readonly expires_in?: number | string;
  readonly scope?: string;
  readonly error?: string;
  readonly error_description?: string;
}

/** Passed to `error_callback` when the popup could not complete. */
export interface GisClientError {
  readonly type: 'popup_closed' | 'popup_failed_to_open' | 'unknown';
  readonly message?: string;
}

export interface GisTokenClientConfig {
  readonly client_id: string;
  readonly scope: string;
  readonly callback: (response: GisTokenResponse) => void;
  readonly error_callback?: (error: GisClientError) => void;
}

/** Per-request overrides. `prompt: ''` asks Google not to show the account chooser or consent again. */
export interface GisTokenRequestOverrides {
  readonly prompt?: string;
}

export interface GisTokenClient {
  requestAccessToken(overrides?: GisTokenRequestOverrides): void;
}

/** Passed to `revoke`'s callback. */
export interface GisRevocationResponse {
  readonly successful: boolean;
  readonly error?: string;
}

/** `google.accounts.oauth2`. */
export interface GisOAuth2 {
  initTokenClient(config: GisTokenClientConfig): GisTokenClient;
  hasGrantedAllScopes(response: GisTokenResponse, firstScope: string, ...rest: string[]): boolean;
  /** Revokes an access token (and the grants behind it) with Google. */
  revoke(accessToken: string, done?: (response: GisRevocationResponse) => void): void;
}

/** The global the GIS script defines once loaded. */
export interface GisGlobal {
  readonly accounts: { readonly oauth2: GisOAuth2 };
}

declare global {
  interface Window {
    google?: GisGlobal;
  }
}
