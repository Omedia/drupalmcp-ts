import { DrupalOAuth, drupalAgent } from '@drupalmcp/adk';

/**
 * An agent whose instructions live in Drupal.
 *
 * Nothing here says what the agent does. That is defined at
 * Configuration → AI → Tools and automation → Agents on the site, and read
 * again on every turn: edit the prompt there and the next answer follows.
 *
 * This needs the site to have the MCP Agents module installed and an agent
 * with the machine name below. It lives in its own folder so that
 * `adk web agents` never tries to load it against a site without them; serve
 * it with `npx adk web drupal-agents` instead.
 */
export const rootAgent = await drupalAgent({
  auth: DrupalOAuth.fromEnv(),
  id: process.env.DRUPAL_AGENT ?? 'site_editor',
});
