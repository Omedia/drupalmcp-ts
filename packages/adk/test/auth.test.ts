import { describe, expect, it, vi } from 'vitest';
import { DrupalOAuth } from '../src/auth.js';

/** A token endpoint that counts how often it was asked. */
function stubEndpoint(body: Record<string, unknown>, status = 200) {
  const calls: Array<{ url: string; body: string }> = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    return new Response(JSON.stringify(body), { status });
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof globalThis.fetch };
}

const credentials = { baseUrl: 'https://example.com', clientId: 'agent-draft', clientSecret: 's3cret' };

describe('DrupalOAuth', () => {
  it('asks for a client-credentials token and keeps it', async () => {
    const { calls, fetchImpl } = stubEndpoint({ access_token: 'abc', expires_in: 300, scope: 'mcp:read mcp:write' });
    const auth = new DrupalOAuth({ ...credentials, fetch: fetchImpl });

    expect(await auth.token()).toBe('abc');
    expect(await auth.token()).toBe('abc');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://example.com/oauth/token');
    expect(calls[0]!.body).toContain('grant_type=client_credentials');
    expect(calls[0]!.body).toContain('client_id=agent-draft');
    expect(auth.grantedScopes).toEqual(['mcp:read', 'mcp:write']);
  });

  it('mints again once the token is nearly expired', async () => {
    const { calls, fetchImpl } = stubEndpoint({ access_token: 'abc', expires_in: 20 });
    const auth = new DrupalOAuth({ ...credentials, fetch: fetchImpl });

    // Twenty seconds is inside the thirty-second refresh skew, so a cached
    // token is never handed out: Drupal's default lifetime is short.
    await auth.token();
    await auth.token();
    expect(calls).toHaveLength(2);
  });

  it('does not stampede when several tools ask at once', async () => {
    const { calls, fetchImpl } = stubEndpoint({ access_token: 'abc', expires_in: 300 });
    const auth = new DrupalOAuth({ ...credentials, fetch: fetchImpl });

    const tokens = await Promise.all([auth.token(), auth.token(), auth.token()]);
    expect(tokens).toEqual(['abc', 'abc', 'abc']);
    expect(calls).toHaveLength(1);
  });

  it('trims a trailing slash off the site URL', async () => {
    const { calls, fetchImpl } = stubEndpoint({ access_token: 'abc' });
    await new DrupalOAuth({ ...credentials, baseUrl: 'https://example.com/', fetch: fetchImpl }).token();
    expect(calls[0]!.url).toBe('https://example.com/oauth/token');
  });

  it('sends a scope only when one was asked for', async () => {
    const withScopes = stubEndpoint({ access_token: 'a' });
    await new DrupalOAuth({ ...credentials, scopes: ['mcp:read'], fetch: withScopes.fetchImpl }).token();
    expect(withScopes.calls[0]!.body).toContain('scope=mcp%3Aread');

    const without = stubEndpoint({ access_token: 'a' });
    await new DrupalOAuth({ ...credentials, fetch: without.fetchImpl }).token();
    expect(without.calls[0]!.body).not.toContain('scope=');
  });

  it('says what went wrong when the site refuses', async () => {
    const { fetchImpl } = stubEndpoint({ error: 'invalid_client' }, 401);
    const auth = new DrupalOAuth({ ...credentials, fetch: fetchImpl });
    await expect(auth.token()).rejects.toThrow(/HTTP 401.*invalid_client/s);
  });

  it('points at the site root when the answer is not JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('<!DOCTYPE html>', { status: 200 }));
    const auth = new DrupalOAuth({ ...credentials, fetch: fetchImpl as unknown as typeof globalThis.fetch });
    await expect(auth.token()).rejects.toThrow(/site root/);
  });

  it('refuses to be built without credentials', () => {
    expect(() => new DrupalOAuth({ baseUrl: 'https://example.com', clientId: '', clientSecret: '' })).toThrow(
      /clientId and clientSecret/,
    );
    expect(() => new DrupalOAuth({ baseUrl: '', clientId: 'a', clientSecret: 'b' })).toThrow(/baseUrl/);
  });

  it('reads the four standard variables', () => {
    const auth = DrupalOAuth.fromEnv({
      DRUPAL_BASE_URL: 'https://example.com',
      DRUPAL_CLIENT_ID: 'agent-draft',
      DRUPAL_CLIENT_SECRET: 's3cret',
      DRUPAL_SCOPES: 'mcp:read, mcp:write',
    } as NodeJS.ProcessEnv);
    expect(auth.baseUrl).toBe('https://example.com');
  });
});
