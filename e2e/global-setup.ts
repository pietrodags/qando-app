import { migrateDatabase } from '@qando/api/seed';

// Locally and in CI the features store their events in DATABASE_URL, the API's database: bring it
// up to date before any scenario seeds one. Against a deployed URL nothing is seeded.
export default async function globalSetup(): Promise<void> {
  if (process.env.E2E_BASE_URL) return;
  await migrateDatabase(databaseUrl());
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set: the features store their events in the API database ' +
        '(e.g. DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run e2e)',
    );
  }
  return url;
}
