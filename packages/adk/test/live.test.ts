import { describe, expect, it } from 'vitest';
import { InMemoryRunner, LlmAgent } from '@google/adk';
import { DrupalOAuth, describeRefusal, drupalTools } from '../src/index.js';

/**
 * The end-to-end check, against a real site.
 *
 * Skipped unless DRUPALMCP_LIVE=1 and the four site variables are set, so a
 * plain `npm test` stays offline. Run it with `npm run test:live`.
 */
const live = process.env.DRUPALMCP_LIVE === '1' && !!process.env.DRUPAL_CLIENT_SECRET;

/** The minimum a tool needs to run outside an agent. */
const toolContext = { abortSignal: undefined } as never;

describe.skipIf(!live)('against a live Drupal site', () => {
  const auth = () => DrupalOAuth.fromEnv();

  it('mints a token for the agent credential', async () => {
    const token = await auth().token();
    expect(token.length).toBeGreaterThan(20);
  });

  it('lists the site tools, every parameter typed', async () => {
    const toolset = drupalTools({ auth: auth() });
    try {
      const tools = await toolset.getTools();
      expect(tools.length).toBeGreaterThanOrEqual(12);

      const untyped: string[] = [];
      for (const tool of tools) {
        const declaration = (tool as unknown as { _getDeclaration(): any })._getDeclaration();
        for (const [name, property] of Object.entries<any>(declaration?.parameters?.properties ?? {})) {
          if (!property?.type || property.type === 'TYPE_UNSPECIFIED') {
            untyped.push(`${declaration.name}.${name}`);
          }
        }
      }
      expect(untyped, 'parameters Gemini could not read').toEqual([]);
    } finally {
      await toolset.close();
    }
  });

  it('reads the site with a read-scoped call', async () => {
    const toolset = drupalTools({ auth: auth(), only: ['tool_api__tool_belt_entity_type_list'] });
    try {
      const [tool] = await toolset.getTools();
      const result = await (tool as any).runAsync({ args: {}, toolContext });
      expect(JSON.stringify(result)).toContain('node');
    } finally {
      await toolset.close();
    }
  });

  it('is refused when the draft credential tries to publish', async () => {
    const toolset = drupalTools({ auth: auth(), only: ['tool_api__mcp_publish_content'] });
    try {
      const [tool] = await toolset.getTools();
      expect(tool, 'the publish tool is listed even when it cannot be run').toBeDefined();

      // What the model is handed: the toolset has already turned the
      // transport error into a sentence naming the missing scope.
      let refusal: string | null = null;
      try {
        const result = await (tool as any).runAsync({
          args: { entity_type: 'node', id: '1', publish: true },
          toolContext,
        });
        refusal = describeRefusal(result);
      } catch (error) {
        refusal = (error as Error).message;
      }

      expect(refusal, 'the site should refuse a draft credential').not.toBeNull();
      expect(refusal).toContain('mcp:publish');
      expect(refusal).toContain('do not try again');
    } finally {
      await toolset.close();
    }
  });

  it('builds an agent the ADK runner accepts', async () => {
    const toolset = drupalTools({ auth: auth() });
    try {
      const agent = new LlmAgent({
        name: 'live_probe',
        model: 'gemini-flash-latest',
        instruction: 'Answer briefly.',
        tools: [toolset],
      });
      const runner = new InMemoryRunner({ agent });
      expect(runner).toBeDefined();
    } finally {
      await toolset.close();
    }
  });
});
