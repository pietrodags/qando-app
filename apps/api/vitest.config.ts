import { defineConfig } from 'vitest/config';

// Unit tests run anywhere; integration tests need a PostgreSQL server (TEST_DATABASE_URL).
export default defineConfig({
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
