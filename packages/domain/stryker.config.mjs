import { strykerConfig } from '../../stryker.base.mjs';

export default strykerConfig({
  breakAt: 85,
  mutate: ['src/**/*.ts', '!src/**/*.test.ts'],
});
