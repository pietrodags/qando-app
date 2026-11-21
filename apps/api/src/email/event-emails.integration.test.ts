import { randomUUID } from 'node:crypto';
import { closingInstant, type NewEvent } from '@qando/domain';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newCapabilityToken } from '../capability-token.js';
import { createDatabase, type Database } from '../db/database.js';
import { runMigrations } from '../db/migrate.js';
import { events } from '../db/schema.js';
import { createNewEvents } from '../modules/events/new-events-repository.js';
import { createFreshDatabase, type FreshDatabase } from '../test/fresh-database.js';
import { storeUser } from '../test/stored-user.js';
import type { OutgoingEmail } from './email.js';
import { composeEventEmail } from './event-emails.js';
import { emailOutbox, type EventEmailType } from './outbox.js';
import { summaryEmail } from './summary-email.js';

const siteUrl = 'https://qando.app';
// 10:00 in Madrid on 15 June 2026.
const morning = new Date('2026-06-15T08:00:00Z');

const cena: NewEvent = {
  organizerName: 'Ana',
  title: 'Cena de verano',
  note: 'Trae postre.',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  closesAt: closingInstant('2026-07-01', 'Europe/Madrid'),
  anonymous: false,
  options: [
    { dates: { kind: 'single', date: '2026-07-06' }, time: { kind: 'single', at: '21:00' } },
    {
      dates: { kind: 'single', date: '2026-07-10' },
      time: { kind: 'range', start: '20:30', end: '23:00' },
    },
    { dates: { kind: 'range', start: '2026-07-18', end: '2026-07-19' }, time: null },
  ],
};

/** The summary of "Cena de verano" as its template writes it. */
const summaryOfCena = (participationId: string) =>
  summaryEmail({
    organizerName: 'Ana',
    title: 'Cena de verano',
    note: 'Trae postre.',
    options: cena.options,
    timeZone: 'Europe/Madrid',
    deadline: '2026-07-01',
    participationId,
    siteUrl,
  });

describe('event emails against PostgreSQL', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let db: Database;

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
    await runMigrations(pool);
    db = createDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  /** Creates "Cena de verano" for a new account; answers the account, the event and its link. */
  async function createCena() {
    const owner = await storeUser(db);
    const links = await createNewEvents(db, () => morning).create(
      owner,
      newCapabilityToken(),
      cena,
    );
    if (links === 'taken') throw new Error('A new token was taken');
    const [stored] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.publicId, links.participationId));
    if (!stored) throw new Error('The created event is not stored');
    return { owner, eventId: stored.id, participationId: links.participationId };
  }

  const compose = (eventId: string, type: EventEmailType) =>
    db.transaction((tx) => composeEventEmail(siteUrl)({ eventId, type }, tx));

  it('writes the summary from the event as stored: its options in order, note, deadline and link', async () => {
    const { eventId, participationId } = await createCena();

    expect(await compose(eventId, 'summary')).toEqual(summaryOfCena(participationId));
  });

  it('writes the event as it is when the email is sent, not as it was when it was queued', async () => {
    const { eventId } = await createCena();
    await db.update(events).set({ title: 'Cena de fin de curso' }).where(eq(events.id, eventId));

    const { subject } = await compose(eventId, 'summary');

    expect(subject).toBe('Resumen de tu evento: Cena de fin de curso');
  });

  it('cannot write "voting closed" yet: composing it rejects', async () => {
    const { eventId } = await createCena();

    await expect(compose(eventId, 'voting_closed')).rejects.toThrow();
  });

  it('rejects for an event no longer stored', async () => {
    await expect(compose(randomUUID(), 'summary')).rejects.toThrow();
  });

  it('sends the summary queued when the event was created to its account, once', async () => {
    const { owner, participationId } = await createCena();
    const delivered: OutgoingEmail[] = [];
    const outbox = emailOutbox({
      db,
      sendEmail: (email) => {
        delivered.push(email);
        return Promise.resolve();
      },
      compose: composeEventEmail(siteUrl),
      now: () => morning,
      log: () => undefined,
    });

    await outbox.sendDue();
    await outbox.sendDue();

    const to = `${owner}@example.com`;
    expect(delivered.filter((email) => email.to === to)).toEqual([
      { to, ...summaryOfCena(participationId) },
    ]);
  });
});
