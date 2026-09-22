import { describe, expect, it } from 'vitest';
import { promptFrom, type AgentDefinition } from '../src/agents.js';

const base: AgentDefinition = {
  id: 'site_editor',
  label: 'Site editor',
  description: 'Drafts content.',
  instruction: 'Keep answers to two sentences.',
  context: '',
  version: 'abc123',
};

describe('promptFrom', () => {
  it('is just the instruction when the site attached no context', () => {
    expect(promptFrom(base)).toBe('Keep answers to two sentences.');
  });

  it('labels the context so the model can tell it from the instruction', () => {
    const prompt = promptFrom({ ...base, context: '- id: 4\n  guidance:\n    Write plainly.' });
    expect(prompt.startsWith('Keep answers to two sentences.')).toBe(true);
    expect(prompt).toContain('Site context');
    expect(prompt).toContain('Write plainly.');
    expect(prompt).toContain('does not override what');
  });
});
