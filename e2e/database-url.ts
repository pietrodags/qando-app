/**
 * The API's database, where the features store their events, locally and in CI: the run's API
 * brings it up to date before it starts (`api-process.ts`).
 */
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
