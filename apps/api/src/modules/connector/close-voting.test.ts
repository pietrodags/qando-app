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
  type App,
} from '../../test/connector-events.js';
import { movingClock } from '../../test/moving-clock.js';

const closing = (app: App, id = 'k3Jd9') => calling(app, 'close_voting', { id });

/** The event's voting as its management page reads it. */
async function votingOf(app: App): Promise<{ state: unknown; deadline: unknown }> {
  const { state, deadline } = (await managementPageOf(app)).body;
  return { state, deadline };
}

/** The day after the last day to vote, at 10:00 in Madrid: voting closed at the end of 1 July. */
const afterDeadline = new Date('2026-07-02T08:00:00Z');

const confirmed = notDone(
  'La fecha de «Cena de verano» ya está confirmada: viernes 10 de julio, sin horario. La confirmación es definitiva.',
);

describe('"Cerrar la votación" (close_voting)', () => {
  it.each(revisions)(
    'closes voting now in one call, as the management page does, and says to an assistant of the %s revision that the results go by email and how to reopen it',
    async (revision) => {
      const app = connector();

      const answer = await calling(app, 'close_voting', { id: 'k3Jd9' }, { revision });

      expect(answer).toEqual({
        content: [
          {
            type: 'text',
            text: 'Votación cerrada: «Cena de verano». Nadie más podrá votar ni cambiar su voto, y te enviaremos los resultados por email. Si cambias de idea, podrás reabrirla eligiendo un plazo nuevo.',
          },
        ],
        structuredContent: { id: 'k3Jd9', state: 'closed', deadline: '2026-06-15' },
      });
      expect(await votingOf(app)).toEqual({ state: 'closed', deadline: '2026-06-15' });
    },
  );

  it('says of voting closed by its deadline the day it closed, and changes nothing', async () => {
    const app = connector({ clock: movingClock(afterDeadline) });

    const answer = await closing(app);

    expect(answer).toEqual({
      content: [
        {
          type: 'text',
          text: 'La votación de «Cena de verano» ya se cerró el 1 de julio de 2026. Si cambias de idea, podrás reabrirla eligiendo un plazo nuevo.',
        },
      ],
      structuredContent: { id: 'k3Jd9', state: 'closed', deadline: '2026-07-01' },
    });
    expect(await votingOf(app)).toEqual({ state: 'closed', deadline: '2026-07-01' });
  });

  it('says to a second call, an assistant’s retry, that voting closed today', async () => {
    const app = connector();
    await closing(app);

    expect((await closing(app)).content).toEqual([
      {
        type: 'text',
        text: 'La votación de «Cena de verano» ya se cerró el 15 de junio de 2026. Si cambias de idea, podrás reabrirla eligiendo un plazo nuevo.',
      },
    ]);
  });

  it('keeps a title’s own « and » from closing the mark of text written by people', async () => {
    const app = connector({ events: anas({ title: 'Cena «sorpresa»' }) });

    expect((await closing(app)).content[0]?.text).toMatch(/^Votación cerrada: «Cena “sorpresa”»\./);
  });

  it('answers an event whose date is confirmed with that date, and changes nothing', async () => {
    const app = connector({ events: anas({ confirmedOption: july10 }) });

    expect(await closing(app)).toEqual(confirmed);
    expect((await votingOf(app)).deadline).toBe('2026-07-01');
  });

  it('answers with the date confirmed when it is confirmed while voting closes', async () => {
    const app = connector({ around: confirmedMeanwhile });

    expect(await closing(app)).toEqual(confirmed);
  });

  it('answers that the event was cancelled when it is cancelled while voting closes', async () => {
    const app = connector({ around: cancelledMeanwhile });

    expect(await closing(app)).toEqual(notDone('El evento «Cena de verano» ha sido cancelado.'));
  });

  it.each([
    ['another organizer’s event', 'Bp4Lk', 'No hay ningún evento tuyo con ese identificador.'],
    ['an event that does not exist', 'nope1', 'No hay ningún evento tuyo con ese identificador.'],
    ['a cancelled event', 'Xc7Tt', 'El evento «Cumpleaños» ha sido cancelado.'],
  ])('refuses %s in words', async (_case, id, said) => {
    expect(await closing(connector(), id)).toEqual(notDone(said));
  });
});
