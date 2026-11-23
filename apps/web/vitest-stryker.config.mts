import { readFile } from 'node:fs/promises';
import { VERSION } from '@angular/cli';
import { defineConfig } from 'vitest/config';

// Mutation testing only. StrykerJS cannot drive `ng test` yet, so its build command runs
// `ng test --dump-virtual-files` and this config runs the compiled specs it writes, with the
// settings the Angular CLI gives Vitest. Remove when StrykerJS supports the Angular builder.
const outputFiles = `.angular/cache/${VERSION.full}/web/unit-test/output-files`;

export default defineConfig({
  // Vitest records where each test is written only when the frame of its call is in the file it
  // runs; through a compiled spec's source map, that frame is in the spec it was compiled from. So
  // the compiled specs are loaded without the comment that names their map, and the mutation
  // testing's test runner reads each map itself (`stryker-spec-files.mjs`).
  plugins: [
    {
      name: 'compiled-specs-without-source-maps',
      enforce: 'pre',
      async load(id) {
        if (!/\/spec-[^/]*\.js$/.test(id)) {
          return null;
        }
        const code = await readFile(id, 'utf8');
        return code.replace(/^\/\/# sourceMappingURL=.*$/m, '');
      },
    },
  ],
  test: {
    root: outputFiles,
    include: ['spec-*.js'],
    setupFiles: ['init-compiler.js', 'init-testbed.js', 'vitest-mock-patch.js'],
    sequence: { setupFiles: 'list' },
    globals: true,
    isolate: false,
    environment: 'jsdom',
  },
  optimizeDeps: { noDiscovery: true },
  resolve: {
    mainFields: ['es2020', 'module', 'main'],
    conditions: ['@qando/source', 'es2015', 'es2020', 'module'],
  },
});
