import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import type { EventCreated } from '@qando/contracts';
import type { NewEvent } from '@qando/domain';
import { hashCapabilityToken, newCapabilityToken } from '../../capability-token.js';
import type { Database } from '../../db/database.js';
import { optionColumns, optionFromRow } from '../../db/option-row.js';
import { events, options, users } from '../../db/schema.js';
import { scheduleEmail, scheduleVotingClosed } from '../../email/outbox.js';
import type { NewEvents } from './create-event.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * The stored events behind `NewEvents`. The account is locked first, so two events it creates at
 * once wait for each other: the first names it once, and a repeat of the same token, or of the
 * same event from an assistant, finds the event the first stored. The event's email is the
 * account's, as Better Auth stores it. Only the management token's hash is stored, unique: an
 * insert that meets it stores nothing, and the event that holds it is answered (another
 * account's, once the insert has waited for it, is `taken`). Each event is stamped with the
 * clock's time (`now`), read once, which the counts of an assistant's events are taken on. Its
 * emails are queued to the account's email in the same transaction: the summary, due at that
 * time, and "voting closed", due once voting closes.
 */
export function createNewEvents(db: Database, now: () => Date): NewEvents {
  return {
    create: (ownerId, managementToken, event) =>
      db.transaction(async (tx) => {
        const account = await lockedAccount(tx, ownerId);
        const tokenHash = hashCapabilityToken(managementToken);
        const links = await store(tx, { ownerId, account, tokenHash, event, at: now() });
        return links ?? eventHolding(tx, tokenHash, ownerId);
      }),
    createOnce: (ownerId, event, { sameWithinMs, atMost }) =>
      db.transaction(async (tx) => {
        const account = await lockedAccount(tx, ownerId);
        const at = now();
        const same = await sameEvent(tx, ownerId, event, since(at, sameWithinMs));
        if (same) return same;
        const recent = await tx
          .select({ createdAt: events.createdAt })
          .from(events)
          .where(and(eq(events.ownerId, ownerId), gt(events.createdAt, since(at, atMost.withinMs))))
          .orderBy(asc(events.createdAt));
        const freeing = recent.at(-atMost.count);
        if (freeing) return { retryAt: new Date(freeing.createdAt.getTime() + atMost.withinMs) };
        const tokenHash = hashCapabilityToken(newCapabilityToken());
        const links = await store(tx, { ownerId, account, tokenHash, event, at });
        // Stryker disable next-line all: a new token of 128 random bits is never held already;
        // the check is for the compiler.
        if (!links) throw new Error('A new management token is held already');
        return links;
      }),
    lastOrganizerName: async (ownerId) => {
      const [last] = await db
        .select({ organizerName: events.organizerName })
        .from(events)
        .where(eq(events.ownerId, ownerId))
        .orderBy(desc(events.createdAt))
        .limit(1);
      return last?.organizerName;
    },
  };
}

/** The moment `ms` before `at`. */
const since = (at: Date, ms: number) => new Date(at.getTime() - ms);

/** The account's name and email, its row locked until the transaction ends. */
async function lockedAccount(tx: Transaction, ownerId: string): Promise<Account> {
  const [account] = await tx
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, ownerId))
    .for('update');
  if (!account) throw new Error('The account of the session no longer exists');
  return account;
}

interface Account {
  readonly name: string;
  readonly email: string;
}

/**
 * Stores the event behind two new links, with its options and its emails, and names an account
 * without a name after its organizer; nothing when the token's hash is held already.
 */
async function store(
  tx: Transaction,
  {
    ownerId,
    account,
    tokenHash,
    event,
    at,
  }: { ownerId: string; account: Account; tokenHash: string; event: NewEvent; at: Date },
): Promise<EventCreated | undefined> {
  const links = { participationId: newCapabilityToken(), resultsId: newCapabilityToken() };
  const [stored] = await tx
    .insert(events)
    .values({
      ownerId,
      publicId: links.participationId,
      resultsId: links.resultsId,
      managementTokenHash: tokenHash,
      organizerName: event.organizerName,
      organizerEmail: account.email,
      title: event.title,
      note: event.note,
      timeZone: event.timeZone,
      deadline: event.deadline,
      closesAt: event.closesAt,
      anonymous: event.anonymous,
      createdAt: at,
    })
    .onConflictDoNothing({ target: events.managementTokenHash })
    .returning({ id: events.id });
  if (!stored) return undefined;
  await scheduleEmail(tx, { eventId: stored.id, type: 'summary', recipient: account.email, at });
  await scheduleVotingClosed(tx, {
    eventId: stored.id,
    recipient: account.email,
    closesAt: event.closesAt,
  });

  if (account.name === '') {
    await tx
      .update(users)
      .set({ name: event.organizerName, updatedAt: new Date() })
      .where(eq(users.id, ownerId));
  }
  await tx.insert(options).values(
    event.options.map((option, position) => ({
      eventId: stored.id,
      position,
      ...optionColumns(option),
    })),
  );
  return links;
}

/**
 * The links of the account's latest event created after `after` that is the event in everything
 * it holds: title, deadline, time zone, voting with or without names, note, organizer name and
 * options (in their order, which the domain makes chronological), if there is one.
 */
async function sameEvent(
  tx: Transaction,
  ownerId: string,
  event: NewEvent,
  after: Date,
): Promise<EventCreated | undefined> {
  const candidates = await tx
    .select({ id: events.id, participationId: events.publicId, resultsId: events.resultsId })
    .from(events)
    .where(
      and(
        eq(events.ownerId, ownerId),
        eq(events.title, event.title),
        eq(events.deadline, event.deadline),
        eq(events.timeZone, event.timeZone),
        eq(events.anonymous, event.anonymous),
        eq(events.organizerName, event.organizerName),
        // Two events without a note hold the same note.
        sql`${events.note} is not distinct from ${event.note}`,
        gt(events.createdAt, after),
      ),
    )
    .orderBy(desc(events.createdAt));
  // Both sides as the columns `optionColumns` writes, the stored ones read back as an option.
  const proposed = JSON.stringify(event.options.map(optionColumns));
  for (const { id, participationId, resultsId } of candidates) {
    const rows = await tx
      .select({
        id: options.id,
        startDate: options.startDate,
        endDate: options.endDate,
        startTime: options.startTime,
        endTime: options.endTime,
      })
      .from(options)
      .where(eq(options.eventId, id))
      .orderBy(asc(options.position));
    const stored = JSON.stringify(rows.map((row) => optionColumns(optionFromRow(row))));
    if (stored === proposed) return { participationId, resultsId };
  }
  return undefined;
}

/** The links of the event that holds the token's hash, if the account owns it; else `taken`. */
async function eventHolding(
  tx: Transaction,
  tokenHash: string,
  ownerId: string,
): Promise<EventCreated | 'taken'> {
  const [holder] = await tx
    .select({
      ownerId: events.ownerId,
      participationId: events.publicId,
      resultsId: events.resultsId,
    })
    .from(events)
    .where(eq(events.managementTokenHash, tokenHash));
  if (!holder) throw new Error('The event that holds the token is not visible');
  const { participationId, resultsId } = holder;
  return holder.ownerId === ownerId ? { participationId, resultsId } : 'taken';
}
