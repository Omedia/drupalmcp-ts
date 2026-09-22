import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { DrupalOAuth, drupalAgent, listAgents, promptFrom } from '../src/index.js';

/**
 * Deliverable 4's promise, checked against a real site: an agent defined in
 * the Drupal admin runs here, and editing its prompt in Drupal changes what
 * the next turn is told, without a restart or a cache clear.
 *
 * Needs DRUPALMCP_LIVE=1 and a site with the mcp_agents module and an agent
 * whose id is DRUPALMCP_AGENT (default site_editor). DRUPALMCP_DDEV names the
 * DDEV project used to edit the agent from outside.
 */
const live = process.env.DRUPALMCP_LIVE === '1' && !!process.env.DRUPAL_CLIENT_SECRET;
const agentId = process.env.DRUPALMCP_AGENT ?? 'site_editor';
const ddevDir = process.env.DRUPALMCP_DDEV;

/** Sets the agent's instructions in Drupal, from outside this process. */
function setInstruction(text: string): void {
  const php = `$a = \\Drupal::entityTypeManager()->getStorage("ai_agent")->load("${agentId}"); $a->set("system_prompt", "${text}"); $a->save();`;
  execFileSync('ddev', ['drush', 'php:eval', php], { cwd: ddevDir, stdio: 'pipe' });
}

describe.skipIf(!live)('an agent defined in Drupal', () => {
  const auth = () => DrupalOAuth.fromEnv();

  it('is listed by the site', async () => {
    const agents = await listAgents(auth());
    expect(agents.map((a) => a.id)).toContain(agentId);
  });

  it('builds an ADK agent from the definition', async () => {
    const agent = await drupalAgent({ auth: auth(), id: agentId });
    expect(agent.name).toBe(agentId);
    expect(typeof agent.instruction).toBe('function');
  });

  it('says what to check when the agent does not exist', async () => {
    await expect(drupalAgent({ auth: auth(), id: 'no_such_agent' })).rejects.toThrow(/Tools and automation/);
  });

  it.skipIf(!ddevDir)('follows an edit made in Drupal, with no restart', async () => {
    const original = 'You help with this website. Keep answers to two sentences.';
    try {
      setInstruction(original);
      const agent = await drupalAgent({ auth: auth(), id: agentId, cacheMs: 0 });
      const provider = agent.instruction as (ctx: unknown) => Promise<string>;

      expect(await provider({})).toContain('two sentences');

      setInstruction('You help with this website. Answer like a pirate.');
      expect(await provider({}), 'the next turn should read the new prompt').toContain('pirate');
    } finally {
      setInstruction(original);
    }
    // Three drush calls through DDEV; generous on purpose.
  }, 60_000);

  it('joins the instruction and any context the site attached', async () => {
    const agents = await listAgents(auth());
    const summary = agents.find((a) => a.id === agentId);
    const agent = await drupalAgent({ auth: auth(), id: agentId });
    const prompt = await (agent.instruction as (ctx: unknown) => Promise<string>)({});

    expect(prompt.length).toBeGreaterThan(0);
    if (summary?.has_context) {
      expect(prompt).toContain('Site context');
    }
    expect(promptFrom({ ...({} as never), instruction: prompt, context: '' })).toBe(prompt);
  });
});
