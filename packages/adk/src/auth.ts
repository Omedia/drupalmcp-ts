/**
 * OAuth 2 client credentials against a Drupal site running drupal/mcp.
 *
 * An agent runs unattended, so it authenticates as itself rather than as a
 * person: the site's `agent-draft` and `agent-publish` clients each hold a
 * fixed set of scopes, and what the agent may do is decided by which one you
 * hand it. See https://drupalmcp.io/connecting-a-client/.
 */

/** How long before expiry a token is replaced, in seconds. */
const REFRESH_SKEW_SECONDS = 30;

/** What Drupal uses when a client does not say, in seconds. */
const DEFAULT_LIFETIME_SECONDS = 300;

export interface DrupalOAuthOptions {
  /** Site root, with or without a trailing slash: `https://example.com`. */
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /**
   * Scopes to request. Omit to take everything the client is granted, which
   * is the usual case: the client is the credential, and its scopes are the
   * boundary.
   */
  scopes?: string[];
  /** Replace for tests, proxies, or a custom agent. Defaults to global fetch. */
  fetch?: typeof globalThis.fetch;
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

/**
 * Mints and caches one access token.
 *
 * A token lasts five minutes by default, so it is refreshed rather than held:
 * every call goes through {@link token}, which returns the cached one until it
 * is nearly expired. Concurrent callers share a single in-flight request.
 */
export class DrupalOAuth {
  readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly scopes: string[] | undefined;
  private readonly fetchImpl: typeof globalThis.fetch;

  private accessToken: string | null = null;
  private expiresAt = 0;
  private granted: string[] = [];
  private inFlight: Promise<string> | null = null;

  constructor(options: DrupalOAuthOptions) {
    if (!options.baseUrl) {
      throw new Error('DrupalOAuth needs a baseUrl, for example https://example.com');
    }
    if (!options.clientId || !options.clientSecret) {
      throw new Error(
        'DrupalOAuth needs a clientId and clientSecret. ' +
          'Run `drush mcp:setup --rotate-secrets` on the site to get a fresh pair.',
      );
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.scopes = options.scopes;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  /**
   * Reads the four standard variables, so an agent file stays free of secrets.
   *
   * `DRUPAL_BASE_URL`, `DRUPAL_CLIENT_ID`, `DRUPAL_CLIENT_SECRET` and the
   * optional `DRUPAL_SCOPES` (space or comma separated).
   */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): DrupalOAuth {
    const scopes = env.DRUPAL_SCOPES?.split(/[\s,]+/).filter(Boolean);
    return new DrupalOAuth({
      baseUrl: env.DRUPAL_BASE_URL ?? '',
      clientId: env.DRUPAL_CLIENT_ID ?? '',
      clientSecret: env.DRUPAL_CLIENT_SECRET ?? '',
      ...(scopes?.length ? { scopes } : {}),
    });
  }

  /** The scopes the site granted, known only after the first token. */
  get grantedScopes(): string[] {
    return [...this.granted];
  }

  /** A valid access token, minted or from cache. */
  async token(): Promise<string> {
    const now = Date.now() / 1000;
    if (this.accessToken && now < this.expiresAt - REFRESH_SKEW_SECONDS) {
      return this.accessToken;
    }
    this.inFlight ??= this.mint().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Drops the cached token so the next call mints a fresh one. */
  forget(): void {
    this.accessToken = null;
    this.expiresAt = 0;
  }

  private async mint(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    if (this.scopes?.length) {
      body.set('scope', this.scopes.join(' '));
    }

    const response = await this.fetchImpl(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `Drupal refused the client credentials (HTTP ${response.status}): ${text.slice(0, 300)}`,
      );
    }

    let data: TokenResponse;
    try {
      data = JSON.parse(text) as TokenResponse;
    } catch {
      throw new Error(
        `The token endpoint answered with something that is not JSON. ` +
          `Check that ${this.baseUrl} is the site root: ${text.slice(0, 200)}`,
      );
    }
    if (!data.access_token) {
      throw new Error(`The token endpoint returned no access_token: ${text.slice(0, 200)}`);
    }

    this.accessToken = data.access_token;
    this.expiresAt = Date.now() / 1000 + (data.expires_in ?? DEFAULT_LIFETIME_SECONDS);
    this.granted = data.scope ? data.scope.split(/\s+/).filter(Boolean) : [];
    return this.accessToken;
  }
}
