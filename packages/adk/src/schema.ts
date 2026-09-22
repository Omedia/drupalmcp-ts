/**
 * Makes Drupal's tool schemas legible to Gemini.
 *
 * Drupal's Tool API describes an optional parameter as a choice between a type
 * and null: `{oneOf: [{type: 'string'}, {type: 'null'}]}`. That is correct
 * JSON Schema, but ADK's converter only understands `type` and `anyOf`, so a
 * `oneOf` property arrives at the model with no type at all and the model
 * cannot fill it in. `anyOf` says exactly the same thing in a dialect both
 * sides read, and ADK then folds the null branch into `nullable: true`.
 *
 * The second problem is a property with no type at all. Drupal emits one for
 * every entity parameter, because its typed-data system has no JSON Schema for
 * an entity and says so in a `$comment`. On the wire that parameter is a
 * string: the handle (`handle:<uuid>`) that `entity_stub` and
 * `entity_load_by_id` hand back. Without a type the model cannot fill it, so
 * the whole write path is unreachable. Where ADK's own inference gives up, a
 * string is both the safe default and, here, the right answer.
 *
 * Nothing else is touched: this is a translation, not a repair.
 */

/** A JSON Schema fragment, as loose as the wire allows. */
export type JsonSchema = Record<string, unknown>;

/** Keys whose values are schemas in their own right. */
const SCHEMA_VALUED_KEYS = ['items', 'additionalProperties', 'not', 'if', 'then', 'else'];

/** Keys holding a map of name to schema. */
const SCHEMA_MAP_KEYS = ['properties', 'patternProperties', 'definitions', '$defs'];

/** Keys holding a list of schemas. */
const SCHEMA_LIST_KEYS = ['anyOf', 'allOf', 'oneOf', 'prefixItems'];

/** Keys ADK can infer a type from. A leaf with none of them has no type. */
const TYPE_BEARING_KEYS = ['type', 'properties', '$ref', 'items', 'enum', 'const', 'anyOf', 'oneOf'];

/**
 * Rewrites a tool's input schema into the dialect ADK reads.
 *
 * Returns a new object; the input is never mutated. A schema that already has
 * `anyOf` keeps it and its `oneOf` branches are appended, which cannot happen
 * with anything Drupal emits but would otherwise lose information.
 */
export function normaliseSchema<T>(schema: T): T {
  return walk(schema, false) as T;
}

/**
 * @param node
 *   The fragment to rewrite.
 * @param isProperty
 *   Whether this fragment describes one named property, the only place where
 *   supplying a missing type is safe. The root schema and list branches are
 *   left alone.
 */
function walk(node: unknown, isProperty: boolean): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, false));
  }
  if (node === null || typeof node !== 'object') {
    return node;
  }

  const source = node as JsonSchema;
  const result: JsonSchema = {};

  for (const [key, value] of Object.entries(source)) {
    if (key === 'oneOf') {
      continue;
    }
    if (SCHEMA_MAP_KEYS.includes(key) && value && typeof value === 'object' && !Array.isArray(value)) {
      const mapped: JsonSchema = {};
      const namesAreProperties = key === 'properties' || key === 'patternProperties';
      for (const [name, child] of Object.entries(value as JsonSchema)) {
        mapped[name] = walk(child, namesAreProperties);
      }
      result[key] = mapped;
    } else if (SCHEMA_LIST_KEYS.includes(key) && Array.isArray(value)) {
      result[key] = value.map((item) => walk(item, false));
    } else if (SCHEMA_VALUED_KEYS.includes(key)) {
      result[key] = walk(value, false);
    } else {
      result[key] = value;
    }
  }

  if (Array.isArray(source.oneOf)) {
    const branches = source.oneOf.map((item) => walk(item, false));
    result.anyOf = Array.isArray(result.anyOf) ? [...result.anyOf, ...branches] : branches;
  }

  if (isProperty && !TYPE_BEARING_KEYS.some((key) => key in source)) {
    result.type = 'string';
  }

  return result;
}
