import { DrupalOAuth, drupalAgent } from '@drupalmcp/adk';

/**
 * An agent whose instructions live in Drupal.
 *
 * Nothing here says what the agent does. That is defined at
 * Configuration → AI → Tools and automation → Agents on the site, and read
 * again on every turn: edit the prompt there and the next answer follows.
 */
export const rootAgent = await drupalAgent({
  auth: DrupalOAuth.fromEnv(),
  id: process.env.DRUPAL_AGENT ?? 'site_editor',
});
