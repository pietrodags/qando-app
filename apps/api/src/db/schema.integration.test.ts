import { randomBytes } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFreshDatabase, type FreshDatabase } from '../test/fresh-database.js';
import { runMigrations } from './migrate.js';
import * as schema from './schema.js';
import {
  cancelledEvents,
  confirmations,
  events,
  notifications,
  oauthAccessTokens,
  oauthClientAssertions,
  oauthClientResources,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  oauthResources,
  options,
  participations,
  sessions,
  signingKeys,
  users,
  verifications,
  votes,
} from './schema.js';

describe('database schema', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let db: NodePgDatabase<typeof schema>;

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
    await runMigrations(pool);
    db = drizzle({ client: pool, schema });
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  const token = () => randomBytes(16).toString('base64url');

  async function insertUser(values: Partial<typeof users.$inferInsert> = {}) {
    const [user] = await db
      .insert(users)
      .values({ id: token(), name: 'Ana', email: `${token()}@example.com`, ...values })
      .returning();
    return user!;
  }

  async function insertSession(userId: string, values: Partial<typeof sessions.$inferInsert> = {}) {
    const [session] = await db
      .insert(sessions)
      .values({
        id: token(),
        token: token(),
        userId,
        expiresAt: new Date('2027-02-01T00:00:00Z'),
        ...values,
      })
      .returning();
    return session!;
  }

  async function insertEvent(values: Partial<typeof events.$inferInsert> = {}) {
    const ownerId = values.ownerId ?? (await insertUser()).id;
    const [event] = await db
      .insert(events)
      .values({
        ownerId,
        publicId: token(),
        resultsId: token(),
        managementTokenHash: token(),
        organizerName: 'Ana',
        organizerEmail: 'ana@example.com',
        title: 'Cena de equipo',
        timeZone: 'Europe/Madrid',
        deadline: '2026-12-01',
        closesAt: new Date('2026-12-01T22:59:59Z'),
        anonymous: false,
        ...values,
      })
      .returning();
    return event!;
  }

  async function insertOption(
    eventId: string,
    values: Partial<typeof options.$inferInsert> & { position: number },
  ) {
    const [option] = await db
      .insert(options)
      .values({ eventId, startDate: '2026-12-10', ...values })
      .returning();
    return option!;
  }

  async function insertParticipation(eventId: string, name: string | null = 'Bea') {
    const [participation] = await db
      .insert(participations)
      .values({ eventId, name, editTokenHash: token() })
      .returning();
    return participation!;
  }

  /** Runs `write` and expects PostgreSQL to refuse it with `constraint`. */
  async function expectRefusedBy(constraint: string, write: () => Promise<unknown>) {
    const error: unknown = await write().then(
      () => undefined,
      (refusal: unknown) => refusal,
    );
    expect(error, `expected ${constraint} to refuse the write`).toBeInstanceOf(Error);
    expect((error as Error).cause).toMatchObject({ constraint });
  }

  it('stores an event with its options, a participation and its votes, and reads them back', async () => {
    const event = await insertEvent({ note: 'En el sitio de siempre' });
    const wholeDay = await insertOption(event.id, { position: 0, startDate: '2026-12-10' });
    const range = await insertOption(event.id, {
      position: 1,
      startDate: '2026-12-12',
      endDate: '2026-12-14',
    });
    const evening = await insertOption(event.id, {
      position: 2,
      startDate: '2026-12-11',
      startTime: '20:00',
      endTime: '23:30',
    });
    const participation = await insertParticipation(event.id);
    await db.insert(votes).values([
      {
        participationId: participation.id,
        optionId: wholeDay.id,
        eventId: event.id,
        state: 'available',
      },
      {
        participationId: participation.id,
        optionId: range.id,
        eventId: event.id,
        state: 'preferred',
      },
      {
        participationId: participation.id,
        optionId: evening.id,
        eventId: event.id,
        state: 'unavailable',
      },
    ]);

    const stored = await db.query.events.findFirst({
      where: eq(events.id, event.id),
      with: {
        options: { orderBy: options.position },
        participations: { with: { votes: true } },
      },
    });

    expect(stored).toMatchObject({
      title: 'Cena de equipo',
      note: 'En el sitio de siempre',
      deadline: '2026-12-01',
      closesAt: new Date('2026-12-01T22:59:59Z'),
      state: 'open',
      options: [
        { startDate: '2026-12-10', endDate: null, startTime: null, endTime: null },
        { startDate: '2026-12-12', endDate: '2026-12-14', startTime: null, endTime: null },
        { startDate: '2026-12-11', endDate: null, startTime: '20:00:00', endTime: '23:30:00' },
      ],
      participations: [{ name: 'Bea' }],
    });
    expect(stored?.createdAt).toBeInstanceOf(Date);
    expect(stored?.participations[0]?.updatedAt).toBeInstanceOf(Date);
    expect(
      Object.fromEntries(
        stored!.participations[0]!.votes.map((vote) => [vote.optionId, vote.state]),
      ),
    ).toEqual({ [wholeDay.id]: 'available', [range.id]: 'preferred', [evening.id]: 'unavailable' });
  });

  it('stores an anonymous participation without a name', async () => {
    const event = await insertEvent({ anonymous: true });

    const participation = await insertParticipation(event.id, null);

    expect(participation.name).toBeNull();
  });

  describe('capability links and tokens are unique', () => {
    it.each([
      ['events_public_id_unique', 'publicId'],
      ['events_results_id_unique', 'resultsId'],
      ['events_management_token_hash_unique', 'managementTokenHash'],
    ] as const)('%s', async (constraint, column) => {
      const event = await insertEvent();

      await expectRefusedBy(constraint, () => insertEvent({ [column]: event[column] }));
    });

    it('participations_edit_token_hash_unique', async () => {
      const event = await insertEvent();
      const participation = await insertParticipation(event.id);

      await expectRefusedBy('participations_edit_token_hash_unique', () =>
        db
          .insert(participations)
          .values({ eventId: event.id, name: 'Carla', editTokenHash: participation.editTokenHash }),
      );
    });
  });

  describe('options', () => {
    it.each([
      [
        'a date range that does not end after it starts',
        { endDate: '2026-12-10' },
        'options_date_range',
      ],
      [
        'an end time that is not after the start time',
        { startTime: '20:00', endTime: '20:00' },
        'options_time_range',
      ],
      ['an end time without a start time', { endTime: '20:00' }, 'options_time_range'],
      [
        'times on a date range',
        { endDate: '2026-12-12', startTime: '20:00' },
        'options_times_on_single_date',
      ],
    ] as const)('refuses %s', async (_case, values, constraint) => {
      const event = await insertEvent();

      await expectRefusedBy(constraint, () =>
        insertOption(event.id, { position: 0, startDate: '2026-12-10', ...values }),
      );
    });

    it.each([
      ['a whole day', {}],
      ['a date range', { endDate: '2026-12-12' }],
      ['a start time', { startTime: '20:00' }],
      ['a time range', { startTime: '20:00', endTime: '22:00' }],
    ] as const)('refuses the same %s twice in one event', async (_case, values) => {
      const event = await insertEvent();
      await insertOption(event.id, { position: 0, ...values });

      await expectRefusedBy('options_unique_slot', () =>
        insertOption(event.id, { position: 1, ...values }),
      );
    });

    it('accepts the same date in two events, and different times on one date', async () => {
      const first = await insertEvent();
      const second = await insertEvent();

      await insertOption(first.id, { position: 0 });
      await insertOption(second.id, { position: 0 });
      await insertOption(first.id, { position: 1, startTime: '10:00' });
      await insertOption(first.id, { position: 2, startTime: '10:00', endTime: '12:00' });

      const stored = await db.select().from(options).where(eq(options.eventId, first.id));
      expect(stored).toHaveLength(3);
    });

    it('refuses two options in the same position', async () => {
      const event = await insertEvent();
      await insertOption(event.id, { position: 0 });

      await expectRefusedBy('options_unique_position', () =>
        insertOption(event.id, { position: 0, startDate: '2026-12-11' }),
      );
    });
  });

  describe('votes', () => {
    it('refuses a vote for an option of another event', async () => {
      const event = await insertEvent();
      const other = await insertEvent();
      const foreignOption = await insertOption(other.id, { position: 0 });
      const participation = await insertParticipation(event.id);

      await expectRefusedBy('votes_option_same_event_fk', () =>
        db.insert(votes).values({
          participationId: participation.id,
          optionId: foreignOption.id,
          eventId: event.id,
          state: 'available',
        }),
      );
      await expectRefusedBy('votes_participation_same_event_fk', () =>
        db.insert(votes).values({
          participationId: participation.id,
          optionId: foreignOption.id,
          eventId: other.id,
          state: 'available',
        }),
      );
    });

    it('refuses a second answer to the same option', async () => {
      const event = await insertEvent();
      const option = await insertOption(event.id, { position: 0 });
      const participation = await insertParticipation(event.id);
      const vote = { participationId: participation.id, optionId: option.id, eventId: event.id };
      await db.insert(votes).values({ ...vote, state: 'available' });

      await expectRefusedBy('votes_pkey', () =>
        db.insert(votes).values({ ...vote, state: 'unavailable' }),
      );
    });

    it('accepts one preferred option per participation, never two', async () => {
      const event = await insertEvent();
      const first = await insertOption(event.id, { position: 0 });
      const second = await insertOption(event.id, { position: 1, startDate: '2026-12-11' });
      const bea = await insertParticipation(event.id, 'Bea');
      const carla = await insertParticipation(event.id, 'Carla');
      const preferred = (participationId: string, optionId: string) => ({
        participationId,
        optionId,
        eventId: event.id,
        state: 'preferred' as const,
      });

      await db.insert(votes).values([preferred(bea.id, first.id), preferred(carla.id, first.id)]);

      await expectRefusedBy('votes_one_preferred', () =>
        db.insert(votes).values(preferred(bea.id, second.id)),
      );
    });
  });

  describe('confirmations', () => {
    it('stores the confirmed option of an event', async () => {
      const event = await insertEvent({ state: 'confirmed' });
      const option = await insertOption(event.id, { position: 0 });

      await db.insert(confirmations).values({ eventId: event.id, optionId: option.id });

      const stored = await db.query.confirmations.findFirst({
        where: eq(confirmations.eventId, event.id),
        with: { option: true },
      });
      expect(stored?.option.id).toBe(option.id);
      expect(stored?.confirmedAt).toBeInstanceOf(Date);
    });

    it('refuses the option of another event', async () => {
      const event = await insertEvent();
      const other = await insertEvent();
      const foreignOption = await insertOption(other.id, { position: 0 });

      await expectRefusedBy('confirmations_option_same_event_fk', () =>
        db.insert(confirmations).values({ eventId: event.id, optionId: foreignOption.id }),
      );
    });

    it('refuses a second confirmation: a confirmation is final', async () => {
      const event = await insertEvent();
      const first = await insertOption(event.id, { position: 0 });
      const second = await insertOption(event.id, { position: 1, startDate: '2026-12-11' });
      await db.insert(confirmations).values({ eventId: event.id, optionId: first.id });

      await expectRefusedBy('confirmations_pkey', () =>
        db.insert(confirmations).values({ eventId: event.id, optionId: second.id }),
      );
    });

    it('refuses to delete the confirmed option on its own', async () => {
      const event = await insertEvent();
      const option = await insertOption(event.id, { position: 0 });
      await db.insert(confirmations).values({ eventId: event.id, optionId: option.id });

      await expectRefusedBy('confirmations_option_same_event_fk', () =>
        db.delete(options).where(eq(options.id, option.id)),
      );
    });
  });

  describe('cancelled events', () => {
    it('keep the links and the title of an event that no longer exists', async () => {
      const tombstone = { publicId: token(), resultsId: token(), title: 'Cena de verano' };

      await db.insert(cancelledEvents).values(tombstone);

      const [stored] = await db
        .select()
        .from(cancelledEvents)
        .where(eq(cancelledEvents.publicId, tombstone.publicId));
      expect(stored).toMatchObject(tombstone);
      expect(stored?.cancelledAt).toBeInstanceOf(Date);
    });

    it.each([
      ['cancelled_events_pkey', 'publicId'],
      ['cancelled_events_results_id_unique', 'resultsId'],
    ] as const)('%s', async (constraint, column) => {
      const tombstone = { publicId: token(), resultsId: token(), title: 'Cena' };
      await db.insert(cancelledEvents).values(tombstone);

      await expectRefusedBy(constraint, () =>
        db.insert(cancelledEvents).values({
          publicId: token(),
          resultsId: token(),
          title: 'Otra',
          [column]: tombstone[column],
        }),
      );
    });
  });

  describe('users, sessions and sign-in codes', () => {
    it('stores a user with its sessions and the events it owns', async () => {
      const user = await insertUser({ email: 'gema@example.com', emailVerified: true });
      await insertSession(user.id, { ipAddress: '203.0.113.7', userAgent: 'Firefox' });
      const event = await insertEvent({ ownerId: user.id });

      const stored = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        with: { sessions: true, events: true },
      });

      expect(stored).toMatchObject({
        email: 'gema@example.com',
        emailVerified: true,
        image: null,
        sessions: [{ ipAddress: '203.0.113.7', userAgent: 'Firefox' }],
        events: [{ id: event.id }],
      });
      expect(stored?.createdAt).toBeInstanceOf(Date);
      expect(stored?.updatedAt).toBeInstanceOf(Date);
    });

    it('a new user has not verified the email yet', async () => {
      const user = await insertUser();

      expect(user.emailVerified).toBe(false);
    });

    it('users_email_unique', async () => {
      const user = await insertUser();

      await expectRefusedBy('users_email_unique', () => insertUser({ email: user.email }));
    });

    it('sessions_token_unique', async () => {
      const user = await insertUser();
      const session = await insertSession(user.id);

      await expectRefusedBy('sessions_token_unique', () =>
        insertSession(user.id, { token: session.token }),
      );
    });

    it('refuses an event whose owner does not exist', async () => {
      await expectRefusedBy('events_owner_fk', () => insertEvent({ ownerId: token() }));
    });

    it('refuses to delete a user who owns events', async () => {
      const user = await insertUser();
      await insertEvent({ ownerId: user.id });

      await expectRefusedBy('events_owner_fk', () => db.delete(users).where(eq(users.id, user.id)));
    });

    it('deleting a user deletes their sessions', async () => {
      const user = await insertUser();
      const session = await insertSession(user.id);

      await db.delete(users).where(eq(users.id, user.id));

      expect(await db.select().from(sessions).where(eq(sessions.id, session.id))).toEqual([]);
    });

    it('stores a sign-in code for an email that has no account yet', async () => {
      const [code] = await db
        .insert(verifications)
        .values({
          id: token(),
          identifier: 'sign-in-otp-nadie@example.com',
          value: 'hash:0',
          expiresAt: new Date('2026-11-09T10:10:00Z'),
        })
        .returning();

      expect(code).toMatchObject({ identifier: 'sign-in-otp-nadie@example.com', value: 'hash:0' });
      expect(code?.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('applications allowed to act for an account', () => {
    async function insertApplication(values: Partial<typeof oauthClients.$inferInsert> = {}) {
      const [application] = await db
        .insert(oauthClients)
        .values({
          id: token(),
          clientId: `https://${token()}.example/client.json`,
          redirectUris: ['https://assistant.example/callback'],
          ...values,
        })
        .returning();
      return application!;
    }

    async function insertResource(values: Partial<typeof oauthResources.$inferInsert> = {}) {
      const [resource] = await db
        .insert(oauthResources)
        .values({
          id: token(),
          identifier: `https://${token()}.example/api`,
          name: 'API',
          ...values,
        })
        .returning();
      return resource!;
    }

    async function insertLink(clientId: string, resourceId: string) {
      const [link] = await db
        .insert(oauthClientResources)
        .values({ id: token(), clientId, resourceId })
        .returning();
      return link!;
    }

    async function insertConsent(clientId: string, userId: string) {
      const [consent] = await db
        .insert(oauthConsents)
        .values({ id: token(), clientId, userId, scopes: ['openid'] })
        .returning();
      return consent!;
    }

    async function insertRefreshToken(
      clientId: string,
      userId: string,
      values: Partial<typeof oauthRefreshTokens.$inferInsert> = {},
    ) {
      const [refreshToken] = await db
        .insert(oauthRefreshTokens)
        .values({ id: token(), token: token(), clientId, userId, scopes: ['openid'], ...values })
        .returning();
      return refreshToken!;
    }

    async function insertAccessToken(
      clientId: string,
      values: Partial<typeof oauthAccessTokens.$inferInsert> = {},
    ) {
      const [accessToken] = await db
        .insert(oauthAccessTokens)
        .values({ id: token(), token: token(), clientId, scopes: ['openid'], ...values })
        .returning();
      return accessToken!;
    }

    const consentsOf = (clientId: string) =>
      db
        .select({ id: oauthConsents.id })
        .from(oauthConsents)
        .where(eq(oauthConsents.clientId, clientId));
    const refreshTokensOf = (clientId: string) =>
      db
        .select({ id: oauthRefreshTokens.id, sessionId: oauthRefreshTokens.sessionId })
        .from(oauthRefreshTokens)
        .where(eq(oauthRefreshTokens.clientId, clientId));
    const accessTokensOf = (clientId: string) =>
      db
        .select({ id: oauthAccessTokens.id, sessionId: oauthAccessTokens.sessionId })
        .from(oauthAccessTokens)
        .where(eq(oauthAccessTokens.clientId, clientId));
    const linksOf = (clientId: string) =>
      db
        .select({ id: oauthClientResources.id })
        .from(oauthClientResources)
        .where(eq(oauthClientResources.clientId, clientId));

    it.each([
      'signing_keys',
      'oauth_clients',
      'oauth_resources',
      'oauth_client_resources',
      'oauth_refresh_tokens',
      'oauth_access_tokens',
      'oauth_consents',
      'oauth_client_assertions',
    ])('the migrations create the table %s', async (table) => {
      const found = await pool.query<{ name: string | null }>(
        'SELECT to_regclass($1)::text AS name',
        [table],
      );

      expect(found.rows[0]?.name).toBe(table);
    });

    it('stores an application with its lists, enabled and with no scopes of its own to ask for', async () => {
      const application = await insertApplication({
        name: 'Asistente',
        redirectUris: ['https://assistant.example/callback', 'https://assistant.example/other'],
        grantTypes: ['authorization_code', 'refresh_token'],
        metadata: { software: 'assistant' },
      });

      expect(application).toMatchObject({
        name: 'Asistente',
        redirectUris: ['https://assistant.example/callback', 'https://assistant.example/other'],
        grantTypes: ['authorization_code', 'refresh_token'],
        metadata: { software: 'assistant' },
        disabled: false,
        clientCredentialsScopes: [],
        dpopBoundAccessTokens: false,
        userId: null,
      });
    });

    it('stores what tokens are issued for, enabled and in its first version', async () => {
      const resource = await insertResource({ allowedScopes: ['openid'] });

      expect(resource).toMatchObject({
        name: 'API',
        allowedScopes: ['openid'],
        disabled: false,
        dpopBoundAccessTokensRequired: false,
        policyVersion: 1,
      });
    });

    it('stores a key that signs tokens, with no expiry until it is replaced', async () => {
      const [key] = await db
        .insert(signingKeys)
        .values({
          id: token(),
          publicKey: '{"kty":"OKP"}',
          privateKey: 'encrypted',
          createdAt: new Date('2026-11-24T10:00:00Z'),
        })
        .returning();

      expect(key).toMatchObject({
        publicKey: '{"kty":"OKP"}',
        privateKey: 'encrypted',
        createdAt: new Date('2026-11-24T10:00:00Z'),
        expiresAt: null,
        alg: null,
        crv: null,
      });
    });

    it('stores an assertion an application signed in with, until it expires', async () => {
      const [assertion] = await db
        .insert(oauthClientAssertions)
        .values({ id: token(), expiresAt: new Date('2026-11-24T10:05:00Z') })
        .returning();

      expect(assertion?.expiresAt).toEqual(new Date('2026-11-24T10:05:00Z'));
    });

    it.each([
      ['oauth_clients_client_id_unique', () => insertApplication({ clientId: 'twice' })],
      ['oauth_resources_identifier_unique', () => insertResource({ identifier: 'twice' })],
    ] as const)('%s', async (constraint, insert) => {
      await insert();

      await expectRefusedBy(constraint, insert);
    });

    it.each([
      [
        'oauth_refresh_tokens_token_unique',
        (clientId: string, userId: string) =>
          insertRefreshToken(clientId, userId, { token: 'refresh-twice' }),
      ],
      [
        'oauth_access_tokens_token_unique',
        (clientId: string, userId: string) =>
          insertAccessToken(clientId, { userId, token: 'access-twice' }),
      ],
    ] as const)('%s', async (constraint, insert) => {
      const { clientId } = await insertApplication();
      const user = await insertUser();
      await insert(clientId, user.id);

      await expectRefusedBy(constraint, () => insert(clientId, user.id));
    });

    it('oauth_client_resources_pair_unique: an application is linked to a resource once', async () => {
      const { clientId } = await insertApplication();
      const first = await insertResource();
      const second = await insertResource();
      await insertLink(clientId, first.identifier);

      await expect(insertLink(clientId, second.identifier)).resolves.toBeDefined();
      await expectRefusedBy('oauth_client_resources_pair_unique', () =>
        insertLink(clientId, first.identifier),
      );
    });

    it('deleting a user deletes their consents, their refresh and access tokens and the applications registered under them', async () => {
      const user = await insertUser();
      const other = await insertUser();
      const application = await insertApplication();
      const own = await insertApplication({ userId: user.id });
      await insertConsent(application.clientId, user.id);
      await insertRefreshToken(application.clientId, user.id);
      await insertAccessToken(application.clientId, { userId: user.id });
      const kept = {
        consent: await insertConsent(application.clientId, other.id),
        refreshToken: await insertRefreshToken(application.clientId, other.id),
        accessToken: await insertAccessToken(application.clientId, { userId: other.id }),
      };

      await db.delete(users).where(eq(users.id, user.id));

      expect(await consentsOf(application.clientId)).toEqual([{ id: kept.consent.id }]);
      expect(await refreshTokensOf(application.clientId)).toEqual([
        { id: kept.refreshToken.id, sessionId: null },
      ]);
      expect(await accessTokensOf(application.clientId)).toEqual([
        { id: kept.accessToken.id, sessionId: null },
      ]);
      expect(
        await db
          .select({ id: oauthClients.id })
          .from(oauthClients)
          .where(inArray(oauthClients.id, [application.id, own.id])),
      ).toEqual([{ id: application.id }]);
    });

    it('deleting an application deletes its consents, its refresh and access tokens and its links to resources', async () => {
      const user = await insertUser();
      const application = await insertApplication();
      const other = await insertApplication();
      const resource = await insertResource();
      for (const { clientId } of [application, other]) {
        await insertConsent(clientId, user.id);
        await insertRefreshToken(clientId, user.id);
        await insertAccessToken(clientId, { userId: user.id });
        await insertLink(clientId, resource.identifier);
      }

      await db.delete(oauthClients).where(eq(oauthClients.id, application.id));

      expect(await consentsOf(application.clientId)).toEqual([]);
      expect(await refreshTokensOf(application.clientId)).toEqual([]);
      expect(await accessTokensOf(application.clientId)).toEqual([]);
      expect(await linksOf(application.clientId)).toEqual([]);
      expect(await consentsOf(other.clientId)).toHaveLength(1);
      expect(await refreshTokensOf(other.clientId)).toHaveLength(1);
      expect(await accessTokensOf(other.clientId)).toHaveLength(1);
      expect(await linksOf(other.clientId)).toHaveLength(1);
      expect(
        await db.select().from(oauthResources).where(eq(oauthResources.id, resource.id)),
      ).toHaveLength(1);
    });

    it('deleting a resource deletes its links to applications, keeping the applications', async () => {
      const application = await insertApplication();
      const resource = await insertResource();
      const other = await insertResource();
      await insertLink(application.clientId, resource.identifier);
      const kept = await insertLink(application.clientId, other.identifier);

      await db.delete(oauthResources).where(eq(oauthResources.id, resource.id));

      expect(await linksOf(application.clientId)).toEqual([{ id: kept.id }]);
      expect(
        await db.select().from(oauthClients).where(eq(oauthClients.id, application.id)),
      ).toHaveLength(1);
    });

    it('deleting a refresh token deletes the access tokens issued with it', async () => {
      const user = await insertUser();
      const { clientId } = await insertApplication();
      const refreshToken = await insertRefreshToken(clientId, user.id);
      await insertAccessToken(clientId, { userId: user.id, refreshId: refreshToken.id });
      const alone = await insertAccessToken(clientId, { userId: user.id });

      await db.delete(oauthRefreshTokens).where(eq(oauthRefreshTokens.id, refreshToken.id));

      expect(await accessTokensOf(clientId)).toEqual([{ id: alone.id, sessionId: null }]);
    });

    it('deleting a session keeps the tokens issued in it, without their session', async () => {
      const user = await insertUser();
      const session = await insertSession(user.id);
      const { clientId } = await insertApplication();
      const refreshToken = await insertRefreshToken(clientId, user.id, { sessionId: session.id });
      const accessToken = await insertAccessToken(clientId, {
        userId: user.id,
        sessionId: session.id,
      });

      await db.delete(sessions).where(eq(sessions.id, session.id));

      expect(await refreshTokensOf(clientId)).toEqual([{ id: refreshToken.id, sessionId: null }]);
      expect(await accessTokensOf(clientId)).toEqual([{ id: accessToken.id, sessionId: null }]);
    });
  });

  describe('notifications', () => {
    async function insertNotification(values: Partial<typeof notifications.$inferInsert> = {}) {
      const eventId = values.eventId ?? (await insertEvent()).id;
      const [notification] = await db
        .insert(notifications)
        .values({
          eventId,
          type: 'summary',
          recipient: 'ana@example.com',
          scheduledAt: new Date('2026-06-15T08:00:00Z'),
          ...values,
        })
        .returning();
      return notification!;
    }

    it('stores an email due at a time, pending and not tried yet', async () => {
      const event = await insertEvent();

      const stored = await insertNotification({ eventId: event.id, type: 'voting_closed' });

      expect(stored).toMatchObject({
        eventId: event.id,
        type: 'voting_closed',
        recipient: 'ana@example.com',
        scheduledAt: new Date('2026-06-15T08:00:00Z'),
        status: 'pending',
        attempts: 0,
        lastError: null,
        sentAt: null,
      });
    });

    it('notifications_event_type_unique: one email of each type per event', async () => {
      const event = await insertEvent();
      await insertNotification({ eventId: event.id, type: 'summary' });

      await expect(
        insertNotification({ eventId: event.id, type: 'voting_closed' }),
      ).resolves.toBeDefined();
      await expectRefusedBy('notifications_event_type_unique', () =>
        insertNotification({ eventId: event.id, type: 'summary' }),
      );
    });

    it.each([
      ['sent without the time it was sent', { status: 'sent' as const }],
      [
        'pending with a time it was sent',
        { status: 'pending' as const, sentAt: new Date('2026-06-15T08:00:00Z') },
      ],
      [
        'failed with a time it was sent',
        { status: 'failed' as const, sentAt: new Date('2026-06-15T08:00:00Z') },
      ],
    ])('notifications_sent_at_check: refuses an email %s', async (_, values) => {
      await expectRefusedBy('notifications_sent_at_check', () => insertNotification(values));
    });

    it('stores a sent email with the time it was sent', async () => {
      const sentAt = new Date('2026-06-15T08:00:05Z');

      await expect(insertNotification({ status: 'sent', sentAt })).resolves.toMatchObject({
        status: 'sent',
        sentAt,
      });
    });

    it('notifications_attempts_check: refuses a negative count of attempts', async () => {
      await expectRefusedBy('notifications_attempts_check', () =>
        insertNotification({ attempts: -1 }),
      );
    });
  });

  it('deleting an event deletes its options, participations, votes, confirmation and emails', async () => {
    const event = await insertEvent();
    const kept = await insertEvent();
    const option = await insertOption(event.id, { position: 0 });
    const keptOption = await insertOption(kept.id, { position: 0 });
    const participation = await insertParticipation(event.id);
    await db.insert(votes).values({
      participationId: participation.id,
      optionId: option.id,
      eventId: event.id,
      state: 'available',
    });
    await db.insert(confirmations).values({ eventId: event.id, optionId: option.id });
    await db.insert(notifications).values({
      eventId: event.id,
      type: 'summary',
      recipient: 'ana@example.com',
      scheduledAt: new Date('2026-06-15T08:00:00Z'),
    });

    await db.delete(events).where(eq(events.id, event.id));

    expect(await db.select().from(options).where(eq(options.eventId, event.id))).toEqual([]);
    expect(
      await db.select().from(participations).where(eq(participations.eventId, event.id)),
    ).toEqual([]);
    expect(await db.select().from(votes).where(eq(votes.eventId, event.id))).toEqual([]);
    expect(
      await db.select().from(confirmations).where(eq(confirmations.eventId, event.id)),
    ).toEqual([]);
    expect(
      await db.select().from(notifications).where(eq(notifications.eventId, event.id)),
    ).toEqual([]);
    expect(await db.select().from(options).where(eq(options.id, keptOption.id))).toHaveLength(1);
  });
});
