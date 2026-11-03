import { defineConfig } from 'vitest/config';

// Mutation testing runs only the unit tests: the integration tests need PostgreSQL.
export default defineConfig({
  ssr: { resolve: { conditions: ['@qando/source'] } },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts'],
  },
});
