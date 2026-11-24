import pg from 'pg';
import { createDatabase } from './db/database.js';
import { deleteParticipant } from './retention/participant-deletion.js';
import {
  describeDeletion,
  readScriptArguments,
  usage,
} from './retention/participant-deletion-script.js';

// `npm run db:delete-participant -- <link> [name] [--yes]`: deletes one participant's vote from
// one event in DATABASE_URL, for a request sent by email; without --yes it only says what it
// would delete.
const read = readScriptArguments(process.argv.slice(2));
if ('problem' in read) {
  console.error(`${read.problem}\n\n${usage}`);
  process.exit(1);
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set: no database to delete the vote from');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
try {
  const deletion = await deleteParticipant(createDatabase(pool), read.request, read.confirmed);
  console.log(describeDeletion(read.request, deletion));
} finally {
  await pool.end();
}
