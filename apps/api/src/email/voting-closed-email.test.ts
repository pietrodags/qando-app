import type { Option } from '@qando/contracts';
import type { VoteState } from '@qando/domain';
import { describe, expect, it } from 'vitest';
import { votingClosedEmail, type VotingClosedEmailData } from './voting-closed-email.js';

const siteUrl = 'https://qando.app';

const mon6: Option = {
  id: 'mon6',
  dates: { kind: 'single', date: '2026-07-06' },
  time: { kind: 'single', at: '21:00' },
};
const fri10: Option = {
  id: 'fri10',
  dates: { kind: 'single', date: '2026-07-10' },
  time: { kind: 'range', start: '20:30', end: '23:00' },
};
const sat11: Option = {
  id: 'sat11',
  dates: { kind: 'single', date: '2026-07-11' },
  time: { kind: 'single', at: '21:00' },
};
const weekend: Option = {
  id: 'weekend',
  dates: { kind: 'range', start: '2026-07-18', end: '2026-07-19' },
  time: null,
};

const p = 'preferred';
const a = 'available';
const u = 'unavailable';

/** A vote on "Cena de verano": its answers to Mon 6, Fri 10, Sat 11 and the weekend, in order. */
const vote = (...states: VoteState[]) =>
  Object.fromEntries([mon6, fri10, sat11].concat(weekend).map(({ id }, at) => [id, states[at]!]));

const cena = (votes: VotingClosedEmailData['votes']): VotingClosedEmailData => ({
  organizerName: 'Ana',
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  options: [mon6, fri10, sat11, weekend],
  votes,
  participationId: 'uHuaiU4BzZfa7oUR2OC3QQ',
  resultsId: 'Qw7p2aB2cD4eF6gH8iJ0kL',
  siteUrl,
});

// Saturday 11 wins on preferred over Friday 10, as well attended: the alternative.
const saturdayWins = cena([
  vote(u, a, p, u),
  vote(u, a, p, u),
  vote(u, p, a, u),
  vote(a, a, a, u),
  vote(u, u, u, a),
]);

// Friday 10 and Saturday 11 tie; the weekend, as well attended, is less preferred.
const fridayAndSaturdayTie = cena([
  vote(u, p, a, a),
  vote(u, p, a, a),
  vote(u, a, p, a),
  vote(u, a, p, u),
  vote(u, u, u, p),
]);

const footer = ['', '--', 'Recibes este correo porque has creado este evento en qando.', ''];

/** The hidden line mail clients show after the subject. */
const previewOf = (html: string) => /mso-hide:all;">([^<]*)<\/div>/.exec(html)?.[1];

describe('votingClosedEmail', () => {
  it('names the event in the subject', () => {
    expect(votingClosedEmail(saturdayWins).subject).toBe('Votación cerrada: Cena de verano');
  });

  it('gives the most voted date, the final count with the alternative and the way to confirm it', () => {
    expect(votingClosedEmail(saturdayWins).text).toBe(
      [
        'Hola, Ana:',
        '',
        'Se ha cerrado la votación de Cena de verano. Han votado 5 personas.',
        '',
        'La fecha más votada es:',
        '- sábado 11 de julio, a las 21:00',
        'Hora de Madrid',
        '',
        'Este es el cómputo final de la votación:',
        '- Sáb 11 Jul · 21:00: 2 preferida, 2 disponible, 1 no puede',
        '',
        'Fecha alternativa:',
        '- Vie 10 Jul · 20:30 → 23:00: 1 preferida, 3 disponible, 1 no puede',
        '',
        'Elige la fecha final: al confirmarla, todos verán la fecha elegida.',
        'Confirmar fecha: https://qando.app/manage/uHuaiU4BzZfa7oUR2OC3QQ',
        'Ver los resultados completos: https://qando.app/results/Qw7p2aB2cD4eF6gH8iJ0kL',
        ...footer,
      ].join('\n'),
    );
  });

  it('says the result in the preview, and the title and the voters in bold', () => {
    const { html } = votingClosedEmail(saturdayWins);

    expect(previewOf(html)).toBe('La fecha más votada es el sábado 11 de julio, a las 21:00.');
    expect(html).toContain(
      'Se ha cerrado la votación de <strong style="color:#444444;">Cena de verano</strong>. Han votado <strong style="color:#444444;">5 personas</strong>.',
    );
  });

  it('counts a single voter in the singular', () => {
    const { text } = votingClosedEmail(cena([vote(u, u, p, u)]));

    expect(text).toContain('\nSe ha cerrado la votación de Cena de verano. Ha votado 1 persona.\n');
  });

  it('names a range of days as dates, in the plural', () => {
    const { text, html } = votingClosedEmail(cena([vote(u, u, u, p)]));

    expect(text).toContain(
      '\nLas fechas más votadas son:\n- del sábado 18 al domingo 19 de julio\n\n',
    );
    expect(previewOf(html)).toBe(
      'Las fechas más votadas son del sábado 18 al domingo 19 de julio.',
    );
  });

  it('gives the time zone when one of the listed dates has a time', () => {
    const { text } = votingClosedEmail(cena([vote(u, u, a, a)]));

    expect(text).toContain(
      '\nHay un empate entre dos opciones:\n- sábado 11 de julio, a las 21:00\n- del sábado 18 al domingo 19 de julio\nHora de Madrid\n',
    );
  });

  it('gives no time zone when no listed date has a time', () => {
    expect(votingClosedEmail(cena([vote(u, u, u, p)])).text).not.toContain('Hora de');
  });

  it('lists both dates of a tie, with the alternative', () => {
    const { text, html } = votingClosedEmail(fridayAndSaturdayTie);

    expect(previewOf(html)).toBe('Hay un empate entre dos opciones.');
    expect(text).toContain(
      [
        '',
        'Hay un empate entre dos opciones:',
        '- viernes 10 de julio, de 20:30 a 23:00',
        '- sábado 11 de julio, a las 21:00',
        'Hora de Madrid',
        '',
        'Este es el cómputo final de la votación:',
        '- Vie 10 Jul · 20:30 → 23:00: 2 preferida, 2 disponible, 1 no puede',
        '- Sáb 11 Jul · 21:00: 2 preferida, 2 disponible, 1 no puede',
        '',
        'Fecha alternativa:',
        '- Sáb 18 → Dom 19 Jul: 1 preferida, 3 disponible, 1 no puede',
        '',
        'Elige la fecha final: al confirmarla, todos verán la fecha elegida.',
        '',
      ].join('\n'),
    );
  });

  it('lists three tied dates', () => {
    const { text, html } = votingClosedEmail(cena([vote(a, a, a, u)]));

    expect(previewOf(html)).toBe('Hay un empate entre tres opciones.');
    expect(text).toContain(
      '\nHay un empate entre tres opciones:\n- lunes 6 de julio, a las 21:00\n- viernes 10 de julio, de 20:30 a 23:00\n- sábado 11 de julio, a las 21:00\nHora de Madrid\n\n',
    );
  });

  it('lists more than one alternative under its plural heading', () => {
    const { text } = votingClosedEmail(cena([vote(a, p, a, a)]));

    expect(text).toContain(
      '\nFechas alternativas:\n- Lun 6 Jul · 21:00: 0 preferida, 1 disponible, 0 no puede\n- Sáb 11 Jul · 21:00: 0 preferida, 1 disponible, 0 no puede\n- Sáb 18 → Dom 19 Jul: 0 preferida, 1 disponible, 0 no puede\n\n',
    );
  });

  const fifth: Option = { id: 'fifth', dates: { kind: 'single', date: '2026-07-25' }, time: null };

  it.each([
    [
      'four of the five options',
      [mon6, fri10, sat11, weekend, fifth],
      '¡Vaya! Parece que no nos decidimos. Hay un empate entre varias opciones.',
    ],
    [
      'every option',
      [mon6, fri10, sat11, weekend],
      '¡Vaya! Parece que no nos decidimos. Hay un empate entre todas las opciones.',
    ],
  ])('says so when %s tie, with every bar and no date boxes', (_tie, options, sentence) => {
    const { text, html } = votingClosedEmail({ ...cena([vote(a, a, a, a)]), options });

    expect(previewOf(html)).toBe(sentence);
    expect(text).toContain(
      [
        'Ha votado 1 persona.',
        '',
        sentence,
        '',
        'Este es el cómputo final de la votación:',
        '- Lun 6 Jul · 21:00: 0 preferida, 1 disponible, 0 no puede',
        '- Vie 10 Jul · 20:30 → 23:00: 0 preferida, 1 disponible, 0 no puede',
        '- Sáb 11 Jul · 21:00: 0 preferida, 1 disponible, 0 no puede',
        '- Sáb 18 → Dom 19 Jul: 0 preferida, 1 disponible, 0 no puede',
        '',
        'Elige la fecha final:',
      ].join('\n'),
    );
    expect(html).not.toContain('padding:16px 12px;');
    expect(text).not.toContain('Hora de');
  });

  it('asks to extend the deadline or confirm a date anyway when nobody voted', () => {
    const { subject, text, html } = votingClosedEmail(cena([]));

    expect(subject).toBe('Votación cerrada: Cena de verano');
    expect(previewOf(html)).toBe('Nadie ha votado.');
    expect(html).toContain(
      'Se ha cerrado la votación de <strong style="color:#444444;">Cena de verano</strong> y <strong style="color:#444444;">nadie ha votado</strong>.',
    );
    expect(text).toBe(
      [
        'Hola, Ana:',
        '',
        'Se ha cerrado la votación de Cena de verano y nadie ha votado.',
        '',
        'Desde la gestión del evento puedes ampliar el plazo para que el grupo vote o confirmar una fecha igualmente.',
        '',
        'Gestionar evento: https://qando.app/manage/uHuaiU4BzZfa7oUR2OC3QQ',
        ...footer,
      ].join('\n'),
    );
  });

  it('says nobody can attend any date, with no bars, and offers to extend the deadline or confirm a date anyway', () => {
    const { text, html } = votingClosedEmail(cena([vote(u, u, u, u), vote(u, u, u, u)]));

    expect(previewOf(html)).toBe('Nadie puede asistir en ninguna de las fechas propuestas.');
    expect(text).toBe(
      [
        'Hola, Ana:',
        '',
        'Se ha cerrado la votación de Cena de verano. Han votado 2 personas.',
        '',
        'Nadie puede asistir en ninguna de las fechas propuestas.',
        '',
        'Desde la gestión del evento puedes ampliar el plazo o confirmar una fecha igualmente.',
        '',
        'Gestionar evento: https://qando.app/manage/uHuaiU4BzZfa7oUR2OC3QQ',
        ...footer,
      ].join('\n'),
    );
  });

  it('greets the organizer by name and draws the bars and the date boxes in HTML', () => {
    const { html } = votingClosedEmail(saturdayWins);

    expect(html).toContain('>Hola, Ana:</p>');
    expect(html).toContain('font-size:20px;font-weight:700;line-height:1.35;">sábado 11<span');
    expect(html).toContain('>Sáb 11 Jul · 21:00</p>\n<table role="presentation" width="100%"');
    expect(html).toContain('>Fecha alternativa:</p>');
    expect(html).toContain('href="https://qando.app/results/Qw7p2aB2cD4eF6gH8iJ0kL"');
  });
});
