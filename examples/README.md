# Examples

Two agents, each in its own folder so the dev server only ever loads the one
you asked for.

```bash
npm install
cp .env.example .env     # then fill it in
```

## An agent that uses the site

```bash
npx adk web agents
```

`agents/haven` is an ordinary ADK agent holding a Drupal credential. It reads
the site, drafts content, and is refused when it tries to publish. Needs
nothing of the site beyond `drupal/mcp`.

## An agent defined in the site

```bash
npx adk web drupal-agents
```

`drupal-agents/site-editor` takes its instructions from Drupal instead of from
this file, re-reading them every turn. It needs the **MCP Agents** module
installed on the site and an agent whose machine name matches `DRUPAL_AGENT`
in `.env`. Without those it will refuse to load and tell you so.
