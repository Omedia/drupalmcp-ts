# drupalmcp-ts

TypeScript libraries for using a Drupal site from an AI agent, over the
Model Context Protocol. The site side is the Drupal module
[`drupal/mcp`](https://www.drupal.org/project/mcp); this repository is the
client side.

| Package | What it is |
|---|---|
| [`@drupalmcp/adk`](packages/adk) | Drupal tools and credentials for a [Google ADK](https://adk.dev) agent |

Python, Go and Java packages will follow the same shape under the same name.

## Quick start

```bash
npm install @drupalmcp/adk @google/adk @google/adk-devtools
```

```ts
// agents/my-site/agent.ts
import { LlmAgent } from '@google/adk';
import { DrupalOAuth, drupalTools } from '@drupalmcp/adk';

export const rootAgent = new LlmAgent({
  name: 'site_editor',
  model: 'gemini-flash-latest',
  instruction: 'Help with the Drupal site. Never say something is published unless a tool said so.',
  tools: [drupalTools({ auth: DrupalOAuth.fromEnv() })],
});
```

```bash
npx adk web agents
```

Four environment variables, three of which the Drupal site prints when you
run `drush mcp:setup`:

```
GOOGLE_API_KEY=...            # https://aistudio.google.com/apikey
DRUPAL_BASE_URL=https://example.com
DRUPAL_CLIENT_ID=agent-draft
DRUPAL_CLIENT_SECRET=...
```

## What the credential decides

A Drupal site running `drupal/mcp` publishes its tools under three scopes,
and hands out one credential per job. `agent-draft` may read and write;
`agent-publish` may publish. An agent holding the draft credential can write
as much as it likes and still cannot publish, because the server refuses the
call. That refusal reaches the model as a sentence it can act on:

> The site refused: this credential does not hold the mcp:publish scope. Say
> so plainly and do not try again; a different credential is needed.

See [the security model](https://drupalmcp.io/security-model/).

## Requirements

Node 24.13 or later, and a Drupal site running `drupal/mcp` 2.0 or later.

## Working on it

```bash
npm install
npm run check                    # lint, build, test
npm --workspace @drupalmcp/adk run test:live    # needs a real site, see below
```

The live tests talk to a Drupal site and are skipped unless `DRUPALMCP_LIVE=1`
and the site variables are set. They mint a token, list the tools, read the
site and confirm the publish tool is refused.

Apache-2.0.
