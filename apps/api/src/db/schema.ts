// Drizzle tables, one per persisted concept. Each table arrives with the feature that needs it;
// `npm run db:generate --workspace @qando/api` turns changes here into a reviewable SQL migration.
//
// The database guards what must never be stored whatever the code does: links that collide, a
// vote for another event's option, two preferred options, degenerate date or time ranges, an
// event without an owner. Rules about text (title and name lengths in characters as people see
// them) belong to the domain.
//
// `users`, `sessions`, `accounts` and `verifications` are Better Auth's core tables, read and
// written only by Better Auth (`modules/auth`): their columns follow the library, with plural
// table names and snake_case columns like the rest. Their IDs are random strings.
//
// `signingKeys` and the `oauth…` tables are the ones of Better Auth's token signing and of its
// OAuth provider, with which an account allows an application (an AI assistant) to act for it.
// They are read and written only by Better Auth too, and keep every column of the library, also
// for what qando does not offer; the library sets their dates, so none has a default.
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const eventState = pgEnum('event_state', ['open', 'closed', 'confirmed']);
export const voteState = pgEnum('vote_state', ['available', 'preferred', 'unavailable']);
export const notificationType = pgEnum('notification_type', ['summary', 'voting_closed']);
export const notificationStatus = pgEnum('notification_status', ['pending', 'sent', 'failed']);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
/** A date of the OAuth provider's tables, which the library sets. */
const at = (name: string) => timestamp(name, { withTimezone: true });

/** An organizer's account, created by the first sign-in code; the email is verified by it. */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  /** Empty when the account was created by a sign-in code; events keep their organizer's name. */
  name: text('name').notNull(),
  /** Lowercase, as Better Auth stores it. */
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  /**
   * qando's own column: when the account was last used, which is a session of it created or
   * renewed (at most once a day) or a token given to an application it allowed, or renewed by it
   * (`modules/auth`). An account that owns no event is deleted 6 months after it.
   */
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One signed-in browser; the session cookie carries `token`. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

/**
 * How a user proves who they are, besides the sign-in code: social sign-in or a password.
 * qando offers neither, so it stays empty; Better Auth's core schema requires it.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('accounts_user_id_idx').on(table.userId)],
);

/**
 * A pending sign-in code, for an email that may have no account yet: `identifier` is
 * `sign-in-otp-<email>`, `value` the code's hash and its failed attempts.
 */
export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);

/**
 * A key pair that signs the access tokens: the public part is what a token is checked with; the
 * private part is stored encrypted with the API's secret. Better Auth asks its adapter for this
 * table as `jwkss`, its `jwks` model in the plural.
 */
export const signingKeys = pgTable('signing_keys', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: at('created_at').notNull(),
  expiresAt: at('expires_at'),
  alg: text('alg'),
  crv: text('crv'),
});

/**
 * An application that asks accounts to act for them (an AI assistant), with what it says of
 * itself as OAuth names it: `clientId` is what it calls itself, `redirectUris` where it may be
 * sent back to. `userId` is the account that registered it, for the ones an account registers.
 * One read from its document goes a day after the document was last read once nobody is
 * connected to it.
 */
export const oauthClients = pgTable(
  'oauth_clients',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull().unique(),
    clientSecret: text('client_secret'),
    clientDiscoveryId: text('client_discovery_id'),
    disabled: boolean('disabled').default(false),
    skipConsent: boolean('skip_consent'),
    enableEndSession: boolean('enable_end_session'),
    subjectType: text('subject_type'),
    scopes: text('scopes').array(),
    clientCredentialsScopes: text('client_credentials_scopes').array().default([]),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    createdAt: at('created_at'),
    updatedAt: at('updated_at'),
    name: text('name'),
    uri: text('uri'),
    icon: text('icon'),
    tos: text('tos'),
    policy: text('policy'),
    contacts: text('contacts').array(),
    softwareId: text('software_id'),
    softwareVersion: text('software_version'),
    softwareStatement: text('software_statement'),
    redirectUris: text('redirect_uris').array().notNull(),
    postLogoutRedirectUris: text('post_logout_redirect_uris').array(),
    backchannelLogoutUri: text('backchannel_logout_uri'),
    backchannelLogoutSessionRequired: boolean('backchannel_logout_session_required'),
    tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
    applicationType: text('application_type'),
    jwks: text('jwks'),
    jwksUri: text('jwks_uri'),
    grantTypes: text('grant_types').array(),
    responseTypes: text('response_types').array(),
    requirePKCE: boolean('require_pkce'),
    dpopBoundAccessTokens: boolean('dpop_bound_access_tokens').default(false),
    referenceId: text('reference_id'),
    metadata: jsonb('metadata'),
  },
  (table) => [index('oauth_clients_user_id_idx').on(table.userId)],
);

/**
 * What access tokens are issued for: the address assistants call, which Better Auth stores from
 * its settings when it starts.
 */
export const oauthResources = pgTable('oauth_resources', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  accessTokenTtl: integer('access_token_ttl'),
  refreshTokenTtl: integer('refresh_token_ttl'),
  signingAlgorithm: text('signing_algorithm'),
  signingKeyId: text('signing_key_id'),
  allowedScopes: text('allowed_scopes').array(),
  customClaims: jsonb('custom_claims'),
  dpopBoundAccessTokensRequired: boolean('dpop_bound_access_tokens_required').default(false),
  disabled: boolean('disabled').default(false),
  createdAt: at('created_at'),
  updatedAt: at('updated_at'),
  policyVersion: integer('policy_version').default(1),
  metadata: jsonb('metadata'),
});

/** That an application may ask for tokens for a resource: one row per pair. */
export const oauthClientResources = pgTable(
  'oauth_client_resources',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    resourceId: text('resource_id')
      .notNull()
      .references(() => oauthResources.identifier, { onDelete: 'cascade' }),
    metadata: jsonb('metadata'),
    createdAt: at('created_at'),
  },
  (table) => [
    uniqueIndex('oauth_client_resources_pair_unique').on(table.clientId, table.resourceId),
    index('oauth_client_resources_resource_id_idx').on(table.resourceId),
  ],
);

/**
 * A refresh token (only its hash), with the account that allowed it and the application it was
 * given to. It outlives the session it was issued in, and goes with the account or the
 * application, or once past its expiry.
 */
export const oauthRefreshTokens = pgTable(
  'oauth_refresh_tokens',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    expiresAt: at('expires_at'),
    createdAt: at('created_at'),
    revoked: at('revoked'),
    rotatedAt: at('rotated_at'),
    rotationReplayResponse: text('rotation_replay_response'),
    rotationReplayExpiresAt: at('rotation_replay_expires_at'),
    authTime: at('auth_time'),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array().notNull(),
  },
  (table) => [
    index('oauth_refresh_tokens_client_id_idx').on(table.clientId),
    index('oauth_refresh_tokens_session_id_idx').on(table.sessionId),
    index('oauth_refresh_tokens_user_id_idx').on(table.userId),
    index('oauth_refresh_tokens_authorization_code_id_idx').on(table.authorizationCodeId),
  ],
);

/**
 * An access token that is not a signed one (only its hash): a signed token is checked with the
 * signing keys and never stored. It goes with the account, the application or the refresh token
 * it was issued with, or once past its expiry.
 */
export const oauthAccessTokens = pgTable(
  'oauth_access_tokens',
  {
    id: text('id').primaryKey(),
    token: text('token').unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    refreshId: text('refresh_id').references(() => oauthRefreshTokens.id, { onDelete: 'cascade' }),
    expiresAt: at('expires_at'),
    createdAt: at('created_at'),
    revoked: at('revoked'),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array().notNull(),
  },
  (table) => [
    index('oauth_access_tokens_client_id_idx').on(table.clientId),
    index('oauth_access_tokens_session_id_idx').on(table.sessionId),
    index('oauth_access_tokens_user_id_idx').on(table.userId),
    index('oauth_access_tokens_authorization_code_id_idx').on(table.authorizationCodeId),
    index('oauth_access_tokens_refresh_id_idx').on(table.refreshId),
  ],
);

/**
 * What an account allowed an application to do: a request it covers is not asked again. It goes
 * with the account or the application.
 */
export const oauthConsents = pgTable(
  'oauth_consents',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    scopes: text('scopes').array().notNull(),
    createdAt: at('created_at'),
    updatedAt: at('updated_at'),
  },
  (table) => [
    index('oauth_consents_client_id_idx').on(table.clientId),
    // One consent per account and application, whatever two answers sent at once find: a
    // second one would be listed beside the first, and withdrawing one would leave the
    // application allowed by the other. It also finds an account's consents.
    uniqueIndex('oauth_consents_user_client_unique').on(table.userId, table.clientId),
  ],
);

/**
 * A signed statement an application proved who it is with, kept until it expires so that the
 * same one is not taken twice, and deleted afterwards.
 */
export const oauthClientAssertions = pgTable('oauth_client_assertions', {
  id: text('id').primaryKey(),
  expiresAt: at('expires_at').notNull(),
});

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The account that created it; an account that owns events cannot be deleted. */
    ownerId: text('owner_id').notNull(),
    /** Participation link; kept in clear because the management page shows it again. */
    publicId: text('public_id').notNull().unique(),
    /** Results link, like `publicId`. */
    resultsId: text('results_id').notNull().unique(),
    /** Only the hash: the management link itself is shown once and never stored. */
    managementTokenHash: text('management_token_hash').notNull().unique(),
    organizerName: text('organizer_name').notNull(),
    organizerEmail: text('organizer_email').notNull(),
    title: text('title').notNull(),
    note: text('note'),
    /** IANA name, e.g. `Europe/Madrid`: the deadline and "today" are read in it. */
    timeZone: text('time_zone').notNull(),
    deadline: date('deadline').notNull(),
    /** The deadline's 23:59 in `timeZone`, stored so closing never recomputes it. */
    closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
    anonymous: boolean('anonymous').notNull(),
    state: eventState('state').notNull().default('open'),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: 'events_owner_fk',
      columns: [table.ownerId],
      foreignColumns: [users.id],
    }).onDelete('restrict'),
    index('events_owner_id_idx').on(table.ownerId),
  ],
);

/**
 * One date the organizer offers: a whole day, a range of days (`endDate`), or a single date with
 * a start time and optionally an end time.
 */
export const options = pgTable(
  'options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** Chronological order within the event, from 0. */
    position: integer('position').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    startTime: time('start_time'),
    endTime: time('end_time'),
  },
  (table) => [
    // Target of the votes' composite key, which keeps a vote inside its event.
    unique('options_id_event_unique').on(table.id, table.eventId),
    unique('options_unique_position').on(table.eventId, table.position),
    unique('options_unique_slot')
      .on(table.eventId, table.startDate, table.endDate, table.startTime, table.endTime)
      .nullsNotDistinct(),
    check(
      'options_date_range',
      sql`${table.endDate} IS NULL OR ${table.endDate} > ${table.startDate}`,
    ),
    check(
      'options_time_range',
      sql`${table.endTime} IS NULL OR (${table.startTime} IS NOT NULL AND ${table.endTime} > ${table.startTime})`,
    ),
    check(
      'options_times_on_single_date',
      sql`${table.endDate} IS NULL OR (${table.startTime} IS NULL AND ${table.endTime} IS NULL)`,
    ),
  ],
);

/** One participant's answer to an event; `name` is null on anonymous events. */
export const participations = pgTable(
  'participations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text('name'),
    /** Only the hash of the edit-vote link. */
    editTokenHash: text('edit_token_hash').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('participations_id_event_unique').on(table.id, table.eventId)],
);

/**
 * A participation's state for one option. `eventId` is repeated so that both composite keys can
 * require the participation and the option to belong to the same event.
 */
export const votes = pgTable(
  'votes',
  {
    participationId: uuid('participation_id').notNull(),
    optionId: uuid('option_id').notNull(),
    eventId: uuid('event_id').notNull(),
    state: voteState('state').notNull(),
  },
  (table) => [
    primaryKey({ name: 'votes_pkey', columns: [table.participationId, table.optionId] }),
    foreignKey({
      name: 'votes_participation_same_event_fk',
      columns: [table.participationId, table.eventId],
      foreignColumns: [participations.id, participations.eventId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'votes_option_same_event_fk',
      columns: [table.optionId, table.eventId],
      foreignColumns: [options.id, options.eventId],
    }).onDelete('cascade'),
    uniqueIndex('votes_one_preferred')
      .on(table.participationId)
      .where(sql`${table.state} = 'preferred'`),
    // Replacing an option deletes its votes (cascade): looked up by option, not by participation.
    index('votes_option_event_idx').on(table.optionId, table.eventId),
  ],
);

/**
 * The option the organizer confirmed. One row per event at most (the primary key): a confirmation
 * is final. The option must be of the same event, and cannot be deleted while it is confirmed.
 */
export const confirmations = pgTable(
  'confirmations',
  {
    eventId: uuid('event_id').primaryKey(),
    optionId: uuid('option_id').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'confirmations_event_fk',
      columns: [table.eventId],
      foreignColumns: [events.id],
    }).onDelete('cascade'),
    // No action (checked at the end of the statement): deleting the event removes both rows.
    foreignKey({
      name: 'confirmations_option_same_event_fk',
      columns: [table.optionId, table.eventId],
      foreignColumns: [options.id, options.eventId],
    }),
  ],
);

/**
 * An email of an event to its organizer, and the queue it is sent from: written in the same
 * transaction as the change that calls for it, due at `scheduledAt`, and sent by the email
 * outbox (`email/outbox.ts`), which records each attempt. One row per event and type, reused when
 * the email is due again, so a retry or a restart never sends a second one. `lastError` names
 * what failed, never with an address or a credential.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull(),
    type: notificationType('type').notNull(),
    recipient: text('recipient').notNull(),
    /** When it is due; after a failed attempt, when the next one is. */
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    status: notificationStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /**
     * The email's Message-ID, kept while it is tried again or sent again after a stop, and new
     * each time it is queued again as a new one (each closing's "voting closed").
     */
    messageId: uuid('message_id').notNull().defaultRandom(),
  },
  (table) => [
    foreignKey({
      name: 'notifications_event_fk',
      columns: [table.eventId],
      foreignColumns: [events.id],
    }).onDelete('cascade'),
    unique('notifications_event_type_unique').on(table.eventId, table.type),
    check(
      'notifications_sent_at_check',
      sql`(${table.status} = 'sent') = (${table.sentAt} IS NOT NULL)`,
    ),
    check('notifications_attempts_check', sql`${table.attempts} >= 0`),
    // The outbox looks for the pending emails that are due.
    index('notifications_due_idx')
      .on(table.scheduledAt)
      .where(sql`${table.status} = 'pending'`),
  ],
);

/**
 * What is left of a cancelled event: its links answer "cancelled" with the title. No relation to
 * `events`: the event row is deleted in the same transaction that writes this one. It goes with
 * the account that owned the event, which deleting the account deletes by `ownerId`: no key to
 * `users`, so cancelling never waits for an account being deleted. One cancelled before owners
 * were kept has none.
 */
export const cancelledEvents = pgTable(
  'cancelled_events',
  {
    publicId: text('public_id').primaryKey(),
    resultsId: text('results_id').notNull().unique(),
    title: text('title').notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }).notNull().defaultNow(),
    ownerId: text('owner_id'),
  },
  (table) => [index('cancelled_events_owner_id_idx').on(table.ownerId)],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  events: many(events),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  owner: one(users, { fields: [events.ownerId], references: [users.id] }),
  options: many(options),
  participations: many(participations),
  confirmation: one(confirmations),
}));

export const optionsRelations = relations(options, ({ one }) => ({
  event: one(events, { fields: [options.eventId], references: [events.id] }),
}));

export const participationsRelations = relations(participations, ({ one, many }) => ({
  event: one(events, { fields: [participations.eventId], references: [events.id] }),
  votes: many(votes),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  participation: one(participations, {
    fields: [votes.participationId],
    references: [participations.id],
  }),
  option: one(options, { fields: [votes.optionId], references: [options.id] }),
}));

export const confirmationsRelations = relations(confirmations, ({ one }) => ({
  event: one(events, { fields: [confirmations.eventId], references: [events.id] }),
  option: one(options, { fields: [confirmations.optionId], references: [options.id] }),
}));
