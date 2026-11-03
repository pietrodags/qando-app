import { VERSION } from '@angular/cli';
import { defineConfig } from 'vitest/config';

// Mutation testing only. StrykerJS cannot drive `ng test` yet, so its build command runs
// `ng test --dump-virtual-files` and this config runs the compiled specs it writes, with the
// settings the Angular CLI gives Vitest. Remove when StrykerJS supports the Angular builder.
const outputFiles = `.angular/cache/${VERSION.full}/web/unit-test/output-files`;

export default defineConfig({
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
