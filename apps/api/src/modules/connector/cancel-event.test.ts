import { describe, expect, it } from 'vitest';
import { revisions } from '../../test/assistant.js';
import {
  anas,
  calling,
  connector,
  as,
  july10,
  lines,
  managementPageOf,
  notDone,
  type Answer,
  type App,
} from '../../test/connector-events.js';
import { movingClock } from '../../test/moving-clock.js';

/** The first of the two calls, for that event. */
const asking = (app: App, id = 'k3Jd9', headers = as('ana')) =>
  calling(app, 'cancel_event', { id }, { headers });

/** The second call, with the code. */
const cancellingWith = (app: App, code: string, id = 'k3Jd9', headers = as('ana')) =>
  calling(app, 'cancel_event', { id, code }, { headers });

/** The code an answer gives, in its last line and the same in its data. */
function codeOf(answer: Answer): string {
  const code = (answer.structuredContent as { code: string | null } | undefined)?.code ?? '';
  expect(lines(answer).at(-1)).toBe(
    `Código de cancelación: ${code} (vale 10 minutos). Enseña este aviso al organizador y vuelve a llamar con el código solo si dice que sí.`,
  );
  return code;
}

const codeFor = async (app: App, headers = as('ana')) =>
  codeOf(await asking(app, 'k3Jd9', headers));

/** What a first answer says after its first line, the code aside. */
const warning = (title = 'Cena de verano') => [
  `¿Cancelar «${title}»?`,
  'Se borrarán las fechas propuestas y los votos, y no se enviará ningún email más.',
  'Quien abra el enlace para votar o el de resultados verá que se ha cancelado.',
  'La cancelación es definitiva: no se puede deshacer.',
];

const codeVoid =
  'No se ha cancelado el evento: el código ha caducado o no es válido. Esto es lo que pasará ahora al cancelar:';

/** Whether the event is still there, as its management page reads it. */
const stillThere = async (app: App) => (await managementPageOf(app)).status === 200;

/** That nothing was cancelled, and the answer warns again with a new code. */
async function expectAskedAgain(app: App, answer: Answer, before: string): Promise<void> {
  const code = codeOf(answer);
  expect(lines(answer).slice(0, -1)).toEqual([codeVoid, ...warning()]);
  expect(code).not.toBe(before);
  expect(answer.structuredContent).toEqual({ id: 'k3Jd9', cancelled: false, code });
  expect(await stillThere(app)).toBe(true);
}

describe('"Cancelar un evento" (cancel_event)', () => {
  describe('the first call, without a code', () => {
    it.each(revisions)(
      'cancels nothing and answers, to an assistant of the %s revision, what cancelling does, that it is final, and a code, a line each',
      async (revision) => {
        const app = connector();

        const answer = await calling(app, 'cancel_event', { id: 'k3Jd9' }, { revision });

        const code = codeOf(answer);
        expect(lines(answer)).toEqual([
          'Todavía no se ha cancelado nada.',
          ...warning(),
          `Código de cancelación: ${code} (vale 10 minutos). Enseña este aviso al organizador y vuelve a llamar con el código solo si dice que sí.`,
        ]);
        expect(answer.isError).toBeUndefined();
        expect(answer.structuredContent).toEqual({ id: 'k3Jd9', cancelled: false, code });
        expect(await stillThere(app)).toBe(true);
      },
    );

    it('asks the same of an event whose date is confirmed: an event is cancelled in any state', async () => {
      const app = connector({ events: anas({ confirmedOption: july10 }) });

      const answer = await asking(app);

      expect(lines(answer).slice(1, -1)).toEqual(warning());
      await cancellingWith(app, codeOf(answer));
      expect(await stillThere(app)).toBe(false);
    });

    it('keeps a title’s own « and » from closing the mark of text written by people', async () => {
      const app = connector({ events: anas({ title: 'Cena «sorpresa»' }) });

      expect(lines(await asking(app))[1]).toBe('¿Cancelar «Cena “sorpresa”»?');
    });
  });

  describe('the second call, with the code', () => {
    it('cancels the event, as the management page does, and gives the message to forward to the group', async () => {
      const app = connector();
      const code = await codeFor(app);

      const answer = await cancellingWith(app, code);

      expect(answer).toEqual({
        content: [
          {
            type: 'text',
            text: 'Evento cancelado: «Cena de verano». Avisa al grupo con este mensaje: Se ha cancelado «Cena de verano».',
          },
        ],
        structuredContent: { id: 'k3Jd9', cancelled: true, code: null },
      });
      expect(await managementPageOf(app)).toMatchObject({
        status: 410,
        body: { error: { code: 'EVENT_CANCELLED' } },
      });
    });

    it('takes the code whatever its case and without its hyphen, until 10 minutes have passed', async () => {
      const clock = movingClock(new Date('2026-06-15T08:00:00Z'));
      const app = connector({ clock });
      const code = await codeFor(app);
      clock.advance(599_000);

      await cancellingWith(app, code.replace('-', '').toLowerCase());

      expect(await stillThere(app)).toBe(false);
    });

    it('cancels nothing with a code 10 minutes old, and warns again with a new code', async () => {
      const clock = movingClock(new Date('2026-06-15T08:00:00Z'));
      const app = connector({ clock });
      const code = await codeFor(app);
      clock.advance(600_000);

      await expectAskedAgain(app, await cancellingWith(app, code), code);
    });

    it('cancels nothing with the code given to another connected application of the account', async () => {
      const app = connector();
      const code = await codeFor(app, as('ana', 'chatgpt'));

      await expectAskedAgain(app, await cancellingWith(app, code), code);
    });

    it('cancels nothing with the code given to confirm a date of the same event', async () => {
      const app = connector();
      const confirming = await calling(app, 'confirm_option', {
        id: 'k3Jd9',
        option: { dates: july10.dates, time: july10.time },
      });
      const code = (confirming.structuredContent as { code: string }).code;

      await expectAskedAgain(app, await cancellingWith(app, code), code);
    });

    it('cancels nothing with a code that was never given', async () => {
      const app = connector();

      await expectAskedAgain(app, await cancellingWith(app, 'K7P2-9QMX'), 'K7P2-9QMX');
    });

    it('answers a second call with the same code, an assistant’s retry, that the event was cancelled', async () => {
      const app = connector();
      const code = await codeFor(app);
      await cancellingWith(app, code);

      expect(await cancellingWith(app, code)).toEqual(
        notDone('El evento «Cena de verano» ha sido cancelado.'),
      );
    });

    it('answers that the event was cancelled when another request cancels it while this one does', async () => {
      // The other request deletes it first: this one finds nothing left to delete.
      const app = connector({
        around: (managedEvents) => ({
          ...managedEvents,
          cancel: async (organizer) => {
            await managedEvents.cancel(organizer);
            return managedEvents.cancel(organizer);
          },
        }),
      });
      const code = await codeFor(app);

      expect(await cancellingWith(app, code)).toEqual(
        notDone('El evento «Cena de verano» ha sido cancelado.'),
      );
    });
  });

  describe('an event that cannot be cancelled', () => {
    it.each([
      ['another organizer’s event', 'Bp4Lk'],
      ['an event that does not exist', 'nope1'],
    ])('answers %s as one that does not exist, with a code or without', async (_case, id) => {
      const app = connector();
      const notFound = notDone('No hay ningún evento tuyo con ese identificador.');

      expect(await asking(app, id)).toEqual(notFound);
      expect(await cancellingWith(app, 'K7P2-9QMX', id)).toEqual(notFound);
      expect((await managementPageOf(app, 'Bp4Lk')).status).not.toBe(410);
    });

    it('says that a cancelled event was cancelled', async () => {
      expect(await asking(connector(), 'Xc7Tt')).toEqual(
        notDone('El evento «Cumpleaños» ha sido cancelado.'),
      );
    });
  });
});
