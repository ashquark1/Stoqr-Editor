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

export interface GisTokenClient {
  requestAccessToken(): void;
}

/** `google.accounts.oauth2`. */
export interface GisOAuth2 {
  initTokenClient(config: GisTokenClientConfig): GisTokenClient;
  hasGrantedAllScopes(response: GisTokenResponse, firstScope: string, ...rest: string[]): boolean;
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
