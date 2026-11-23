import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { ManagedEvent, Option } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { installTestScreen } from '../../../test/media-queries';
import { Toaster } from '../../shared/ui/toast';
import { EventManagement } from './event-management';
import { OptionsEditor } from './options-editor';
import editorStyles from './options-editor.scss' with { loader: 'text' };

const TOKEN = 'Zx81aB2cD4eF6gH8iJ0kLm';
const MANAGED = '/api/events/k3Jd9';
const OPTIONS = '/api/events/k3Jd9/options';
const SAVED = 'Opciones guardadas: el enlace para votar ya muestra las nuevas.';
const FAILED = 'No se han podido guardar las opciones. Inténtalo de nuevo.';

@Component({ template: '' })
class ManageStub {}

@Component({ template: '' })
class Elsewhere {}

function id(n: number): string {
  return `6f1c2a0e-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
}

function single(date: string, n: number, at?: string): Option {
  return {
    id: id(n),
    dates: { kind: 'single', date },
    time: at === undefined ? null : { kind: 'single', at },
  };
}

function range(start: string, end: string, n: number): Option {
  return { id: id(n), dates: { kind: 'range', start, end }, time: null };
}

// Today is Monday 23 November 2026 in Madrid.
const gone = range('2026-11-10', '2026-11-12', 1);
const endsToday = range('2026-11-20', '2026-11-23', 9);
const nov21 = single('2026-11-21', 2);
const begun = range('2026-11-21', '2026-11-25', 3);
const nov27 = single('2026-11-27', 4);
const nov28 = single('2026-11-28', 5);
const dec5 = range('2026-12-05', '2026-12-06', 6);

const cena: ManagedEvent = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  deadline: '2026-11-26',
  state: 'open',
  options: [gone, endsToday, nov21, begun, nov27, nov28, dec5],
  confirmedOption: null,
  voters: 0,
  recommendedOptionIds: [],
  participationId: 'k3Jd9aB2cD4eF6gH8iJ0kL',
  resultsId: 'Qw7p2aB2cD4eF6gH8iJ0kL',
  emails: [],
};

/** The same event with times: two evenings at 21:00 and a weekend. */
const timed: ManagedEvent = {
  ...cena,
  options: [single('2026-11-27', 4, '21:00'), single('2026-11-28', 5, '21:00'), dec5],
};

function errorBody(code: string) {
  return { error: { code, message: code, details: [] } };
}

/** Lets a settled request's promise chain reach the next request. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('OptionsEditor', () => {
  let httpTesting: HttpTestingController;
  let harness: RouterTestingHarness;
  let fixture: ComponentFixture<unknown>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
    installTestScreen();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideI18n(),
        provideRouter(
          [
            { path: 'manage/:eventId/options', component: OptionsEditor },
            { path: 'manage/:eventId', component: ManageStub },
            { path: '**', component: Elsewhere },
          ],
          withComponentInputBinding(),
        ),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    TestBed.inject(EventManagement).claim('k3Jd9', TOKEN);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
    vi.useRealTimers();
  });

  async function update(): Promise<void> {
    await settle();
    await fixture.whenStable();
  }

  /** The management page, then the editor of its options, its event not read yet. */
  async function render(): Promise<void> {
    harness = await RouterTestingHarness.create('/manage/k3Jd9');
    fixture = harness.fixture;
    await harness.navigateByUrl('/manage/k3Jd9/options');
  }

  /** The editor opened on this event. */
  async function opened(event: ManagedEvent): Promise<void> {
    await render();
    const read = httpTesting.expectOne(MANAGED);
    expect(read.request.headers.get('x-management-token')).toBe(TOKEN);
    read.flush(event);
    await update();
  }

  function at(): { url: string; replaced: boolean | undefined } {
    const router = TestBed.inject(Router);
    return { url: router.url, replaced: router.lastSuccessfulNavigation()?.extras.replaceUrl };
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function editor(): HTMLElement | null {
    return element().querySelector('app-options-editor');
  }

  /** The card on screen. */
  function card(): HTMLElement {
    const found = element().querySelector<HTMLElement>('.step.card');
    if (!found) throw new Error('No card');
    return found;
  }

  /** The names of the steps, as their tabs and the card show them. */
  function steps(): string[] {
    return [...element().querySelectorAll('.step')].map(
      (each) => each.querySelector('.tab, .step-label')?.textContent.trim() ?? '',
    );
  }

  /** The arrows of the card: the step's own, or its pager's. */
  function arrows(): HTMLButtonElement[] {
    return [...card().querySelectorAll<HTMLButtonElement>('.nav button, app-step-pager button')];
  }

  function forward(): HTMLButtonElement {
    const found = arrows().at(-1);
    if (!found) throw new Error('No arrow that goes on');
    return found;
  }

  /** A press, and what follows it short of the answer of a request it makes. */
  async function click(target: HTMLElement): Promise<void> {
    target.click();
    await settle();
    TestBed.tick();
  }

  /** What the amber box above the calendar tells, each of its lines. */
  function told(): string[] {
    return [...card().querySelectorAll('.told app-notice-box p')].map((each) =>
      each.textContent.replace(/\s+/g, ' ').trim(),
    );
  }

  function month(): string | undefined {
    return card().querySelector('h2.month')?.textContent.trim();
  }

  function day(number: number): HTMLButtonElement {
    const found = [...card().querySelectorAll<HTMLButtonElement>('button.day')].find(
      (each) => each.textContent.trim() === String(number),
    );
    if (!found) throw new Error(`No day ${String(number)}`);
    return found;
  }

  function leave(): HTMLAnchorElement {
    const found = card().querySelector<HTMLAnchorElement>('a.leave');
    if (!found) throw new Error('No "Volver sin guardar"');
    return found;
  }

  function alerts(): string[] {
    return [...card().querySelectorAll('[role="alert"]')].map((each) => each.textContent.trim());
  }

  function retry(): HTMLButtonElement {
    const found = card().querySelector<HTMLButtonElement>('.failure button');
    if (!found) throw new Error('No "Reintentar"');
    return found;
  }

  function toast(): string | null {
    return TestBed.inject(Toaster).message();
  }

  it('is styled only with tokens', () => {
    expect(literalValues(editorStyles)).toEqual([]);
  });

  describe('while the event is read', () => {
    it('shows that it is loading', async () => {
      await render();

      expect(element().querySelector('app-loading-state')).not.toBeNull();
      httpTesting.expectOne(MANAGED).flush(cena);
      await update();
    });

    it('offers to read it again when it could not, and does', async () => {
      await render();
      httpTesting
        .expectOne(MANAGED)
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      await update();

      const again = element().querySelector<HTMLButtonElement>('app-error-state button');
      if (!again) throw new Error('No retry');
      await click(again);
      httpTesting.expectOne(MANAGED).flush(cena);
      await update();

      expect(steps()).toEqual(['fechas']);
    });
  });

  describe('on an event whose options can no longer change', () => {
    it.each<[string, ManagedEvent]>([
      ['someone has voted', { ...cena, voters: 1 }],
      ['voting is closed', { ...cena, state: 'closed' }],
      ['a date is confirmed', { ...cena, state: 'confirmed', confirmedOption: nov27 }],
    ])('goes back to the management page when %s', async (_case, event) => {
      await opened(event);

      expect(at()).toEqual({ url: '/manage/k3Jd9', replaced: true });
    });

    it('goes back to the management page when this browser does not manage the event', async () => {
      await render();
      httpTesting
        .expectOne(MANAGED)
        .flush(errorBody('FORBIDDEN'), { status: 403, statusText: 'Forbidden' });
      await update();

      expect(at()).toEqual({ url: '/manage/k3Jd9', replaced: true });
    });

    it('goes nowhere when the event is read after leaving the editor', async () => {
      await render();
      await harness.navigateByUrl('/somewhere');

      httpTesting.expectOne(MANAGED).flush({ ...cena, voters: 1 });
      await update();

      expect(at().url).toBe('/somewhere');
    });
  });

  describe('the dates', () => {
    it('are the only card without times, with no arrow back and a tick that saves', async () => {
      await opened(cena);

      expect(steps()).toEqual(['fechas']);
      expect(arrows().map((each) => each.getAttribute('aria-label'))).toEqual(['Guardar opciones']);
      expect(alerts()).toEqual([]);
    });

    it("open the smart calendar's box empty", async () => {
      await opened(cena);

      const asker = card().querySelector<HTMLInputElement>(
        'input[role="switch"][aria-label="Generar fechas con IA"]',
      );
      if (!asker) throw new Error('No switch of the smart calendar');
      await click(asker);

      expect(card().querySelector('textarea')?.value).toBe('');
    });

    it('leave out the options before today, each told in the amber box', async () => {
      await opened(cena);

      expect(told()).toEqual([
        'del martes 10 al jueves 12 de noviembre: ya ha pasado; lo hemos quitado.',
        'del viernes 20 al lunes 23 de noviembre: ya ha empezado; lo hemos quitado.',
        'sábado 21 de noviembre: ya ha pasado; lo hemos quitado.',
        'del sábado 21 al miércoles 25 de noviembre: ya ha empezado; lo hemos quitado.',
      ]);
    });

    it('tell nothing when no option has gone, and keep an option of today', async () => {
      const nov23 = single('2026-11-23', 7);
      await opened({ ...cena, options: [nov23, nov27] });

      expect(told()).toEqual([]);

      await click(forward());
      const request = httpTesting.expectOne(OPTIONS);
      expect((request.request.body as { options: unknown[] }).options).toEqual([
        { dates: { kind: 'single', date: '2026-11-23' }, time: null },
        { dates: { kind: 'single', date: '2026-11-27' }, time: null },
      ]);
      request.flush(cena);
      await update();
    });

    it("take today in the event's zone: in Kiritimati the 23rd has gone", async () => {
      const nov23 = single('2026-11-23', 7);
      await opened({ ...cena, timeZone: 'Pacific/Kiritimati', options: [nov23, nov27] });

      expect(told()).toEqual(['lunes 23 de noviembre: ya ha pasado; lo hemos quitado.']);
      expect(day(23).disabled).toBe(true);
      expect(day(24).disabled).toBe(false);
    });

    it('open on the month of the first option left', async () => {
      await opened({
        ...cena,
        options: [nov21, single('2027-01-09', 7), single('2027-01-16', 8)],
      });

      expect(month()).toBe('Enero 2027');
    });

    it("open on today's month when every option has gone, and save nothing", async () => {
      await opened({ ...cena, options: [gone, nov21] });

      expect(month()).toBe('Noviembre 2026');
      expect(forward().getAttribute('aria-disabled')).toBe('true');

      await click(forward());
    });
  });

  describe('saving', () => {
    /** The options the editor sent, and the options it said it replaces. */
    function sent(): { options: unknown; replacesOptionIds: unknown } {
      const request = httpTesting.expectOne(OPTIONS);
      expect(request.request.method).toBe('PUT');
      expect(request.request.headers.get('x-management-token')).toBe(TOKEN);
      return request.request.body as { options: unknown; replacesOptionIds: unknown };
    }

    it('sends the options left in place of every option the event had', async () => {
      await opened(cena);

      await click(forward());

      expect(sent()).toEqual({
        options: [
          { dates: { kind: 'single', date: '2026-11-27' }, time: null },
          { dates: { kind: 'single', date: '2026-11-28' }, time: null },
          { dates: { kind: 'range', start: '2026-12-05', end: '2026-12-06' }, time: null },
        ],
        replacesOptionIds: cena.options.map((option) => option.id),
      });
    });

    it('sends the dates as they were changed', async () => {
      await opened(cena);

      await click(day(30));
      await click(day(27));
      await click(forward());

      expect((sent().options as unknown[])[1]).toEqual({
        dates: { kind: 'single', date: '2026-11-30' },
        time: null,
      });
    });

    it('shows a spinner on the tick meanwhile, and a press sends nothing more', async () => {
      await opened(cena);

      await click(forward());
      await click(forward());

      expect(forward().querySelector('.spinner')).not.toBeNull();
      httpTesting.expectOne(OPTIONS).flush(cena);
      await update();
    });

    it('goes back to the management page once saved, and says so', async () => {
      await opened(cena);

      await click(forward());
      httpTesting.expectOne(OPTIONS).flush(cena);
      await update();

      expect(at()).toEqual({ url: '/manage/k3Jd9', replaced: true });
      expect(toast()).toBe(SAVED);
    });

    it.each<[string, number, object | null]>([
      ['someone voted meanwhile', 409, errorBody('VOTES_EXIST')],
      ['the options changed meanwhile', 409, errorBody('OPTIONS_CHANGED')],
      ['voting closed meanwhile', 409, errorBody('VOTING_CLOSED')],
      ['this browser no longer manages the event', 403, errorBody('FORBIDDEN')],
    ])('goes back to the management page, saying nothing, when %s', async (_case, status, body) => {
      await opened(cena);

      await click(forward());
      httpTesting.expectOne(OPTIONS).flush(body, { status, statusText: 'Refused' });
      await update();

      expect(at()).toEqual({ url: '/manage/k3Jd9', replaced: true });
      expect(toast()).toBeNull();
    });

    it('says when the options could not be saved, and saves them again with "Reintentar"', async () => {
      await opened(cena);

      await click(forward());
      httpTesting.expectOne(OPTIONS).flush(null, { status: 500, statusText: 'Server Error' });
      await update();

      expect(alerts()).toEqual([FAILED]);
      expect(forward().querySelector('.spinner')).toBeNull();
      expect(at().url).toBe('/manage/k3Jd9/options');

      await click(retry());
      expect(alerts()).toEqual([]);
      httpTesting.expectOne(OPTIONS).flush(cena);
      await update();

      expect(at().url).toBe('/manage/k3Jd9');
    });

    it('goes nowhere when the answer comes after leaving the editor', async () => {
      await opened(cena);

      await click(forward());
      await harness.navigateByUrl('/somewhere');
      httpTesting.expectOne(OPTIONS).flush(cena);
      await update();

      expect(at().url).toBe('/somewhere');
      expect(toast()).toBeNull();
    });
  });

  describe('with times', () => {
    /** From the dates to the times, then to their summary. */
    async function toSummary(): Promise<void> {
      await click(forward());
      await click(forward());
    }

    it('has the cards "fechas" and "horarios", the dates going on with an arrow', async () => {
      await opened(timed);

      expect(steps()).toEqual(['fechas']);
      expect(arrows().map((each) => each.getAttribute('aria-label'))).toEqual(['Siguiente']);

      await click(forward());

      expect(steps()).toEqual(['fechas', 'horarios']);
      expect(card().getAttribute('aria-label')).toBe('horarios');
      expect(card().querySelector('app-wizard-times')).not.toBeNull();
    });

    it('saves with the tick of the summary, the times sent', async () => {
      await opened(timed);

      await toSummary();
      expect(card().querySelector('app-wizard-summary')).not.toBeNull();
      expect(forward().getAttribute('aria-label')).toBe('Guardar opciones');
      await click(forward());

      const request = httpTesting.expectOne(OPTIONS);
      expect((request.request.body as { options: unknown[] }).options[0]).toEqual({
        dates: { kind: 'single', date: '2026-11-27' },
        time: { kind: 'single', at: '21:00' },
      });
      request.flush(timed);
      await update();
      expect(at().url).toBe('/manage/k3Jd9');
    });

    it('shows the times, not their summary, when the dates go on again', async () => {
      await opened(timed);

      await toSummary();
      const tab = element().querySelector<HTMLButtonElement>('.step .tab');
      if (!tab) throw new Error('No tab of the dates');
      await click(tab);
      await click(forward());

      expect(card().querySelector('app-wizard-times')).not.toBeNull();
    });

    it('keeps the other card closed while saving', async () => {
      await opened(timed);

      await toSummary();
      await click(forward());

      const tab = element().querySelector<HTMLButtonElement>('.step .tab');
      expect(tab?.disabled).toBe(true);
      httpTesting.expectOne(OPTIONS).flush(timed);
      await update();
    });

    it('tells a failure only on the card that saves', async () => {
      await opened(timed);

      await toSummary();
      await click(forward());
      httpTesting.expectOne(OPTIONS).flush(null, { status: 500, statusText: 'Server Error' });
      await update();
      expect(alerts()).toEqual([FAILED]);

      // Back from the summary to the times: they do not save.
      const [back] = arrows();
      if (!back) throw new Error('No arrow back');
      await click(back);

      expect(card().querySelector('app-wizard-times')).not.toBeNull();
      expect(alerts()).toEqual([]);
    });
  });

  describe('"Volver sin guardar"', () => {
    it('is under the arrows of every card', async () => {
      await opened(timed);
      expect(leave().textContent.trim()).toBe('Volver sin guardar');

      await click(forward());
      expect(leave().textContent.trim()).toBe('Volver sin guardar');

      await click(forward());
      expect(leave().textContent.trim()).toBe('Volver sin guardar');
    });

    it('goes back to the management page, saving nothing', async () => {
      await opened(cena);

      await click(leave());
      await update();

      expect(at()).toEqual({ url: '/manage/k3Jd9', replaced: true });
      expect(editor()).toBeNull();
    });
  });
});
