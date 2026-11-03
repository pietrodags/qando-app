import { defineConfig } from 'vitest/config';

// Unit tests run anywhere; integration tests need a PostgreSQL server (TEST_DATABASE_URL).
export default defineConfig({
  // Workspace packages are tested from their TypeScript sources, without building them first.
  ssr: { resolve: { conditions: ['@qando/source'] } },
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.integration.test.ts'],
          testTimeout: 15_000,
          hookTimeout: 15_000,
        },
      },
    ],
  },
});
