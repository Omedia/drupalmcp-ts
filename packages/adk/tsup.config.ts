import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node24',
  splitting: false,
  // Subpath imports of a declared dependency are not matched by tsup's
  // default external list, so the whole protocol SDK was being inlined.
  external: [/^@modelcontextprotocol\/sdk/, /^@google\//],
});
