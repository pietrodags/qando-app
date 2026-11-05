// Drizzle tables, one per persisted concept. Each table arrives with the feature that needs it;
// `npm run db:generate --workspace @qando/api` turns changes here into a reviewable SQL migration.
//
// The database guards what must never be stored whatever the code does: links that collide, a
// vote for another event's option, two preferred options, degenerate date or time ranges. Rules
// about text (title and name lengths in characters as people see them) belong to the domain.
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
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

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
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
});

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
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
 * What is left of a cancelled event: its links answer "cancelled" with the title. No relation to
 * `events`: the event row is deleted in the same transaction that writes this one.
 */
export const cancelledEvents = pgTable('cancelled_events', {
  publicId: text('public_id').primaryKey(),
  resultsId: text('results_id').notNull().unique(),
  title: text('title').notNull(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }).notNull().defaultNow(),
});

export const eventsRelations = relations(events, ({ one, many }) => ({
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
