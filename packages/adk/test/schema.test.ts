import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MCPTool } from '@google/adk/tools/mcp';
import { normaliseSchema } from '../src/schema.js';

/**
 * The twelve tool schemas a stock drupal/mcp site exposes, captured from a
 * real Drupal CMS install. If Drupal's Tool API changes how it describes an
 * optional parameter, this fixture is what tells us.
 */
const schemas = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/haven-tool-schemas.json', import.meta.url)), 'utf8'),
) as Record<string, Record<string, unknown>>;

/**
 * The function declaration ADK would send to Gemini for a tool with this
 * input schema. Built through the real tool class rather than ADK's internal
 * converter, so this test breaks if the path that matters changes.
 */
function declarationFor(schema: Record<string, unknown>) {
  const tool = new MCPTool(
    { name: 'probe', description: 'probe', inputSchema: schema } as never,
    null as never,
  );
  return tool._getDeclaration() as {
    parameters?: { properties?: Record<string, { type?: string; nullable?: boolean }> };
  };
}

/** Property names whose Gemini type came out unusable. */
function untypedProperties(schema: Record<string, unknown>): string[] {
  const properties = declarationFor(schema).parameters?.properties ?? {};
  return Object.entries(properties)
    .filter(([, value]) => !value?.type || value.type === 'TYPE_UNSPECIFIED')
    .map(([name]) => name);
}

describe('the schemas a Drupal site actually sends', () => {
  it('covers all twelve tools', () => {
    expect(Object.keys(schemas)).toHaveLength(12);
  });

  it('loses parameter types without the rewrite, including on the publish tool', () => {
    const damaged = Object.entries(schemas)
      .map(([name, schema]) => [name, untypedProperties(schema)] as const)
      .filter(([, properties]) => properties.length > 0);

    // This is the bug the rewrite exists for. If it ever stops happening,
    // ADK has learned oneOf and normaliseSchema can go.
    expect(damaged.length).toBeGreaterThan(0);
    expect(Object.fromEntries(damaged)).toMatchObject({
      tool_api__mcp_publish_content: expect.arrayContaining(['entity_type', 'publish']),
    });
  });

  it('gives every parameter a usable type once rewritten', () => {
    for (const [name, schema] of Object.entries(schemas)) {
      expect(untypedProperties(normaliseSchema(schema)), `${name} has untyped parameters`).toEqual([]);
    }
  });

  it('keeps the optionality it translated', () => {
    const properties =
      declarationFor(normaliseSchema(schemas.tool_api__mcp_publish_content!)).parameters?.properties ?? {};
    expect(properties.publish).toMatchObject({ type: 'BOOLEAN', nullable: true });
    expect(properties.entity_type).toMatchObject({ type: 'STRING', nullable: true });
  });

  it('types the entity handle, which Drupal cannot describe', () => {
    // Drupal has no JSON Schema for an entity, so it sends a bare description
    // and a $comment. The value is a string: the handle entity_stub returns.
    const raw = schemas.tool_api__tool_belt_entity_save!;
    expect((raw as any).properties.entity.type).toBeUndefined();

    const properties = declarationFor(normaliseSchema(raw)).parameters?.properties ?? {};
    expect(properties.entity).toMatchObject({ type: 'STRING' });
  });
});

describe('normaliseSchema', () => {
  it('rewrites oneOf as anyOf at any depth', () => {
    const input = {
      type: 'object',
      properties: {
        outer: { oneOf: [{ type: 'string' }, { type: 'null' }] },
        list: { type: 'array', items: { oneOf: [{ type: 'integer' }, { type: 'null' }] } },
      },
    };
    const output = normaliseSchema(input) as any;
    expect(output.properties.outer).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    expect(output.properties.list.items).toEqual({ anyOf: [{ type: 'integer' }, { type: 'null' }] });
  });

  it('only fills a type on named properties, never on the schema root', () => {
    const output = normaliseSchema({ description: 'no type here' }) as any;
    expect(output.type).toBeUndefined();
  });

  it('leaves a property ADK can already read alone', () => {
    const input = {
      properties: {
        a: { type: 'string' },
        b: { enum: ['x', 'y'] },
        c: { items: { type: 'string' } },
        d: { properties: { inner: { type: 'string' } } },
      },
    };
    expect(normaliseSchema(input)).toEqual(input);
  });

  it('does not mutate its input', () => {
    const input = { properties: { a: { oneOf: [{ type: 'string' }] } } };
    const copy = structuredClone(input);
    normaliseSchema(input);
    expect(input).toEqual(copy);
  });

  it('merges into an existing anyOf rather than dropping branches', () => {
    const output = normaliseSchema({
      anyOf: [{ type: 'string' }],
      oneOf: [{ type: 'integer' }],
    }) as any;
    expect(output.anyOf).toEqual([{ type: 'string' }, { type: 'integer' }]);
    expect(output.oneOf).toBeUndefined();
  });
});
