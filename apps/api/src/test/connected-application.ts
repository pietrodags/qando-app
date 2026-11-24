import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { oauthClients, oauthConsents, oauthRefreshTokens } from '../db/schema.js';

/** How many rows the database holds of what an account allowed applications to do. */
export interface ConnectedApplicationRows {
  readonly consents: number;
  readonly refreshTokens: number;
}

/**
 * Stores an application of its own that the account allowed to act for it, as connecting one
 * leaves it: the application, the account's consent and a refresh token.
 */
export async function storeConnectedApplication(db: Database, userId: string): Promise<void> {
  const clientId = `https://${randomUUID()}.example/client.json`;
  await db.insert(oauthClients).values({
    id: randomUUID(),
    clientId,
    redirectUris: ['https://assistant.example/callback'],
  });
  await db
    .insert(oauthConsents)
    .values({ id: randomUUID(), clientId, userId, scopes: ['openid', 'offline_access'] });
  await db.insert(oauthRefreshTokens).values({
    id: randomUUID(),
    token: randomUUID(),
    clientId,
    userId,
    scopes: ['openid', 'offline_access'],
  });
}

/** The consents and refresh tokens the account's ID still has: none once the account is deleted. */
export async function connectedApplicationRows(
  db: Database,
  userId: string,
): Promise<ConnectedApplicationRows> {
  const [consents, refreshTokens] = await Promise.all([
    db.$count(oauthConsents, eq(oauthConsents.userId, userId)),
    db.$count(oauthRefreshTokens, eq(oauthRefreshTokens.userId, userId)),
  ]);
  return { consents, refreshTokens };
}
