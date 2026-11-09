import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.js';
import { users } from '../db/schema.js';

/** Stores a verified account with an email of its own and answers its ID, to own test events. */
export async function storeUser(db: Database): Promise<string> {
  const id = randomUUID();
  await db
    .insert(users)
    .values({ id, name: 'Ana', email: `${id}@example.com`, emailVerified: true });
  return id;
}
