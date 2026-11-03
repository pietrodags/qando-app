import { strykerConfig } from '../../stryker.base.mjs';

const config = strykerConfig({
  breakAt: 70,
  mutate: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  vitestConfig: 'vitest-stryker.config.mts',
});

export default {
  ...config,
  // The compiled specs are bundles, so Vitest cannot tell which tests import a mutated file.
  vitest: { ...config.vitest, related: false },
  buildCommand: 'ng test --watch=false --dump-virtual-files',
};
