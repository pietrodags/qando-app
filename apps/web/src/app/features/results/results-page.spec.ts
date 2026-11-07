import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Option, Results, ResultsOption } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { ResultsPage } from './results-page';
import pageStyles from './results-page.scss' with { loader: 'text' };

function day(date: string, n = 1): Option {
  return {
    id: `6f1c2a0e-0000-4000-8000-00000000000${String(n)}`,
    dates: { kind: 'single', date },
    time: null,
  };
}

const july6 = day('2026-07-06', 1);
const july10 = day('2026-07-10', 2);
const july11 = day('2026-07-11', 3);

function counted(
  option: Option,
  [preferred, available, unavailable]: [number, number, number],
  names?: ResultsOption['names'],
): ResultsOption {
  return { option, preferred, available, unavailable, ...(names && { names }) };
}

const oneWinner: Results = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  final: false,
  outcome: 'one',
  voters: 3,
  attending: 3,
  notAttending: 0,
  winnersListed: true,
  winners: [
    counted(july10, [1, 2, 0], {
      preferred: ['Luis'],
      available: ['Álvaro', 'Marta'],
      unavailable: [],
    }),
  ],
  alternatives: [],
  confirmedOption: null,
};

describe('ResultsPage', () => {
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ResultsPage],
      providers: [
        provideI18n(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function render(resultsId = 'Qw7p2'): ComponentFixture<ResultsPage> {
    const fixture = TestBed.createComponent(ResultsPage);
    fixture.componentRef.setInput('resultsId', resultsId);
    TestBed.tick();
    return fixture;
  }

  async function opened(results: Results): Promise<ComponentFixture<ResultsPage>> {
    const fixture = render();
    httpTesting.expectOne('/api/results/Qw7p2').flush(results);
    await fixture.whenStable();
    return fixture;
  }

  function element(fixture: ComponentFixture<ResultsPage>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function textOf(fixture: ComponentFixture<ResultsPage>, selector: string): string | undefined {
    return element(fixture).querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim();
  }

  function textsOf(fixture: ComponentFixture<ResultsPage>, selector: string): string[] {
    return Array.from(element(fixture).querySelectorAll(selector), (found) =>
      found.textContent.replace(/\s+/g, ' ').trim(),
    );
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(pageStyles)).toEqual([]);
  });

  it('says it is loading while the results are on their way', () => {
    const fixture = render();

    expect(textOf(fixture, 'main')).toBe('Cargando…');

    httpTesting.expectOne('/api/results/Qw7p2').flush(oneWinner);
  });

  it('offers to try again when the results could not be read, and reads them again', async () => {
    const fixture = render();
    httpTesting
      .expectOne('/api/results/Qw7p2')
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    await fixture.whenStable();

    expect(textOf(fixture, 'main')).toContain('No se ha podido cargar');
    element(fixture).querySelector('button')?.click();
    TestBed.tick();

    httpTesting.expectOne('/api/results/Qw7p2').flush(oneWinner);
    await fixture.whenStable();
    expect(textOf(fixture, 'h1')).toBe('Cena de verano');
  });

  it.each([
    [404, { error: { code: 'NOT_FOUND', message: 'No event', details: [] } }],
    [400, { error: { code: 'VALIDATION_FAILED', message: 'Bad link', details: [] } }],
    [403, { error: { code: 'FORBIDDEN', message: 'Not a results link', details: [] } }],
  ])('shows the page not found for a link that opens no results (%i)', async (status, body) => {
    const fixture = render();
    httpTesting.expectOne('/api/results/Qw7p2').flush(body, { status, statusText: 'Refused' });
    await fixture.whenStable();

    expect(element(fixture).querySelector('app-not-found-card')).not.toBeNull();
    expect(element(fixture).querySelector('app-error-state')).toBeNull();
  });

  it('says the event was cancelled, under its title', async () => {
    const fixture = render();
    httpTesting.expectOne('/api/results/Qw7p2').flush(
      {
        error: {
          code: 'EVENT_CANCELLED',
          message: 'Cancelled',
          title: 'Cena de verano',
          details: [],
        },
      },
      { status: 410, statusText: 'Gone' },
    );
    await fixture.whenStable();

    expect(textOf(fixture, 'h1')).toBe('Cena de verano');
    expect(textOf(fixture, 'h2')).toBe('Evento cancelado');
  });

  describe('with one winner', () => {
    it('shows the title, the sentence and the winning date', async () => {
      const fixture = await opened(oneWinner);

      expect(textOf(fixture, '.corner')).toBe('resultados');
      expect(textOf(fixture, 'h1')).toBe('Cena de verano');
      expect(textOf(fixture, '.sentence')).toBe('La fecha elegida es:');
      expect(textsOf(fixture, '.winning-dates li')).toEqual(['viernes 10 de julio']);
    });

    it('draws the connecting words of the date smaller', async () => {
      const fixture = await opened(oneWinner);

      expect(textsOf(fixture, '.winning-dates .minor')).toEqual(['de']);
    });

    it('says the dates of a winning range of days in the plural', async () => {
      const range: Option = {
        ...july6,
        dates: { kind: 'range', start: '2026-07-06', end: '2026-07-08' },
      };
      const fixture = await opened({
        ...oneWinner,
        winners: [counted(range, [0, 2, 0])],
      });

      expect(textOf(fixture, '.sentence')).toBe('Las fechas elegidas son:');
      expect(textsOf(fixture, '.winning-dates li')).toEqual([
        'del lunes 6 al miércoles 8 de julio',
      ]);
    });

    it('counts the voters and who can and cannot attend the winner', async () => {
      const fixture = await opened({ ...oneWinner, voters: 4, attending: 3, notAttending: 1 });

      expect(textsOf(fixture, '.counter')).toEqual(['4 Votantes', '3 Asisten', '1 No asisten']);
    });

    it("offers the winner's attendee list, closed", async () => {
      const fixture = await opened(oneWinner);
      const toggle = element(fixture).querySelector<HTMLButtonElement>('.winner-names button');

      expect(toggle?.textContent.trim()).toBe('Lista de asistentes');
      expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    });
  });

  it.each([
    ['two', 'Hay un empate entre dos opciones:'],
    ['three', 'Hay un empate entre tres opciones:'],
  ] as const)(
    'lists every winner of a tie (%s) and points to their lists',
    async (outcome, sentence) => {
      const fixture = await opened({
        ...oneWinner,
        outcome,
        winners: [
          counted(july6, [1, 1, 0], { preferred: ['Luis'], available: ['Marta'], unavailable: [] }),
          counted(july10, [1, 1, 0], {
            preferred: ['Marta'],
            available: ['Luis'],
            unavailable: [],
          }),
        ],
      });

      expect(textOf(fixture, '.sentence')).toBe(sentence);
      expect(textsOf(fixture, '.winning-dates li')).toEqual([
        'lunes 6 de julio',
        'viernes 10 de julio',
      ]);
      expect(textOf(fixture, '.tie-hint')).toBe('Mira la lista de asistentes en los resultados');
      expect(element(fixture).querySelector('.winner-names')).toBeNull();
    },
  );

  it.each([
    ['several', '¡Vaya! Parece que no nos decidimos. Hay un empate entre varias opciones.'],
    ['all', '¡Vaya! Parece que no nos decidimos. Hay un empate entre todas las opciones.'],
  ] as const)('lists no winning dates when too many tie (%s)', async (outcome, sentence) => {
    const fixture = await opened({ ...oneWinner, outcome, winnersListed: false });

    expect(textOf(fixture, '.sentence')).toBe(sentence);
    expect(element(fixture).querySelector('.winning-dates')).toBeNull();
    expect(element(fixture).querySelector('.tie-hint')).toBeNull();
  });

  it('shows no names at all on an anonymous event', async () => {
    const fixture = await opened({
      ...oneWinner,
      winners: [counted(july10, [1, 2, 0])],
      alternatives: [counted(july6, [0, 3, 0])],
    });

    expect(element(fixture).querySelector('app-name-list')).toBeNull();
    expect(element(fixture).querySelector('.tie-hint')).toBeNull();
  });

  it('says nobody has voted yet, with no chart', async () => {
    const fixture = await opened({
      ...oneWinner,
      outcome: 'no-votes',
      voters: 0,
      attending: 0,
      winnersListed: false,
      winners: [],
    });

    expect(textOf(fixture, '.sentence')).toBe('Aún no ha votado nadie.');
    expect(textsOf(fixture, '.counter')).toEqual(['0 Votantes', '0 Asisten', '0 No asisten']);
    expect(element(fixture).querySelector('app-results-chart')).toBeNull();
  });

  it('says nobody can attend any option, with no chart', async () => {
    const fixture = await opened({
      ...oneWinner,
      outcome: 'nobody-can-attend',
      attending: 0,
      notAttending: 3,
      winnersListed: false,
      winners: [],
    });

    expect(textOf(fixture, '.sentence')).toBe(
      'Nadie puede asistir en ninguna de las fechas propuestas.',
    );
    expect(element(fixture).querySelector('app-results-chart')).toBeNull();
  });

  it('calls the tally provisional while voting is open, final after', async () => {
    const open = await opened(oneWinner);
    expect(textOf(open, '.tally')).toBe('Este es el cómputo provisional de la votación:');

    open.destroy();
    const closed = await opened({ ...oneWinner, final: true });
    expect(textOf(closed, '.tally')).toBe('Este es el cómputo final de la votación:');
  });

  it('shows the confirmed date apart from the recommended option', async () => {
    const fixture = await opened({ ...oneWinner, final: true, confirmedOption: july11 });

    expect(textOf(fixture, '.confirmed')).toBe('Fecha confirmada: sábado 11 de julio');
    expect(textOf(fixture, '.sentence')).toBe('La fecha más votada es:');
    expect(textsOf(fixture, '.winning-dates li')).toEqual(['viernes 10 de julio']);
  });

  it('calls a winning range of days the most voted once a date is confirmed', async () => {
    const range: Option = {
      ...july6,
      dates: { kind: 'range', start: '2026-07-06', end: '2026-07-08' },
    };
    const fixture = await opened({
      ...oneWinner,
      final: true,
      confirmedOption: july11,
      winners: [counted(range, [0, 2, 0])],
    });

    expect(textOf(fixture, '.sentence')).toBe('Las fechas más votadas son:');
  });

  it('keeps the sentence of a tie once a date is confirmed', async () => {
    const fixture = await opened({
      ...oneWinner,
      outcome: 'two',
      confirmedOption: july11,
      winners: [counted(july6, [0, 1, 0]), counted(july10, [0, 1, 0])],
    });

    expect(textOf(fixture, '.sentence')).toBe('Hay un empate entre dos opciones:');
  });

  it('charts the winners and the alternatives', async () => {
    const fixture = await opened({ ...oneWinner, alternatives: [counted(july6, [0, 3, 0])] });

    expect(textsOf(fixture, 'app-results-chart .option-title')).toEqual([
      'Vie 10 Jul',
      'Lun 6 Jul',
    ]);
  });

  describe('shares the results link', () => {
    function shareLinks(fixture: ComponentFixture<ResultsPage>) {
      return element(fixture).querySelector('app-share-links');
    }

    it('with the decided date when there is one winner', async () => {
      const fixture = await opened(oneWinner);
      const whatsapp = shareLinks(fixture)?.querySelector<HTMLAnchorElement>('a[title="WhatsApp"]');

      expect(decodeURIComponent(whatsapp?.href ?? '')).toBe(
        `https://wa.me/?text=Ya tenemos fecha para Cena de verano: viernes 10 de julio\n\n${location.origin}/results/Qw7p2`,
      );
    });

    it('with the confirmed date once there is one', async () => {
      const fixture = await opened({ ...oneWinner, final: true, confirmedOption: july11 });
      const whatsapp = shareLinks(fixture)?.querySelector<HTMLAnchorElement>('a[title="WhatsApp"]');

      expect(decodeURIComponent(whatsapp?.href ?? '')).toContain(
        'Ya tenemos fecha para Cena de verano: sábado 11 de julio',
      );
    });

    it('inviting to see the results otherwise', async () => {
      const fixture = await opened({
        ...oneWinner,
        outcome: 'two',
        winners: [counted(july6, [0, 1, 0]), counted(july10, [0, 1, 0])],
      });
      const whatsapp = shareLinks(fixture)?.querySelector<HTMLAnchorElement>('a[title="WhatsApp"]');

      expect(decodeURIComponent(whatsapp?.href ?? '')).toContain(
        'Mira los resultados de la votación para Cena de verano\n\n',
      );
    });
  });
});
