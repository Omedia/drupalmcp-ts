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
HTTP 403 with a challenge naming the missing scope. That header is dropped
before the error reaches you, so the library keeps it and gives the model a
sentence that says what happened and that retrying will not help.

**Resolves its dependencies once, at import.** The tools are built on the
protocol SDK directly rather than on the agent kit's own MCP toolset, which
looks the SDK up lazily at the first tool call from whatever directory it
happens to be running in. That lookup fails inside the dev server's temporary
build folder, reporting a missing dependency that is sitting in
`node_modules`. Importing at the top of the file cannot fail that way.

## Agents defined in Drupal

If the site has the [MCP Agents](https://www.drupal.org/project/mcp) module,
an agent's instructions can live in Drupal rather than in this file:

```ts
import { DrupalOAuth, drupalAgent } from '@drupalmcp/adk';

export const rootAgent = await drupalAgent({
  auth: DrupalOAuth.fromEnv(),
  id: 'site_editor',
});
```

The definition is read again on every turn, so editing the prompt at
Configuration → AI → Tools and automation → Agents changes the next answer
with nothing restarted. If the site also runs the Context Control Center,
whatever context it selects for that agent is appended under a heading, which
is how a tone-of-voice rule reaches an agent running outside Drupal.

`listAgents(auth)` returns what the site publishes. `cacheMs` controls how
long a definition is reused; it defaults to ten seconds and zero re-reads
every turn.

If the site has no such agent, the call refuses and says where to look rather
than failing obscurely. Keep these agents in their own folder: the ADK dev
server loads every agent in the directory you point it at, and one that cannot
reach its definition will report that at startup.

## Choosing what the agent can reach

```ts
drupalTools({ auth, only: ['tool_api__tool_belt_entity_list'] });
drupalTools({ auth, except: ['tool_api__tool_belt_entity_bundle_list'] });
```

`only` narrows the tool list and `except` removes from it. Both are a
convenience, not a boundary: what the agent may actually do is decided by the
credential's scopes on the server.

`except` earns its keep for a tool the site publishes that this credential can
never run. Listing a content type's bundles, for instance, needs an
administrator permission an agent should not have, so offering the tool only
invites a refusal in the middle of a job.

Apache-2.0. Part of [drupalmcp-ts](https://github.com/Omedia/drupalmcp-ts).
