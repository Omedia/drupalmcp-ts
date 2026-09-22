/**
 * The Drupal site's MCP tools, ready to hand to an ADK agent.
 *
 * These are built on the protocol SDK directly rather than on the agent kit's
 * own MCP toolset. The kit resolves the SDK lazily at the moment of the first
 * tool call, from whatever directory it happens to be running in, and when its
 * dev server transpiles an agent into a temporary folder that lookup can fail
 * with a message claiming the SDK is not installed. Importing it here, at the
 * top of the file, means it is resolved once when this module loads, and
 * bundled with the agent by anything that bundles.
 */

import { BaseTool, BaseToolset } from '@google/adk';
import type { ReadonlyContext } from '@google/adk';
import type { FunctionDeclaration } from '@google/genai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { DrupalOAuth } from './auth.js';
import { describeRefusal, scopeFromChallenge } from './errors.js';
import { toGeminiSchema } from './gemini-schema.js';
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
  /**
   * Leave these tools out. Useful for a tool the site publishes but this
   * credential can never run, such as one that needs an administrator
   * permission: offering it only invites a refusal mid-conversation.
   */
  except?: string[];
  /** Prefix added to every tool name, for telling two sites apart. */
  prefix?: string;
}

/** What the site says about one tool. */
interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

/**
 * Connects to `{baseUrl}/mcp` and returns the tools it publishes.
 *
 * The bearer token is attached per request rather than frozen into the
 * transport, so a token expiring mid-conversation is replaced without the
 * agent noticing.
 */
export function drupalTools(options: DrupalToolsOptions): DrupalToolset {
  return new DrupalToolset(options);
}

/**
 * An ADK toolset backed by one MCP session against a Drupal site.
 */
export class DrupalToolset extends BaseToolset {
  private readonly baseUrl: string;
  private readonly auth: DrupalOAuth;
  private readonly only: Set<string> | null;
  private readonly except: Set<string>;
  private readonly namePrefix: string;

  /** The last authentication challenge the site sent, if any. */
  private challenge: string | null = null;

  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(options: DrupalToolsOptions) {
    super(options.only ?? [], options.prefix);
    this.auth = options.auth;
    this.baseUrl = (options.baseUrl ?? options.auth.baseUrl).replace(/\/+$/, '');
    this.only = options.only?.length ? new Set(options.only) : null;
    this.except = new Set(options.except ?? []);
    this.namePrefix = options.prefix ?? '';
  }

  /**
   * {@inheritdoc}
   */
  async getTools(_context?: ReadonlyContext): Promise<BaseTool[]> {
    const client = await this.connect();
    const listed = (await client.listTools()).tools as McpToolDefinition[];

    return listed
      .filter((tool) => !this.except.has(tool.name) && (this.only === null || this.only.has(tool.name)))
      .map((tool) => new DrupalTool(tool, this, this.namePrefix));
  }

  /**
   * {@inheritdoc}
   */
  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.connecting = null;
    await client?.close().catch(() => undefined);
  }

  /**
   * Runs one tool, translating a refusal into something the model can use.
   *
   * @internal
   */
  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const client = await this.connect();
    try {
      return await client.callTool({ name, arguments: args });
    } catch (error) {
      const explained = describeRefusal(error) ?? describeRefusal(this.challenge);
      if (!explained) {
        throw error;
      }
      const scope = scopeFromChallenge(this.challenge);
      throw new Error(
        scope && !explained.includes(scope)
          ? explained.replace('is not allowed to do that', `does not hold the ${scope} scope`)
          : explained,
      );
    }
  }

  /** The connected client, opening the session on first use. */
  private async connect(): Promise<Client> {
    if (this.client) {
      return this.client;
    }
    this.connecting ??= this.open().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async open(): Promise<Client> {
    const client = new Client({ name: 'drupalmcp-adk', version: VERSION }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(`${this.baseUrl}/mcp`), {
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        headers.set('authorization', `Bearer ${await this.auth.token()}`);
        headers.set('user-agent', `drupalmcp-adk/${VERSION}`);
        const response = await globalThis.fetch(input, { ...init, headers });
        // The scope a call was missing travels here and nowhere else.
        const challenge = response.headers.get('www-authenticate');
        if (challenge) {
          this.challenge = challenge;
        }
        return response;
      },
    });

    await client.connect(transport);
    this.client = client;
    return client;
  }
}

/**
 * One tool the site publishes.
 */
class DrupalTool extends BaseTool {
  constructor(
    private readonly definition: McpToolDefinition,
    private readonly toolset: DrupalToolset,
    prefix: string,
  ) {
    super({
      name: prefix + definition.name,
      description: definition.description ?? definition.name,
    });
  }

  /**
   * {@inheritdoc}
   */
  override _getDeclaration(): FunctionDeclaration {
    const parameters = toGeminiSchema(this.definition.inputSchema);
    return {
      name: this.name,
      description: this.description,
      ...(parameters ? { parameters } : {}),
    };
  }

  /**
   * {@inheritdoc}
   */
  async runAsync(request: { args: Record<string, unknown> }): Promise<unknown> {
    return this.toolset.call(this.definition.name, request.args ?? {});
  }
}
