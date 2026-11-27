import type { Option } from '@qando/contracts';
import type { VoteState } from '@qando/domain';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { callTool, resultOf, revisions, type Revision } from '../../test/assistant.js';
import { movingClock, type MovingClock } from '../../test/moving-clock.js';
import {
  testDependencies,
  testSessionCookie,
  type TestManagedEvent,
} from '../../test/test-dependencies.js';
import {
  actingOrganizer,
  type ManagedEvents,
  type StoredManagedEvent,
} from '../management/managed-events.js';

let nextOption = 0;

/** An option of a test event, with an ID of its own. */
function option(dates: Option['dates'], time: Option['time'] = null): Option {
  nextOption += 1;
  return { id: `00000000-0000-4000-8000-${String(nextOption).padStart(12, '0')}`, dates, time };
}

const day = (date: string, time: Option['time'] = null) => option({ kind: 'single', date }, time);

const july6 = day('2026-07-06');
const july10 = day('2026-07-10');
const july11 = day('2026-07-11');

/** How a call names an option: its days and its time, as "Ver un evento" gives them. */
const named = ({ dates, time }: Option) => ({ dates, time });

/** Luis and Marta can come only on 10 July: it is the one recommended date. */
const luisAndMarta: Record<string, VoteState>[] = [
  { [july6.id]: 'unavailable', [july10.id]: 'available' },
  { [july6.id]: 'unavailable', [july10.id]: 'available' },
];

/** "Cena de verano", Ana's, open until the end of 1 July in Madrid. */
const cena: StoredManagedEvent = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  state: 'open',
  closesAt: new Date('2026-07-01T21:59:59.999Z'),
  options: [july6, july10],
  confirmedOption: null,
  participationId: 'k3Jd9',
  resultsId: 'Qw7p2',
  votes: luisAndMarta,
  emails: [],
};

/** Ana's "Cena de verano" as it is stored, with those changes. */
const anas = (event: Partial<StoredManagedEvent> = {}): Record<string, TestManagedEvent> => ({
  k3Jd9: {
    status: 'found',
    managementTokenHash: 'hash of k3Jd9',
    ownerId: 'ana',
    event: { ...cena, ...event },
  },
  Bp4Lk: {
    status: 'found',
    managementTokenHash: 'hash of Bp4Lk',
    ownerId: 'bea',
    event: { ...cena, title: 'Partido', participationId: 'Bp4Lk' },
  },
  Xc7Tt: { status: 'cancelled', title: 'Cumpleaños' },
});

/** Monday 15 June 2026, at 10:00 in Madrid; and the day after the deadline. */
const mondayMorning = new Date('2026-06-15T08:00:00Z');
const afterDeadline = new Date('2026-07-02T08:00:00Z');

/** The headers these tests name the account and the application of a call with, in the token's place. */
const as = (accountId: string, applicationId = 'claude') => ({
  'X-Account': accountId,
  'X-Application': applicationId,
});

/**
 * The API with the connector open, on a clock the test moves: every call acts for the account
 * and the application its headers name. `around` stands in for what happens to the stored
 * events meanwhile (while a confirmation holds the event locked), given the store itself.
 */
function connector({
  events = anas(),
  clock = movingClock(mondayMorning),
  around = (managedEvents) => managedEvents,
}: {
  events?: Record<string, TestManagedEvent>;
  clock?: MovingClock;
  around?: (managedEvents: ManagedEvents) => ManagedEvents;
} = {}) {
  const dependencies = testDependencies({ managedEvents: events });
  const managedEvents = around(dependencies.managedEvents);
  return createApp({
    ...dependencies,
    managedEvents,
    now: clock.now,
    connectorAccess: (serve) => (calling) =>
      serve(calling, {
        accountId: calling.headers.get('x-account') ?? 'nobody',
        applicationId: calling.headers.get('x-application') ?? 'none',
      }),
  });
}

type App = ReturnType<typeof connector>;

interface Answer {
  content: { type: string; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

/** What "Confirmar la fecha" answers for what the call gives it. */
async function confirming(
  app: App,
  args: Record<string, unknown>,
  {
    headers = as('ana'),
    revision = '2026-07-28',
  }: { headers?: Record<string, string>; revision?: Revision } = {},
): Promise<Answer> {
  const response = await callTool(app, revision, 'confirm_option', headers, args);
  expect(response.status).toBe(200);
  // Without what the current revision adds to every answer.
  const { content, structuredContent, isError } = resultOf(response) as Answer;
  return {
    content,
    ...(structuredContent !== undefined && { structuredContent }),
    ...(isError !== undefined && { isError }),
  };
}

const lines = ({ content }: Answer) =>
  content
    .map(({ text }) => text)
    .join('\n')
    .split('\n');

/** The code an answer gives, in its words and the same in its data. */
function codeOf(answer: Answer): string {
  const code = (answer.structuredContent as { code: string | null } | undefined)?.code ?? '';
  expect(lines(answer).at(-1)).toBe(
    `Código de confirmación: ${code} (vale 10 minutos). Enseña este aviso al organizador y vuelve a llamar con el código solo si dice que sí.`,
  );
  return code;
}

/** The first of the two calls, for that option of Ana's "Cena de verano". */
const asking = (app: App, asked: Option, headers = as('ana')) =>
  confirming(app, { id: 'k3Jd9', option: named(asked) }, { headers });

/** The code the first call gives for that option. */
const codeFor = async (app: App, asked: Option, headers = as('ana')) =>
  codeOf(await asking(app, asked, headers));

/** The second call, with the code. */
const confirmingWith = (app: App, asked: Option, code: string, headers = as('ana')) =>
  confirming(app, { id: 'k3Jd9', option: named(asked), code }, { headers });

/** The date confirmed of the event, as its management page reads it. */
async function confirmedOf(app: App, id = 'k3Jd9'): Promise<unknown> {
  const response = await request(app)
    .get(`/api/events/${id}`)
    .set('Cookie', `${testSessionCookie}=ana`);
  expect(response.status).toBe(200);
  return (response.body as { confirmedOption: unknown }).confirmedOption;
}

const notDone = (text: string) => ({ content: [{ type: 'text', text }], isError: true });

const nothingYet = 'Todavía no se ha confirmado nada.';
const codeVoid =
  'No se ha confirmado la fecha: el código ha caducado o la votación ha cambiado desde que se dio. Esto es lo que pasará ahora al confirmar:';
const final = 'La confirmación es definitiva: después no podrás elegir otra fecha.';
const open = 'Al confirmar, la votación se cerrará: quien aún no haya votado ya no podrá hacerlo.';
const openNoVotes = 'Al confirmar, la votación se cerrará: nadie podrá votar.';
const noVotes = 'Nadie ha votado todavía.';
const nobodyCanAttend = 'Nadie puede asistir en ninguna de las fechas propuestas.';

describe('"Confirmar la fecha" (confirm_option)', () => {
  describe('the first call, without a code', () => {
    it.each(revisions)(
      'changes nothing and answers, to an assistant of the %s revision, what confirming would do, its notes and a code, a line each',
      async (revision) => {
        const app = connector();

        const answer = await confirming(app, { id: 'k3Jd9', option: named(july6) }, { revision });

        const code = codeOf(answer);
        expect(lines(answer)).toEqual([
          nothingYet,
          '¿Confirmar el lunes 6 de julio, sin horario para «Cena de verano»?',
          'No es la fecha más votada. La más votada es el viernes 10 de julio, sin horario.',
          open,
          final,
          `Código de confirmación: ${code} (vale 10 minutos). Enseña este aviso al organizador y vuelve a llamar con el código solo si dice que sí.`,
        ]);
        expect(answer.isError).toBeUndefined();
        expect(answer.structuredContent).toEqual({
          id: 'k3Jd9',
          option: named(july6),
          confirmed: false,
          code,
        });
        expect(await confirmedOf(app)).toBeNull();
      },
    );

    it.each<[string, Partial<StoredManagedEvent>, Date, Option, string[]]>([
      ['the recommended date while voting is open', {}, mondayMorning, july10, [open]],
      [
        'a date of an event nobody has voted on',
        { votes: [] },
        mondayMorning,
        july6,
        [noVotes, openNoVotes],
      ],
      [
        'a date of an event nobody can attend',
        { votes: [{ [july6.id]: 'unavailable', [july10.id]: 'unavailable' }] },
        mondayMorning,
        july10,
        [nobodyCanAttend, open],
      ],
      ['the recommended date once voting has closed', {}, afterDeadline, july10, []],
      [
        'another date once voting has closed',
        {},
        afterDeadline,
        july6,
        ['No es la fecha más votada. La más votada es el viernes 10 de julio, sin horario.'],
      ],
      [
        'a date that is not one of two recommended',
        {
          options: [july6, july10, july11],
          votes: [
            { [july6.id]: 'unavailable', [july10.id]: 'available', [july11.id]: 'available' },
          ],
        },
        mondayMorning,
        july6,
        [
          'No es la fecha más votada. Las más votadas son el viernes 10 de julio, sin horario y el sábado 11 de julio, sin horario.',
          open,
        ],
      ],
    ])(
      'notes, for %s, what the web’s question would, and always that it is final',
      async (_case, event, at, asked, notes) => {
        const answer = await asking(
          connector({ events: anas(event), clock: movingClock(at) }),
          asked,
        );

        expect(lines(answer).slice(2, -1)).toEqual([...notes, final]);
      },
    );

    it.each<[string, Option, string]>([
      [
        'a day at a time',
        day('2026-07-10', { kind: 'single', at: '21:00' }),
        'el viernes 10 de julio, 21:00',
      ],
      [
        'a day with a time range',
        day('2026-07-10', { kind: 'range', start: '20:00', end: '22:30' }),
        'el viernes 10 de julio, de 20:00 a 22:30',
      ],
      [
        'a range of days',
        option({ kind: 'range', start: '2026-07-06', end: '2026-07-10' }),
        'del lunes 6 al viernes 10 de julio',
      ],
    ])('asks about %s as "Ver un evento" says it', async (_case, asked, said) => {
      const events = anas({ options: [asked], votes: [] });

      const answer = await asking(connector({ events }), asked);

      expect(lines(answer)[1]).toBe(`¿Confirmar ${said} para «Cena de verano»?`);
    });

    it('keeps a title’s own « and » from closing the mark of text written by people', async () => {
      const app = connector({ events: anas({ title: 'Cena «sorpresa»' }) });

      const answer = await asking(app, july10);

      expect(lines(answer)[1]).toBe(
        '¿Confirmar el viernes 10 de julio, sin horario para «Cena “sorpresa”»?',
      );
    });
  });

  describe('the second call, with the code', () => {
    it('confirms the date, as the management page does, and says that voting is closed', async () => {
      const app = connector();
      const code = await codeFor(app, july6);

      const answer = await confirmingWith(app, july6, code);

      expect(answer).toEqual({
        content: [
          {
            type: 'text',
            text: 'Fecha confirmada: lunes 6 de julio, sin horario. La votación de «Cena de verano» está cerrada.',
          },
        ],
        structuredContent: { id: 'k3Jd9', option: named(july6), confirmed: true, code: null },
      });
      expect(await confirmedOf(app)).toEqual(july6);
    });

    it('takes the code whatever its case and without its hyphen, and until 10 minutes have passed', async () => {
      const clock = movingClock(mondayMorning);
      const app = connector({ clock });
      const code = await codeFor(app, july10);
      clock.advance(599_000);

      const answer = await confirmingWith(app, july10, code.toLowerCase().replace('-', ''));

      expect(answer.isError).toBeUndefined();
      expect(await confirmedOf(app)).toEqual(july10);
    });

    /**
     * Expects the answer to confirm nothing and to be a new first answer: that the code does not
     * hold, then what confirming would do now, with a code of its own.
     */
    async function expectAskedAgain(app: App, answer: Answer, given: string, notes: string[]) {
      const code = codeOf(answer);
      expect(lines(answer)).toEqual([
        codeVoid,
        '¿Confirmar el viernes 10 de julio, sin horario para «Cena de verano»?',
        ...notes,
        final,
        lines(answer).at(-1),
      ]);
      expect(code).not.toBe(given);
      expect(answer.isError).toBeUndefined();
      expect(answer.structuredContent).toMatchObject({ confirmed: false, code });
      expect(await confirmedOf(app)).toBeNull();
    }

    it('confirms nothing with a code 10 minutes old, and asks again', async () => {
      const clock = movingClock(mondayMorning);
      const app = connector({ clock });
      const code = await codeFor(app, july10);
      clock.advance(600_000);

      await expectAskedAgain(app, await confirmingWith(app, july10, code), code, [open]);
    });

    it('confirms nothing with the code given for another date, and asks again', async () => {
      const app = connector();
      const code = await codeFor(app, july6);

      await expectAskedAgain(app, await confirmingWith(app, july10, code), code, [open]);
    });

    it('confirms nothing with the code given to another connected application of the account, and asks again', async () => {
      const app = connector();
      const code = await codeFor(app, july10, as('ana', 'chatgpt'));

      await expectAskedAgain(app, await confirmingWith(app, july10, code), code, [open]);
    });

    it('confirms nothing with a code that was never given, and asks again', async () => {
      const app = connector();

      await expectAskedAgain(app, await confirmingWith(app, july10, 'K7P2-9QMX'), 'K7P2-9QMX', [
        open,
      ]);
    });

    // Each a store of its own: the code is held nowhere, so the second call reads the event as
    // it is then.
    it.each<[string, Partial<StoredManagedEvent>, Date, string[]]>([
      [
        'a vote that arrived since',
        { votes: [...luisAndMarta, { [july6.id]: 'available', [july10.id]: 'available' }] },
        mondayMorning,
        [open],
      ],
      [
        'a vote changed since, which made another date recommended',
        { votes: [{ [july6.id]: 'available', [july10.id]: 'unavailable' }, luisAndMarta[1] ?? {}] },
        mondayMorning,
        [open],
      ],
      ['voting closed since', {}, afterDeadline, []],
    ])(
      'confirms nothing after %s, and asks again with the notes as they are now',
      async (_case, since, at, notes) => {
        const code = await codeFor(connector(), july10);
        const app = connector({ events: anas(since), clock: movingClock(at) });

        await expectAskedAgain(app, await confirmingWith(app, july10, code), code, notes);
      },
    );

    it('confirms nothing when a vote is stored while it confirms, and asks again', async () => {
      const app = connector({
        around: (managedEvents) => {
          // A vote stored just before the lock is taken: there from then on.
          let stored = false;
          const withIt = (votes: StoredManagedEvent['votes']) =>
            stored
              ? [...votes, { [july6.id]: 'available', [july10.id]: 'available' } as const]
              : votes;
          return {
            ...managedEvents,
            event: async (organizer) => {
              const event = await managedEvents.event(organizer);
              return event && { ...event, votes: withIt(event.votes) };
            },
            change: (work) =>
              managedEvents.change((change) => {
                stored = true;
                return work({
                  ...change,
                  votes: async (organizer) => withIt(await change.votes(organizer)),
                });
              }),
          };
        },
      });
      const code = await codeFor(app, july10);

      await expectAskedAgain(app, await confirmingWith(app, july10, code), code, [open]);
    });

    it('confirms nothing when the options are replaced while it confirms, and asks about the date as it is now', async () => {
      const events = anas({ votes: [] });
      const app = connector({
        events,
        around: (managedEvents) => ({
          ...managedEvents,
          change: (work) =>
            managedEvents.change(async (change) => {
              // Replaced on the web just before the lock is taken: the same days, with new IDs.
              const organizer = await organizerOf(managedEvents);
              await change.replaceOptions(organizer, [named(july6), named(july10)]);
              return work(change);
            }),
        }),
      });
      const code = await codeFor(app, july10);

      await expectAskedAgain(app, await confirmingWith(app, july10, code), code, [
        noVotes,
        openNoVotes,
      ]);
    });
  });

  describe('a date that cannot be confirmed', () => {
    const confirmedOn10July = { state: 'confirmed', confirmedOption: july10 } as const;
    const already = notDone(
      'La fecha de «Cena de verano» ya está confirmada: viernes 10 de julio, sin horario. La confirmación es definitiva.',
    );

    it.each([
      ['another date', july6],
      ['the date confirmed itself', july10],
    ])('answers the date confirmed already, asked about %s', async (_case, asked) => {
      const app = connector({ events: anas(confirmedOn10July) });

      expect(await asking(app, asked)).toEqual(already);
    });

    it('answers the date confirmed already when it was confirmed between the two calls', async () => {
      const code = await codeFor(connector(), july6);
      const app = connector({ events: anas(confirmedOn10July) });

      expect(await confirmingWith(app, july6, code)).toEqual(already);
      expect(await confirmedOf(app)).toEqual(july10);
    });

    it('answers the date confirmed already when it was confirmed on the web while it confirms', async () => {
      const app = connector({
        around: (managedEvents) => ({
          ...managedEvents,
          change: (work) =>
            managedEvents.change(async (change) => {
              // Confirmed on the management page just before the lock is taken.
              await change.confirm(await organizerOf(managedEvents), july10.id);
              return work(change);
            }),
        }),
      });
      const code = await codeFor(app, july6);

      expect(await confirmingWith(app, july6, code)).toEqual(already);
      expect(await confirmedOf(app)).toEqual(july10);
    });

    it.each<[string, { dates: Option['dates']; time: Option['time'] }]>([
      ['a day that is no option', { dates: { kind: 'single', date: '2026-07-07' }, time: null }],
      [
        'a time an option of that day does not have',
        { dates: july10.dates, time: { kind: 'single', at: '21:00' } },
      ],
      [
        'a range of days no option has',
        { dates: { kind: 'range', start: '2026-07-06', end: '2026-07-10' }, time: null },
      ],
    ])('says that %s is not one of the event’s dates', async (_case, asked) => {
      const app = connector();

      expect(await confirming(app, { id: 'k3Jd9', option: asked })).toEqual(
        notDone('Esa fecha no está entre las opciones de «Cena de verano».'),
      );
      expect(
        await confirming(app, { id: 'k3Jd9', option: asked, code: await codeFor(app, july10) }),
      ).toEqual(notDone('Esa fecha no está entre las opciones de «Cena de verano».'));
      expect(await confirmedOf(app)).toBeNull();
    });

    it.each([
      ['another organizer’s event', 'Bp4Lk'],
      ['an event that does not exist', 'nope'],
    ])('answers %s as one that does not exist, and confirms nothing', async (_case, id) => {
      const app = connector();

      expect(await confirming(app, { id, option: named(july10) })).toEqual(
        notDone('No hay ningún evento tuyo con ese identificador.'),
      );
      expect(await confirming(app, { id, option: named(july10), code: 'K7P2-9QMX' })).toEqual(
        notDone('No hay ningún evento tuyo con ese identificador.'),
      );
    });

    it('says that a cancelled event was cancelled', async () => {
      expect(await confirming(connector(), { id: 'Xc7Tt', option: named(july10) })).toEqual(
        notDone('El evento «Cumpleaños» ha sido cancelado.'),
      );
    });
  });
});

/** The organizer of Ana's "Cena de verano", as the store resolves it. */
async function organizerOf(managedEvents: ManagedEvents) {
  const access = await actingOrganizer(managedEvents, 'k3Jd9', { accountId: 'ana' });
  if (access.status !== 'granted') throw new Error('Ana manages "Cena de verano"');
  return access.organizer;
}
