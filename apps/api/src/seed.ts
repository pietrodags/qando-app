import { demoEvents, linksOf } from './seed/demo-events.js';
import { openSeeder } from './seed/index.js';

// `npm run db:seed`: stores the demo events in DATABASE_URL and prints their links, built on
// QANDO_WEB_URL (the local web by default). Each run adds new events; none is ever replaced.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set: nowhere to store the demo events');
  process.exit(1);
}
const webUrl = process.env.QANDO_WEB_URL ?? 'http://localhost:4200';

const seeder = openSeeder(databaseUrl);
try {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  for (const { state, seed } of demoEvents(today)) {
    const seeded = await seeder.seed(seed);
    console.log(`\n${seed.title} (${state})`);
    for (const [label, url] of linksOf(webUrl, seeded)) console.log(`  ${label}: ${url}`);
  }
} finally {
  await seeder.close();
}
