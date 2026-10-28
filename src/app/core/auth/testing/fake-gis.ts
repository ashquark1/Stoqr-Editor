import {
  GisClientError,
  GisOAuth2,
  GisTokenClient,
  GisTokenClientConfig,
  GisTokenResponse,
} from '../gis-types';

/**
 * Test double for `google.accounts.oauth2`. Records the token-client config and
 * how many popups were requested; tests drive the outcome with `respond()` or
 * `fail()`. Test-only: imported by spec files.
 */
export class FakeGis implements GisOAuth2 {
  config: GisTokenClientConfig | null = null;
  requests = 0;
  /** What `hasGrantedAllScopes` returns: false simulates an unticked Sheets permission. */
  grantAll = true;

  initTokenClient(config: GisTokenClientConfig): GisTokenClient {
    this.config = config;
    return { requestAccessToken: () => this.requests++ };
  }

  hasGrantedAllScopes(): boolean {
    return this.grantAll;
  }

  respond(response: GisTokenResponse): void {
    this.config?.callback(response);
  }

  fail(type: GisClientError['type']): void {
    this.config?.error_callback?.({ type });
  }
}
