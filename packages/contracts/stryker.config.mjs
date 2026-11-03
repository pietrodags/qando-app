import { strykerConfig } from '../../stryker.base.mjs';

export default strykerConfig({
  breakAt: 70,
  mutate: ['src/**/*.ts', '!src/**/*.test.ts'],
});
