/**
 * Use a Drupal site from a Google ADK agent.
 *
 * ```ts
 * import { DrupalOAuth, drupalTools } from '@drupalmcp/adk';
 * import { LlmAgent } from '@google/adk';
 *
 * const auth = DrupalOAuth.fromEnv();
 * export const rootAgent = new LlmAgent({
 *   name: 'site_editor',
 *   model: 'gemini-flash-latest',
 *   instruction: 'Help with the Drupal site. Never say something is published unless a tool said so.',
 *   tools: [drupalTools({ auth })],
 * });
 * ```
 */

export { DrupalOAuth, type DrupalOAuthOptions } from './auth.js';
export { drupalTools, type DrupalToolsOptions } from './toolset.js';
export {
  drupalAgent,
  listAgents,
  promptFrom,
  type AgentDefinition,
  type AgentSummary,
  type DrupalAgentOptions,
} from './agents.js';
export { normaliseSchema, type JsonSchema } from './schema.js';
export {
  describeRefusal,
  scopeFromChallenge,
  AUTHENTICATION_REQUIRED_CODE,
  INSUFFICIENT_SCOPE_CODE,
} from './errors.js';
export { VERSION } from './version.js';
