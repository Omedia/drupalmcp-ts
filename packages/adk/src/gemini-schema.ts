/**
 * JSON Schema to the shape Gemini's function declarations expect.
 *
 * The agent kit has a converter of its own, but it is internal and reached
 * through a lazily resolved dependency that does not always resolve. Ours is
 * a few lines, it runs on schemas we have already normalised, and it keeps
 * the whole tool path free of runtime module lookups.
 */

import { Type } from '@google/genai';
import type { Schema } from '@google/genai';
import { normaliseSchema, type JsonSchema } from './schema.js';

const TYPES: Record<string, Type> = {
  string: Type.STRING,
  number: Type.NUMBER,
  integer: Type.INTEGER,
  boolean: Type.BOOLEAN,
  array: Type.ARRAY,
  object: Type.OBJECT,
  null: Type.NULL,
};

/**
 * Converts a tool's input schema, rewriting the dialects Drupal emits first.
 */
export function toGeminiSchema(input: unknown): Schema | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  return convert(normaliseSchema(input as JsonSchema));
}

function convert(node: JsonSchema): Schema {
  const branches = Array.isArray(node.anyOf) ? (node.anyOf as JsonSchema[]) : null;
  let source = node;
  let nullable = false;

  // `anyOf: [{type: X}, {type: 'null'}]` is how an optional parameter arrives.
  // Gemini says the same thing with `nullable`.
  if (branches) {
    const real = branches.filter((b) => b?.type !== 'null');
    nullable = real.length !== branches.length;
    if (real.length === 1) {
      const { anyOf: _drop, ...rest } = node;
      source = { ...rest, ...real[0] };
    }
  }

  const declared = typeof source.type === 'string' ? source.type : inferType(source);
  const schema: Schema = { type: TYPES[declared] ?? Type.STRING };

  if (nullable || source.nullable === true) {
    schema.nullable = true;
  }
  if (typeof source.description === 'string') {
    schema.description = source.description;
  } else if (typeof source.title === 'string') {
    schema.description = source.title;
  }
  if (Array.isArray(source.enum) && source.enum.every((v) => typeof v === 'string')) {
    schema.enum = source.enum as string[];
  }

  if (schema.type === Type.OBJECT) {
    const properties = source.properties as Record<string, JsonSchema> | undefined;
    if (properties) {
      schema.properties = Object.fromEntries(
        Object.entries(properties).map(([name, value]) => [name, convert(value)]),
      );
    }
    const required = (source.required as string[] | undefined)?.filter(
      (name) => !properties || name in properties,
    );
    if (required?.length) {
      schema.required = required;
    }
  }

  if (schema.type === Type.ARRAY) {
    // Gemini rejects an array that does not say what it holds.
    schema.items = source.items ? convert(source.items as JsonSchema) : { type: Type.STRING };
  }

  return schema;
}

/** The type a schema means when it does not say. */
function inferType(node: JsonSchema): string {
  if (node.properties) return 'object';
  if (node.items) return 'array';
  if (Array.isArray(node.enum)) return 'string';
  return 'string';
}
