# Examples

Two agents, each in its own folder so the dev server only ever loads the one
you asked for.

```bash
npm install
cp .env.example .env     # then fill it in
```

## An agent that uses the site

```bash
npm run dev
```

`agents/haven` is an ordinary ADK agent holding a Drupal credential. It reads
the site, drafts content, and is refused when it tries to publish. Needs
nothing of the site beyond `drupal/mcp`.

## An agent defined in the site

```bash
npm run dev:drupal-agents
```

`drupal-agents/site-editor` takes its instructions from Drupal instead of from
this file, re-reading them every turn. It needs the **MCP Agents** module
installed on the site and an agent whose machine name matches `DRUPAL_AGENT`
in `.env`. Without those it will refuse to load and tell you so.

## Why the scripts pass `--compile false`

By default the dev server transpiles each agent into a temporary directory and
symlinks your `node_modules` next to it. When that link is not made, every
tool call fails claiming `@modelcontextprotocol/sdk` is not installed, even
though it is sitting right there. Loading the TypeScript in place avoids the
temporary directory altogether, and Node has stripped types natively since
22.18, so nothing is lost.
