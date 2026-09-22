/**
 * Agents defined in Drupal, running in ADK.
 *
 * The site holds the definition: what the agent is for, how it should behave,
 * and whatever context the Context Control Center attaches to it. This module
 * reads that definition and re-reads it every turn, so editing the prompt in
 * the Drupal admin changes the next answer without restarting anything.
 *
 * Drupal never calls a model. It holds the definition; ADK runs it.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { LlmAgent } from '@google/adk';
import { DrupalOAuth } from './auth.js';
import { drupalTools } from './toolset.js';
import { VERSION } from './version.js';

/** Where the site lists its agents. */
const LIST_URI = 'drupal://agents';

/** How long a definition is reused before the site is asked again. */
const DEFAULT_CACHE_MS = 10_000;

export interface AgentDefinition {
  id: string;
  label: string;
  description: string;
  /** What the agent should do, as typed into the Drupal admin. */
  instruction: string;
  /** Context selected for this agent, or an empty string if there is none. */
  context: string;
  /** Changes whenever the instruction or the context does. */
  version: string;
}

export interface AgentSummary {
  id: string;
  label: string;
  description: string;
  has_context: boolean;
}

export interface DrupalAgentOptions {
  /** Site root. Defaults to the auth client's own base URL. */
  baseUrl?: string;
  auth: DrupalOAuth;
  /** The agent's machine name in Drupal, for example `site_editor`. */
  id: string;
  /** Any ADK model. Defaults to `gemini-flash-latest`. */
  model?: string;
  /** Restrict the tools handed to this agent. See `drupalTools`. */
  only?: string[];
  /** How long to reuse a definition, in milliseconds. Zero re-reads always. */
  cacheMs?: number;
}

/**
 * Builds an ADK agent from a definition held in Drupal.
 *
 * The instruction is a provider rather than a string, so it is fetched again
 * on every turn. A short cache keeps a burst of turns from hammering the
 * site while still picking an edit up within seconds, which is what makes
 * "change it in Drupal, ask again" work in front of an audience.
 */
export async function drupalAgent(options: DrupalAgentOptions): Promise<LlmAgent> {
  const { auth, id, only } = options;
  const baseUrl = (options.baseUrl ?? auth.baseUrl).replace(/\/+$/, '');
  const cacheMs = options.cacheMs ?? DEFAULT_CACHE_MS;

  const reader = new DefinitionReader(baseUrl, auth);
  const definition = await reader.read(id);

  let cached = definition;
  let fetchedAt = Date.now();

  const instruction = async (): Promise<string> => {
    if (cacheMs === 0 || Date.now() - fetchedAt > cacheMs) {
      try {
        cached = await reader.read(id);
        fetchedAt = Date.now();
      } catch {
        // The site is the source of truth, but a hiccup should not end the
        // conversation: keep using the definition we already have.
      }
    }
    return promptFrom(cached);
  };

  return new LlmAgent({
    name: definition.id,
    model: options.model ?? 'gemini-flash-latest',
    description: definition.description || definition.label,
    instruction,
    tools: [drupalTools({ baseUrl, auth, ...(only ? { only } : {}) })],
  });
}

/**
 * Every agent the site publishes.
 */
export async function listAgents(auth: DrupalOAuth, baseUrl?: string): Promise<AgentSummary[]> {
  const root = (baseUrl ?? auth.baseUrl).replace(/\/+$/, '');
  const payload = await new DefinitionReader(root, auth).readUri<{ agents: AgentSummary[] }>(LIST_URI);
  return payload.agents ?? [];
}

/**
 * The instruction and the context, as one prompt.
 *
 * The context is fenced and labelled so the model can tell the two apart: the
 * instruction is what the agent is, the context is what the site wants it to
 * keep in mind today.
 */
export function promptFrom(definition: AgentDefinition): string {
  if (!definition.context) {
    return definition.instruction;
  }
  return [
    definition.instruction,
    '',
    'Site context. Apply it where it is relevant; it does not override what',
    'the person in front of you is asking for.',
    '',
    definition.context,
  ].join('\n');
}

/**
 * Reads agent definitions over MCP, one short-lived connection at a time.
 *
 * Definitions are read rarely and the tool session is long-lived and shared
 * with the agent, so this keeps its own connection rather than borrowing one
 * and risking a reconnect in the middle of a tool call.
 */
class DefinitionReader {
  constructor(
    private readonly baseUrl: string,
    private readonly auth: DrupalOAuth,
  ) {}

  /** One agent's definition. */
  async read(id: string): Promise<AgentDefinition> {
    if (!/^[a-z0-9_]+$/.test(id)) {
      throw new Error(`"${id}" is not a Drupal agent id; expected lowercase letters, digits and underscores.`);
    }
    return this.readUri<AgentDefinition>(`${LIST_URI}/${id}`);
  }

  /** Whatever the site publishes at this resource URI, parsed as JSON. */
  async readUri<T>(uri: string): Promise<T> {
    const client = new Client(
      { name: 'drupalmcp-adk', version: VERSION },
      { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(new URL(`${this.baseUrl}/mcp`), {
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        headers.set('authorization', `Bearer ${await this.auth.token()}`);
        headers.set('user-agent', `drupalmcp-adk/${VERSION}`);
        return globalThis.fetch(input, { ...init, headers });
      },
    });

    try {
      await client.connect(transport);
      const result = await client.readResource({ uri });
      // A resource may come back as text or as a binary blob; ours is JSON.
      const first = result.contents?.[0];
      const text = first && 'text' in first ? first.text : undefined;
      if (typeof text !== 'string') {
        throw new Error(`The site returned no text for ${uri}.`);
      }
      return JSON.parse(text) as T;
    } catch (error) {
      throw new Error(explain(uri, error));
    } finally {
      await client.close().catch(() => undefined);
    }
  }
}

/** Says which resource failed, and what to check. */
function explain(uri: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Resource not found')) {
    return (
      `The site has no agent at ${uri}. Check the machine name at ` +
      'Configuration → AI → Tools and automation → Agents, and that the ' +
      'MCP Agents module is installed.'
    );
  }
  return `Could not read ${uri} from Drupal: ${message}`;
}
