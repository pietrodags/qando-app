import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { createDatabase, type Database } from '../../db/database.js';
import { runMigrations } from '../../db/migrate.js';
import { confirmations, events, notifications, users } from '../../db/schema.js';
import { seedEvent, type EventSeed, type SeededEvent } from '../../seed/seed-event.js';
import { callTool, resultOf, revisions } from '../../test/assistant.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import {
  connectApplication,
  publishedApplications,
  type PublishedApplication,
} from '../../test/published-application.js';
import { signedInCookie } from '../../test/signed-in-cookie.js';
import { testDependencies } from '../../test/test-dependencies.js';
import {
  authorizationServerOf,
  connectionRequestsOf,
  connectorAccessOf,
  createAuth,
  emailCodesOf,
  sessionsOf,
  type Auth,
} from '../auth/auth.js';
import { createNewEvents } from '../events/new-events-repository.js';
import { createManagedEvents } from '../management/managed-events-repository.js';
import { createParticipations } from '../participations/participations-repository.js';
import { createEventResults } from '../results/results-repository.js';

/** The public address of qando's pages and API. */
const origin = 'http://localhost:4200';
const secret = 'test-secret-for-the-integration-tests-only-0123456789';

const ana = { name: 'Ana', email: 'ana@example.com' };
const bea = { name: 'Bea', email: 'bea@example.com' };

const event = (title: string, deadline: string, seed: Partial<EventSeed> = {}): EventSeed => ({
  title,
  options: ['2026-07-06', '2026-07-10'],
  deadline,
  organizer: ana,
  ...seed,
});

describe('the connector’s tools for a connected application, against PostgreSQL', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let db: Database;
  let auth: Auth;
  let app: ReturnType<typeof createApp>;
  let cena: SeededEvent;
  let cafe: SeededEvent;
  let partido: SeededEvent;
  let cumpleanos: SeededEvent;
  const applications = publishedApplications();

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
    await runMigrations(pool);
    db = createDatabase(pool);
    auth = createAuth({
      db,
      secret,
      baseURL: origin,
      log: () => undefined,
      fetchApplicationDocument: applications.fetch,
    });
    // One after another, so each is created after the one before.
    cafe = await seedEvent(db, event('Café', '2026-06-20', { outcome: { confirmed: 1 } }));
    cena = await seedEvent(
      db,
      event('Cena de verano', '2026-07-01', {
        note: 'Traed algo de postre',
        votes: [
          { name: 'Leo', states: ['available', 'preferred'] },
          { name: 'Marta', states: ['unavailable', 'unavailable'] },
        ],
      }),
    );
    partido = await seedEvent(
      db,
      event('Partido', '2026-07-01', {
        organizer: bea,
        votes: [{ name: 'Leo', states: ['available', 'available'] }],
      }),
    );
    cumpleanos = await seedEvent(db, event('Cumpleaños', '2026-07-01', { outcome: 'cancelled' }));
  });

  beforeEach(() => {
    // The API's clock says 15 June 2026: voting on "Cena de verano" and "Partido" is open.
    const dependencies = testDependencies();
    app = createApp({
      ...dependencies,
      managedEvents: createManagedEvents(db),
      participations: createParticipations(db),
      results: createEventResults(db),
      newEvents: createNewEvents(db, dependencies.now),
      sessions: sessionsOf(auth),
      authorizationServer: authorizationServerOf(auth),
      connectionRequests: connectionRequestsOf(auth, db),
      connectorAccess: connectorAccessOf(auth, db),
      // The codes are made here straight by the sign-in library: no email is sent.
      signInCodes: emailCodesOf(auth, {
        sendEmail: () => Promise.reject(new Error('No email is sent in these tests')),
        log: () => undefined,
      }).signInCodes,
    });
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  /** The header with the access token of the application once that account connected it. */
  const connected = async (application: PublishedApplication, email: string) => {
    const cookie = await signedInCookie(auth, email);
    const { access_token } = await connectApplication(app, { application, origin, cookie });
    return { Authorization: `Bearer ${access_token}` };
  };

  it.each(revisions)(
    'lists to an assistant of the %s revision the events of the account its token is of, each with how many people voted, and no other account’s',
    async (revision) => {
      const access = await connected(applications.publish('Claude'), ana.email);

      const response = await callTool(app, revision, 'list_my_events', access);

      expect(response.status).toBe(200);
      expect(resultOf(response)).toMatchObject({
        content: [
          {
            type: 'text',
            text: [
              'Tienes 2 eventos:',
              `- «Cena de verano»: Votación abierta hasta el 1 de julio de 2026. Han votado 2 personas. Identificador: ${cena.publicId}`,
              `- «Café»: Fecha confirmada. Nadie ha votado todavía. Identificador: ${cafe.publicId}`,
            ].join('\n'),
          },
        ],
        structuredContent: {
          events: [
            { id: cena.publicId, title: 'Cena de verano', state: 'open', voters: 2 },
            { id: cafe.publicId, title: 'Café', state: 'confirmed', voters: 0 },
          ],
        },
      });
    },
  );

  it('answers each application for the account that connected it', async () => {
    const forAna = await connected(applications.publish('Claude'), ana.email);
    const forBea = await connected(applications.publish('ChatGPT'), bea.email);

    const beas = resultOf(await callTool(app, '2026-07-28', 'list_my_events', forBea));
    const anas = resultOf(await callTool(app, '2026-07-28', 'list_my_events', forAna));

    expect(beas).toMatchObject({
      content: [
        {
          type: 'text',
          text: `Tienes 1 evento:\n- «Partido»: Votación abierta hasta el 1 de julio de 2026. Ha votado 1 persona. Identificador: ${partido.publicId}`,
        },
      ],
    });
    expect(anas).toMatchObject({ structuredContent: { events: [{ id: cena.publicId }, {}] } });
  });

  it('answers an account that has created no event in words', async () => {
    const access = await connected(applications.publish('Claude'), 'carla@example.com');

    expect(resultOf(await callTool(app, '2026-07-28', 'list_my_events', access))).toMatchObject({
      content: [{ type: 'text', text: 'Aún no has creado ningún evento.' }],
      structuredContent: { events: [] },
    });
  });

  it('creates an event for the account its token is of, once when the assistant sends it twice, with its summary queued once, and lists it', async () => {
    const access = await connected(applications.publish('Claude'), 'dana@example.com');
    const asked = {
      title: 'Cena con el grupo',
      organizerName: 'Dana',
      options: [
        { dates: { kind: 'single', date: '2026-06-19' }, time: { kind: 'single', at: '21:00' } },
        { dates: { kind: 'single', date: '2026-06-20' }, time: { kind: 'single', at: '21:00' } },
      ],
      deadline: '2026-06-18',
      timeZone: 'Europe/Madrid',
    };

    const first = resultOf(await callTool(app, '2026-07-28', 'create_event', access, asked));
    const again = resultOf(await callTool(app, '2025-06-18', 'create_event', access, asked));
    const listed = resultOf(await callTool(app, '2026-07-28', 'list_my_events', access));

    const { id } = (first as { structuredContent: { id: string } }).structuredContent;
    expect(first).toMatchObject({
      content: [{ type: 'text', text: expect.stringContaining(`/vote/${id} `) as unknown }],
      structuredContent: { title: 'Cena con el grupo' },
    });
    expect(again).toMatchObject({ structuredContent: { id } });
    expect(listed).toMatchObject({
      structuredContent: { events: [{ id, title: 'Cena con el grupo' }] },
    });
    const queued = await db
      .select({ type: notifications.type, recipient: notifications.recipient })
      .from(notifications)
      .innerJoin(events, eq(events.id, notifications.eventId))
      .innerJoin(users, eq(users.id, events.ownerId))
      .where(eq(users.email, 'dana@example.com'));
    expect(queued.filter(({ type }) => type === 'summary')).toEqual([
      { type: 'summary', recipient: 'dana@example.com' },
    ]);
  });

  it('reads to the assistant one of the account’s events with its results, the names inside the mark of text written by people, and its voting link alone', async () => {
    const access = await connected(applications.publish('Claude'), ana.email);
    const [july6, july10] = cena.optionIds;

    const response = await callTool(app, '2026-07-28', 'read_event', access, { id: cena.publicId });

    expect(response.status).toBe(200);
    expect(resultOf(response)).toMatchObject({
      content: [
        {
          type: 'text',
          text: [
            '«Cena de verano»: Votación abierta hasta el 1 de julio de 2026. Han votado 2 personas.',
            `Enlace para votar: https://qando.test/vote/${cena.publicId}`,
            'Nota: «Traed algo de postre»',
            'Opciones:',
            '- lunes 6 de julio, sin horario',
            '- viernes 10 de julio, sin horario',
            'Este es el cómputo provisional de la votación: Votantes: 2. Asisten: 1. No asisten: 1.',
            'La fecha elegida es:',
            '- viernes 10 de julio, sin horario: Preferida 1 («Leo»). Disponible 0. No puede 1 («Marta»).',
            'Fecha alternativa:',
            '- lunes 6 de julio, sin horario: Preferida 0. Disponible 1 («Leo»). No puede 1 («Marta»).',
          ].join('\n'),
        },
      ],
      structuredContent: {
        id: cena.publicId,
        votingLink: `https://qando.test/vote/${cena.publicId}`,
        event: {
          title: 'Cena de verano',
          organizerName: 'Ana',
          note: 'Traed algo de postre',
          deadline: '2026-07-01',
          timeZone: 'Europe/Madrid',
          anonymous: false,
          state: 'open',
          options: [{ id: july6 }, { id: july10 }],
          confirmedOption: null,
        },
        results: {
          winners: [
            { option: { id: july10 }, names: { preferred: ['Leo'], unavailable: ['Marta'] } },
          ],
          alternatives: [{ option: { id: july6 } }],
        },
      },
    });
    expect(response.text).not.toContain(cena.resultsId);
    expect(response.text).not.toContain(cena.managementToken);
  });

  it('refuses to read another account’s event as one that does not exist, and answers a cancelled one with its title', async () => {
    const access = await connected(applications.publish('Claude'), ana.email);
    const read = async (id: string) =>
      resultOf(await callTool(app, '2026-07-28', 'read_event', access, { id }));

    expect(await read(partido.publicId)).toMatchObject({
      content: [{ type: 'text', text: 'No hay ningún evento tuyo con ese identificador.' }],
      isError: true,
    });
    expect(await read(cumpleanos.publicId)).toMatchObject({
      content: [{ type: 'text', text: 'El evento «Cumpleaños» ha sido cancelado.' }],
      isError: true,
    });
  });

  /** The code an answer of "Confirmar la fecha" gives, which its data says too. */
  const codeIn = (answer: unknown): string => {
    const { code } = (answer as { structuredContent: { code: string } }).structuredContent;
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    return code;
  };

  /** How many confirmations the event has stored: none, or its one. */
  const confirmationsOf = async ({ eventId }: SeededEvent) =>
    db.$count(confirmations, eq(confirmations.eventId, eventId ?? ''));

  it('confirms a date in two calls of the same application, and never with the code given to another application of the account', async () => {
    const comida = await seedEvent(
      db,
      event('Comida', '2026-07-01', {
        votes: [{ name: 'Leo', states: ['available', 'preferred'] }],
      }),
    );
    const claude = await connected(applications.publish('Claude'), ana.email);
    const chatgpt = await connected(applications.publish('ChatGPT'), ana.email);
    const july10 = { dates: { kind: 'single', date: '2026-07-10' }, time: null };
    const confirm = async (access: Record<string, string>, code?: string) =>
      resultOf(
        await callTool(app, '2026-07-28', 'confirm_option', access, {
          id: comida.publicId,
          option: july10,
          ...(code === undefined ? {} : { code }),
        }),
      );

    const othersCode = codeIn(await confirm(chatgpt));
    const askedAgain = await confirm(claude, othersCode);

    expect(askedAgain).toMatchObject({
      content: [
        { type: 'text', text: expect.stringMatching(/^No se ha confirmado la fecha: /) as unknown },
      ],
      structuredContent: { confirmed: false },
    });
    expect(await confirmationsOf(comida)).toBe(0);

    expect(await confirm(claude, codeIn(askedAgain))).toMatchObject({
      content: [
        {
          type: 'text',
          text: 'Fecha confirmada: viernes 10 de julio, sin horario. La votación de «Comida» está cerrada.',
        },
      ],
      structuredContent: { confirmed: true, code: null },
    });
    expect(await confirmationsOf(comida)).toBe(1);
  });

  it('confirms nothing when a vote was stored between the two calls, and asks again', async () => {
    const merienda = await seedEvent(
      db,
      event('Merienda', '2026-07-01', {
        votes: [{ name: 'Leo', states: ['available', 'preferred'] }],
      }),
    );
    const access = await connected(applications.publish('Claude'), ana.email);
    const july10 = { dates: { kind: 'single', date: '2026-07-10' }, time: null };
    const confirm = async (code?: string) =>
      resultOf(
        await callTool(app, '2026-07-28', 'confirm_option', access, {
          id: merienda.publicId,
          option: july10,
          ...(code === undefined ? {} : { code }),
        }),
      );
    const code = codeIn(await confirm());
    const [july6Id = '', july10Id = ''] = merienda.optionIds;
    const voted = await request(app)
      .post(`/api/public/events/${merienda.publicId}/participations`)
      .set('X-Vote-Token', randomBytes(16).toString('base64url'))
      .send({ name: 'Pablo', votes: { [july6Id]: 'available', [july10Id]: 'available' } });
    expect(voted.status).toBe(201);

    expect(await confirm(code)).toMatchObject({
      content: [
        { type: 'text', text: expect.stringMatching(/^No se ha confirmado la fecha: /) as unknown },
      ],
      structuredContent: { confirmed: false },
    });
    expect(await confirmationsOf(merienda)).toBe(0);
  });

  it('refuses a call to a tool without an access token with the 401 that says where to ask for one', async () => {
    const response = await callTool(app, '2026-07-28', 'list_my_events');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toContain(
      `resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`,
    );
  });
});
