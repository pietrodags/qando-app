import { strykerConfig } from '../../stryker.base.mjs';

const config = strykerConfig({
  breakAt: 70,
  // The development-only pages and the tests' helpers are tools, not product: left out of the
  // build and of the score.
  mutate: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts', '!src/app/dev/**', '!src/test/**'],
  vitestConfig: 'vitest-stryker.config.mts',
});

export default {
  ...config,
  // The compiled specs are bundles, so Vitest cannot tell which tests import a mutated file.
  vitest: { ...config.vitest, related: false },
  buildCommand: 'ng test --watch=false --dump-virtual-files',
};
