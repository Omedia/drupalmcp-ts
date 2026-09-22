import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node24',
  // One file, no shared chunks: consumers get bundled by tools that resolve
  // relative imports from wherever they copy the package to, and a split
  // build breaks there for no benefit at this size.
  splitting: false,
});
