import { describe, expect, it } from 'vitest';
import { describeRefusal, scopeFromChallenge } from '../src/errors.js';

describe('describeRefusal', () => {
  it('names the missing scope when the site says so', () => {
    const message = describeRefusal(
      new Error('insufficient_scope; Bearer realm="mcp_server", error="insufficient_scope", scope="mcp:publish"'),
    );
    expect(message).toContain('mcp:publish');
    expect(message).toContain('do not try again');
  });

  it('still explains a refusal with no challenge attached', () => {
    expect(describeRefusal({ code: -32002, message: 'insufficient_scope' })).toContain('not allowed');
  });

  it('separates a missing credential from a refused one', () => {
    expect(describeRefusal(new Error('authentication_required'))).toContain('client id and secret');
  });

  it('stays out of the way for anything else', () => {
    expect(describeRefusal(new Error('connect ECONNREFUSED'))).toBeNull();
    expect(describeRefusal(undefined)).toBeNull();
  });
});

describe('scopeFromChallenge', () => {
  it('reads the scope out of a WWW-Authenticate header', () => {
    expect(scopeFromChallenge('Bearer realm="mcp_server", error="insufficient_scope", scope="mcp:publish"')).toBe(
      'mcp:publish',
    );
  });

  it('returns null when there is nothing to read', () => {
    expect(scopeFromChallenge('Bearer realm="mcp_server"')).toBeNull();
    expect(scopeFromChallenge(null)).toBeNull();
  });
});
