import { strykerConfig } from '../../stryker.base.mjs';

export default strykerConfig({
  breakAt: 85,
  // The vocabulary files are data (the words of each language), not logic.
  mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/vocabulary/{es,ca,en,shared}.ts'],
});
