import {
  GisClientError,
  GisOAuth2,
  GisTokenClient,
  GisTokenClientConfig,
  GisTokenRequestOverrides,
  GisTokenResponse,
} from '../gis-types';

/**
 * Test double for `google.accounts.oauth2`. Records the token-client config,
 * how many popups were requested, the scopes checked and the tokens revoked;
 * tests drive the outcome with `respond()` or `fail()`. Test-only: imported by
 * spec files.
 */
export class FakeGis implements GisOAuth2 {
  config: GisTokenClientConfig | null = null;
  requests = 0;
  /** Overrides passed to each `requestAccessToken` call (undefined for a plain sign-in). */
  readonly requestOverrides: (GisTokenRequestOverrides | undefined)[] = [];
  /** What `hasGrantedAllScopes` returns: false simulates an unticked Sheets permission. */
  grantAll = true;
  /** Scopes passed to each `hasGrantedAllScopes` call. */
  readonly checkedScopes: string[][] = [];
  readonly revoked: string[] = [];
  /** When true, `revoke` throws (e.g. GIS in a bad state). */
  revokeThrows = false;

  initTokenClient(config: GisTokenClientConfig): GisTokenClient {
    this.config = config;
    return {
      requestAccessToken: (overrides) => {
        this.requests++;
        this.requestOverrides.push(overrides);
      },
    };
  }

  hasGrantedAllScopes(_response: GisTokenResponse, ...scopes: string[]): boolean {
    this.checkedScopes.push(scopes);
    return this.grantAll;
  }

  revoke(accessToken: string): void {
    if (this.revokeThrows) {
      throw new Error('revoke failed');
    }
    this.revoked.push(accessToken);
  }

  respond(response: GisTokenResponse): void {
    this.config?.callback(response);
  }

  fail(type: GisClientError['type']): void {
    this.config?.error_callback?.({ type });
  }
}
