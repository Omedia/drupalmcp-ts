# @drupalmcp/adk

Use a Drupal site from a [Google ADK](https://adk.dev) agent: OAuth
credentials, the site's tools, and the refusals that keep an agent honest.

```bash
npm install @drupalmcp/adk @google/adk
```

```ts
import { LlmAgent } from '@google/adk';
import { DrupalOAuth, drupalTools } from '@drupalmcp/adk';

export const rootAgent = new LlmAgent({
  name: 'site_editor',
  model: 'gemini-flash-latest',
  instruction: 'Help with the Drupal site.',
  tools: [drupalTools({ auth: DrupalOAuth.fromEnv() })],
});
```

`DrupalOAuth.fromEnv()` reads `DRUPAL_BASE_URL`, `DRUPAL_CLIENT_ID`,
`DRUPAL_CLIENT_SECRET` and the optional `DRUPAL_SCOPES`. The site prints the
first three when you run `drush mcp:setup`.

## What it does for you

**Keeps the token fresh.** Drupal's access tokens last five minutes by
default. The bearer is attached per request, so a token expiring in the
middle of a conversation is replaced without the agent noticing.

**Makes the tool schemas readable.** Drupal describes an optional parameter
as `oneOf: [{type: 'string'}, {type: 'null'}]`, and an entity parameter with
no type at all. Gemini understands neither, so those parameters arrive
untyped and the model cannot fill them in: the whole write path is
unreachable. `drupalTools()` rewrites both on the way through. You can use
the rewrite on its own with `normaliseSchema()`.

**Explains a refusal.** A call the credential may not make comes back as
HTTP 403 with a challenge naming the missing scope. The MCP client drops
that header, so the library keeps it and gives the model a sentence that
says what happened and that retrying will not help.

## Choosing what the agent can reach

```ts
drupalTools({ auth, only: ['tool_api__tool_belt_entity_list'] });
```

`only` narrows the tool list. It is a convenience, not a boundary: what the
agent may actually do is decided by the credential's scopes on the server.

Apache-2.0. Part of [drupalmcp-ts](https://github.com/Omedia/drupalmcp-ts).
