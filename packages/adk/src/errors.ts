/**
 * Turns the site's refusals into sentences an agent can repeat truthfully.
 *
 * When a credential lacks the scope a tool needs, drupal/mcp answers HTTP 403
 * with JSON-RPC code -32002, the message `insufficient_scope`, and a
 * `WWW-Authenticate` header naming the scope that was missing. Left raw, a
 * model tends to either retry forever or tell the user it published something.
 * Rewritten, it says what happened and stops.
 */

/** JSON-RPC code drupal/mcp uses for a scope refusal. */
export const INSUFFICIENT_SCOPE_CODE = -32002;

/** JSON-RPC code drupal/mcp uses when no usable credential was presented. */
export const AUTHENTICATION_REQUIRED_CODE = -32001;

/** Pulls `scope="mcp:publish"` out of a WWW-Authenticate challenge. */
export function scopeFromChallenge(challenge: string | null | undefined): string | null {
  if (!challenge) {
    return null;
  }
  const match = /scope="([^"]+)"/.exec(challenge);
  return match?.[1] ?? null;
}

/**
 * Describes a refusal in plain words, or returns null if this is not one.
 *
 * @param error
 *   Anything thrown or returned by a tool call.
 */
export function describeRefusal(error: unknown): string | null {
  const text = messageOf(error);
  if (!text) {
    return null;
  }
  if (text.includes('insufficient_scope') || text.includes(String(INSUFFICIENT_SCOPE_CODE))) {
    const scope = scopeFromChallenge(text) ?? scopeFromText(text);
    return scope
      ? `The site refused: this credential does not hold the ${scope} scope. ` +
          'Say so plainly and do not try again; a different credential is needed.'
      : 'The site refused: this credential is not allowed to do that. ' +
          'Say so plainly and do not try again.';
  }
  if (text.includes('authentication_required') || text.includes('-32001')) {
    return 'The site refused: no valid credential was presented. Check the client id and secret.';
  }
  return null;
}

function scopeFromText(text: string): string | null {
  const match = /\bmcp:[a-z]+/.exec(text);
  return match?.[0] ?? null;
}

function messageOf(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return `${error.message}`;
  }
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return '';
    }
  }
  return '';
}
