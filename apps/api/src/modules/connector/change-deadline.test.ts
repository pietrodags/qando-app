import { describe, expect, it } from 'vitest';
import { revisions } from '../../test/assistant.js';
import {
  anas,
  calling,
  cancelledMeanwhile,
  confirmedMeanwhile,
  connector,
  july10,
  managementPageOf,
  notDone,
  type Answer,
  type App,
} from '../../test/connector-events.js';
import { movingClock } from '../../test/moving-clock.js';

const changing = (app: App, deadline: string, id = 'k3Jd9') =>
  calling(app, 'change_deadline', { id, deadline });

/** The event's voting as its management page reads it. */
async function votingOf(app: App): Promise<{ state: unknown; deadline: unknown }> {
  const { state, deadline } = (await managementPageOf(app)).body;
  return { state, deadline };
}

/** A change done: its words, and the voting as it is now beside them. */
const done = (text: string, deadline: string): Answer => ({
  content: [{ type: 'text', text }],
  structuredContent: { id: 'k3Jd9', state: 'open', deadline },
});

/** The day after the last day to vote, at 10:00 in Madrid: voting closed at the end of 1 July. */
const afterDeadline = new Date('2026-07-02T08:00:00Z');

const confirmed = notDone(
  'La fecha de «Cena de verano» ya está confirmada: viernes 10 de julio, sin horario. La confirmación es definitiva.',
);

describe('"Cambiar el plazo" (change_deadline)', () => {
  it.each(revisions)(
    'changes the last day to vote in one call, as the management page does, and says it to an assistant of the %s revision',
    async (revision) => {
      const app = connector();

      const answer = await calling(
        app,
        'change_deadline',
        { id: 'k3Jd9', deadline: '2026-07-05' },
        { revision },
      );

      expect(answer).toEqual(
        done(
          'Plazo cambiado: se puede votar en «Cena de verano» hasta el 5 de julio de 2026.',
          '2026-07-05',
        ),
      );
      expect(await votingOf(app)).toEqual({ state: 'open', deadline: '2026-07-05' });
    },
  );

  it('takes a day earlier than the current one, today too', async () => {
    const app = connector();

    expect(await changing(app, '2026-06-15')).toEqual(
      done(
        'Plazo cambiado: se puede votar en «Cena de verano» hasta el 15 de junio de 2026.',
        '2026-06-15',
      ),
    );
  });

  it('takes the day 12 months ahead', async () => {
    const app = connector();

    await changing(app, '2027-06-15');

    expect(await votingOf(app)).toEqual({ state: 'open', deadline: '2027-06-15' });
  });

  it('reopens voting closed by its deadline, and says so', async () => {
    const app = connector({ clock: movingClock(afterDeadline) });

    expect(await changing(app, '2026-07-05')).toEqual(
      done(
        'Votación reabierta: se puede votar en «Cena de verano» hasta el 5 de julio de 2026.',
        '2026-07-05',
      ),
    );
    expect(await votingOf(app)).toEqual({ state: 'open', deadline: '2026-07-05' });
  });

  it('reopens voting closed today until the end of today', async () => {
    const app = connector();
    await calling(app, 'close_voting', { id: 'k3Jd9' });

    expect(await changing(app, '2026-06-15')).toEqual(
      done(
        'Votación reabierta: se puede votar en «Cena de verano» hasta el 15 de junio de 2026.',
        '2026-06-15',
      ),
    );
  });

  it('keeps a title’s own « and » from closing the mark of text written by people', async () => {
    const app = connector({ events: anas({ title: 'Cena «sorpresa»' }) });

    expect((await changing(app, '2026-07-05')).content[0]?.text).toBe(
      'Plazo cambiado: se puede votar en «Cena “sorpresa”» hasta el 5 de julio de 2026.',
    );
  });

  describe('a deadline that cannot be chosen', () => {
    it.each([
      [
        'a day before today',
        '2026-06-14',
        'No se ha cambiado el plazo: el 14 de junio de 2026 ya ha pasado.',
      ],
      [
        'a day more than 12 months ahead',
        '2027-06-16',
        'No se ha cambiado el plazo: puede ser como mucho dentro de 12 meses.',
      ],
    ])('refuses %s in words, and changes nothing', async (_case, deadline, said) => {
      const app = connector();

      expect(await changing(app, deadline)).toEqual(notDone(said));
      expect(await votingOf(app)).toEqual({ state: 'open', deadline: '2026-07-01' });
    });

    it('takes today in the event’s time zone: past midnight in Madrid, the day before has passed', async () => {
      // 00:30 on 15 June in Madrid, still 14 June in UTC.
      const app = connector({ clock: movingClock(new Date('2026-06-14T22:30:00Z')) });

      expect(await changing(app, '2026-06-14')).toEqual(
        notDone('No se ha cambiado el plazo: el 14 de junio de 2026 ya ha pasado.'),
      );
    });

    it('is answered by the protocol when it is not a day written AAAA-MM-DD, and changes nothing', async () => {
      const app = connector();

      const answer = await changing(app, '5 de julio');

      expect(answer.isError).toBe(true);
      expect(await votingOf(app)).toEqual({ state: 'open', deadline: '2026-07-01' });
    });
  });

  describe('an event whose deadline cannot change', () => {
    it('answers an event whose date is confirmed with that date, and changes nothing', async () => {
      const app = connector({ events: anas({ confirmedOption: july10 }) });

      expect(await changing(app, '2026-07-05')).toEqual(confirmed);
      expect((await votingOf(app)).deadline).toBe('2026-07-01');
    });

    it('answers with the date confirmed when it is confirmed while the deadline changes', async () => {
      expect(await changing(connector({ around: confirmedMeanwhile }), '2026-07-05')).toEqual(
        confirmed,
      );
    });

    it('answers that the event was cancelled when it is cancelled while the deadline changes', async () => {
      expect(await changing(connector({ around: cancelledMeanwhile }), '2026-07-05')).toEqual(
        notDone('El evento «Cena de verano» ha sido cancelado.'),
      );
    });

    it.each([
      ['another organizer’s event', 'Bp4Lk', 'No hay ningún evento tuyo con ese identificador.'],
      ['an event that does not exist', 'nope1', 'No hay ningún evento tuyo con ese identificador.'],
      ['a cancelled event', 'Xc7Tt', 'El evento «Cumpleaños» ha sido cancelado.'],
    ])('refuses %s in words', async (_case, id, said) => {
      expect(await changing(connector(), '2026-07-05', id)).toEqual(notDone(said));
    });
  });
});
