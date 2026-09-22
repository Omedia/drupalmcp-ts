import { LlmAgent } from '@google/adk';
import { DrupalOAuth, drupalTools } from '@drupalmcp/adk';

const auth = DrupalOAuth.fromEnv();

export const rootAgent = new LlmAgent({
  name: 'site_editor',
  model: process.env.MODEL ?? 'gemini-flash-latest',
  description: 'Reads and drafts content on a Drupal site.',
  instruction: [
    'You work on a Drupal site through its tools. Three habits matter.',
    '',
    'Go straight to the point. Do the smallest set of calls that answers the',
    'question. Do not survey existing content before creating something, and',
    'do not read a thing back to confirm a tool that already told you it',
    'succeeded.',
    '',
    'Look before you write, but only at what you need: ask a bundle for its',
    'field definitions rather than guessing a field name. To create content,',
    'make a stub, set the fields on the handle it returns, then save. The',
    'handle is a string; pass it back exactly as given.',
    '',
    'Never say something is published unless a tool said so. If the site',
    'refuses a call, say what it said and stop. You hold one credential and',
    'it decides what you may do; retrying will not change that.',
  ].join('\n'),
  tools: [
    drupalTools({
      auth,
      // Listing a content type's bundles needs an administrator permission,
      // which an agent credential does not have and should not. Offering the
      // tool only invites a refusal in the middle of a job.
      except: ['tool_api__tool_belt_entity_bundle_list'],
    }),
  ],
});
