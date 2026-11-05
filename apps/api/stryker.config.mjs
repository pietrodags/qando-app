import { strykerConfig } from '../../stryker.base.mjs';

export default strykerConfig({
  breakAt: 70,
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    // Process entry points and test helpers: no logic of their own to test.
    '!src/main.ts',
    '!src/migrate.ts',
    '!src/test/**',
    // Covered only by the integration tests, which need PostgreSQL and are not mutated.
    '!src/db/migrate.ts',
    '!src/db/schema.ts',
    '!src/db/database.ts',
    '!src/modules/**/*-repository.ts',
  ],
  vitestConfig: 'vitest.stryker.config.ts',
});
