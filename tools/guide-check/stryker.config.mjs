import { strykerConfig } from '../../stryker.base.mjs';

export default strykerConfig({
  breakAt: 70,
  // `main.ts` and `references-main.ts` are the process entry points: they only read git and the
  // files and print.
  mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/main.ts', '!src/references-main.ts'],
});
