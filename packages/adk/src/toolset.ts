/**
 * The Drupal site's MCP tools, ready to hand to an ADK agent.
 */

import { MCPToolset } from '@google/adk/tools/mcp';
import type { BaseTool } from '@google/adk';
import { DrupalOAuth } from './auth.js';
import { describeRefusal, scopeFromChallenge } from './errors.js';
import { normaliseSchema } from './schema.js';
import { VERSION } from './version.js';

export interface DrupalToolsOptions {
  /** Site root. Defaults to the auth client's own base URL. */
  baseUrl?: string;
  /** The credential. Build one with `DrupalOAuth.fromEnv()`. */
  auth: DrupalOAuth;
  /**
   * Restrict the agent to these MCP tool names, for example
   * `['tool_api__tool_belt_entity_list']`. Omit to expose everything the
   * site publishes; the credential's scopes still decide what may run.
   */
  only?: string[];
  /** Prefix added to every tool name, for telling two sites apart. */
  prefix?: string;
}

/**
 * Connects to `{baseUrl}/mcp` and returns the tools it publishes.
 *
 * The bearer token is attached per request rather than frozen into the
 * transport, so a token expiring mid-conversation is replaced without the
 * agent noticing. Tool schemas are rewritten on the way through; see
 * {@link normaliseSchema}.
 */
export function drupalTools(options: DrupalToolsOptions): MCPToolset {
  const { auth, only, prefix } = options;
  const baseUrl = (options.baseUrl ?? auth.baseUrl).replace(/\/+$/, '');

  // The MCP client reports a refused call as an error string built from the
  // JSON-RPC body alone, and the scope that was missing travels in the
  // WWW-Authenticate header. The wrapper below is the only place that sees
  // both, so it remembers the last challenge for the message we give back.
  const lastChallenge = { value: null as string | null };

  const toolset = new MCPToolset(
    {
      type: 'StreamableHTTPConnectionParams',
      url: `${baseUrl}/mcp`,
      transportOptions: {
        fetch: async (input: string | URL | Request, init?: RequestInit) => {
          const headers = new Headers(init?.headers);
          headers.set('authorization', `Bearer ${await auth.token()}`);
          headers.set('user-agent', `drupalmcp-adk/${VERSION}`);
          const response = await globalThis.fetch(input, { ...init, headers });
          const challenge = response.headers.get('www-authenticate');
          if (challenge) {
            lastChallenge.value = challenge;
          }
          return response;
        },
      },
    },
    only,
    prefix,
  );

  return prepareTools(toolset, lastChallenge);
}

/**
 * Prepares each tool as the toolset hands it over.
 *
 * Two things happen here. The input schema is rewritten so the model can fill
 * the parameters in, and a refusal is turned into a sentence that says which
 * credential was short of which scope. ADK builds the function declaration
 * lazily from the schema on the tool object, so both are ordinary property
 * writes and no private API is reached into.
 */
function prepareTools(toolset: MCPToolset, lastChallenge: { value: string | null }): MCPToolset {
  const listTools = toolset.getTools.bind(toolset);

  toolset.getTools = async (...args: Parameters<typeof listTools>): Promise<BaseTool[]> => {
    const tools = await listTools(...args);
    for (const tool of tools) {
      const carrier = tool as unknown as {
        mcpTool?: { inputSchema?: unknown };
        runAsync(request: unknown): Promise<unknown>;
      };
      if (carrier.mcpTool?.inputSchema) {
        carrier.mcpTool.inputSchema = normaliseSchema(carrier.mcpTool.inputSchema);
      }
      const run = carrier.runAsync.bind(carrier);
      carrier.runAsync = async (request: unknown) => {
        try {
          return await run(request);
        } catch (error) {
          const explained = describeRefusal(error) ?? describeRefusal(lastChallenge.value);
          if (!explained) {
            throw error;
          }
          const scope = scopeFromChallenge(lastChallenge.value);
          throw new Error(scope && !explained.includes(scope) ? withScope(explained, scope) : explained);
        }
      };
    }
    return tools;
  };

  return toolset;
}

/** Names the missing scope in a message that had to guess without it. */
function withScope(message: string, scope: string): string {
  return message.replace('is not allowed to do that', `does not hold the ${scope} scope`);
}
