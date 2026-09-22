import { LlmAgent } from '@google/adk';
import { DrupalOAuth, drupalTools } from '@drupalmcp/adk';

const auth = DrupalOAuth.fromEnv();

export const rootAgent = new LlmAgent({
  name: 'site_editor',
  model: process.env.MODEL ?? 'gemini-flash-latest',
  description: 'Reads and drafts content on a Drupal site.',
  instruction: [
    'You work on a Drupal site through its tools. Two habits matter.',
    '',
    'Look before you write. The site tells you which content types exist and',
    'which fields they have, so ask it rather than guessing a field name.',
    'To create something: make a stub, set the fields you need on the handle',
    'it returns, then save it. The handle is a string; pass it back exactly.',
    '',
    'Never say something is published unless a tool told you it is. If the',
    'site refuses a call, say what it said and stop. You hold one credential',
    'and it decides what you may do; retrying will not change that.',
  ].join('\n'),
  tools: [drupalTools({ auth })],
});
