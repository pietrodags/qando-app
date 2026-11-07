import { strykerConfig } from '../../stryker.base.mjs';

export default strykerConfig({
  breakAt: 70,
  // `main.ts` is the process entry point: it only reads git and the files and prints.
  mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/main.ts'],
});
