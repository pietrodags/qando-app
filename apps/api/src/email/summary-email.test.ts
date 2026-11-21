import type { ProposedOption } from '@qando/domain';
import { describe, expect, it } from 'vitest';
import { summaryEmail, type SummaryEmailData } from './summary-email.js';

const siteUrl = 'https://qando.app';

const at = (date: string, time: string): ProposedOption => ({
  dates: { kind: 'single', date },
  time: { kind: 'single', at: time },
});

const cena: SummaryEmailData = {
  organizerName: 'Ana',
  title: 'Cena de verano',
  note: 'Traed algo de postre, yo pongo la bebida.',
  options: [
    at('2026-07-06', '21:00'),
    {
      dates: { kind: 'single', date: '2026-07-10' },
      time: { kind: 'range', start: '20:30', end: '23:00' },
    },
    at('2026-07-11', '21:00'),
    { dates: { kind: 'range', start: '2026-07-18', end: '2026-07-19' }, time: null },
  ],
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  participationId: 'uHuaiU4BzZfa7oUR2OC3QQ',
  siteUrl,
};

/** Every day of July from the 1st, at nine in the evening. */
const julyEvenings = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    at(`2026-07-${String(index + 1).padStart(2, '0')}`, '21:00'),
  );

/** The labels of the options' pills, in order. */
const pillsOf = (html: string) =>
  [...html.matchAll(/white-space:nowrap;">([^<]*)<\/span>/g)].map(([, label]) => label);

describe('summaryEmail', () => {
  it('names the event in the subject', () => {
    expect(summaryEmail(cena).subject).toBe('Resumen de tu evento: Cena de verano');
  });

  it('says what the event is, how to share it, until when to vote and where to manage it', () => {
    expect(summaryEmail(cena).text).toBe(
      [
        'Hola, Ana:',
        '',
        'Aquí tienes el resumen de Cena de verano.',
        '',
        'Opciones propuestas para la votación:',
        '- Lun 6 Jul · 21:00',
        '- Vie 10 Jul · 20:30 → 23:00',
        '- Sáb 11 Jul · 21:00',
        '- Sáb 18 → Dom 19 Jul',
        'Hora de Madrid',
        '',
        '"Traed algo de postre, yo pongo la bebida."',
        '',
        'Comparte el enlace para votar: https://qando.app/vote/uHuaiU4BzZfa7oUR2OC3QQ',
        '',
        'Se puede votar hasta el miércoles 1 de julio de 2026 (hora de Madrid). Cuando se cierre la votación, te enviaremos los resultados.',
        '',
        'Desde la gestión del evento puedes ver cómo va la votación y confirmar la fecha final:',
        'Gestionar evento: https://qando.app/manage/uHuaiU4BzZfa7oUR2OC3QQ',
        '',
        '--',
        'Recibes este correo porque has creado este evento en qando.',
        '',
      ].join('\n'),
    );
  });

  it('shows the same in HTML: the title and the deadline in bold, the preview text about the links', () => {
    const { html } = summaryEmail(cena);

    expect(html).toContain('mso-hide:all;">El enlace para votar y la gestión de tu evento.</div>');
    expect(html).toContain(
      '>Aquí tienes el resumen de <strong style="color:#444444;">Cena de verano</strong>.</p>',
    );
    expect(pillsOf(html)).toEqual([
      'Lun 6 Jul · 21:00',
      'Vie 10 Jul · 20:30 → 23:00',
      'Sáb 11 Jul · 21:00',
      'Sáb 18 → Dom 19 Jul',
    ]);
    expect(html).toContain(
      '>Se puede votar hasta el <strong style="color:#444444;">miércoles 1 de julio de 2026</strong> (hora de Madrid).',
    );
    expect(html).toContain('<a href="https://qando.app/manage/uHuaiU4BzZfa7oUR2OC3QQ" ');
    expect(html).toContain('>Gestionar evento</a>');
    expect(html).toContain('en <strong>qando</strong>.</td>');
  });

  it('lists up to eight options', () => {
    const email = summaryEmail({ ...cena, options: julyEvenings(8) });

    expect(pillsOf(email.html)).toHaveLength(8);
    expect(pillsOf(email.html).at(-1)).toBe('Mié 8 Jul · 21:00');
    expect(email.text).not.toContain('+ ');
  });

  it.each([
    [9, '+ 2'],
    [12, '+ 5'],
  ])('lists the first seven of %i options and how many more there are', (count, more) => {
    const email = summaryEmail({ ...cena, options: julyEvenings(count) });

    expect(pillsOf(email.html)).toEqual([
      ...pillsOf(summaryEmail({ ...cena, options: julyEvenings(7) }).html),
      more,
    ]);
    expect(email.text).toContain(`- Mar 7 Jul · 21:00\n${more}\nHora de Madrid\n`);
  });

  it.each([
    ['no note', null],
    ['an empty note', ''],
    ['a note of only spaces', '   '],
  ])('quotes nothing for %s', (_, note) => {
    const email = summaryEmail({ ...cena, note });

    expect(email.text).toContain('Hora de Madrid\n\nComparte el enlace para votar:');
    expect(email.html).not.toContain('font-style:italic');
  });

  it('names the event’s time zone by its city', () => {
    const email = summaryEmail({ ...cena, timeZone: 'America/New_York' });

    expect(email.text).toContain('\nHora de New York\n');
    expect(email.text).toContain('de 2026 (hora de New York).');
  });

  it('links the pages from a site address with a trailing slash too', () => {
    const { text } = summaryEmail({ ...cena, siteUrl: `${siteUrl}/` });

    expect(text).toContain(': https://qando.app/vote/uHuaiU4BzZfa7oUR2OC3QQ\n');
    expect(text).toContain(': https://qando.app/manage/uHuaiU4BzZfa7oUR2OC3QQ\n');
  });
});
