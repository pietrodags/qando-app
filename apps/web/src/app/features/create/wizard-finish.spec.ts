import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { managementTokenSchema } from '@qando/contracts';
import { ManagementTokens } from '../../core/auth/management-tokens';
import { Session } from '../../core/auth/session';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { type DateSelection, NO_DATES } from './date-selection';
import { type CreatedEvent, type EventEnding, NO_ENDING, WizardFinish } from './wizard-finish';
import finishStyles from './wizard-finish.scss' with { loader: 'text' };

const ana = { name: 'Ana', email: 'ana@example.com' };
const createRequest = { method: 'POST', url: '/api/events' };
const created = {
  participationId: 'uHuaiU4BzZfa7oUR2OC3QQ',
  resultsId: 'r3sUlTs4BzZfa7oUR2OC3QQ',
};
/** The management token the page holds for the event it makes. */
const pageToken = 'm4n4g3m3ntT0k3nOfTheEventXYZ123456789abcdefg';
/** Saturday 28 November and Saturday 5 December 2026, whole days. */
const twoSaturdays: DateSelection = { ...NO_DATES, singles: ['2026-11-28', '2026-12-05'] };

/** Lets a settled request's promise chain run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('WizardFinish', () => {
  let fixture: ComponentFixture<WizardFinish>;
  let httpTesting: HttpTestingController;
  let events: string[];
  let createdEvents: CreatedEvent[];

  beforeEach(() => {
    // Friday 20 November 2026.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12));
    TestBed.configureTestingModule({
      imports: [WizardFinish],
      providers: [provideI18n(), provideHttpClient(), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.useRealTimers();
    localStorage.clear();
  });

  async function render({
    selection = twoSaturdays,
    ending = NO_ENDING,
    step = 3,
    account = ana,
  }: {
    selection?: DateSelection;
    ending?: EventEnding;
    step?: number;
    account?: typeof ana | null;
  } = {}): Promise<void> {
    TestBed.inject(Session);
    const asked = httpTesting.expectOne('/api/auth/session');
    if (account) asked.flush(account);
    else asked.flush(null, { status: 401, statusText: 'Unauthorized' });
    await settle();
    fixture = TestBed.createComponent(WizardFinish);
    fixture.componentRef.setInput('details', { organizerName: 'Ana', title: 'Cena de verano' });
    fixture.componentRef.setInput('selection', selection);
    fixture.componentRef.setInput('step', step);
    fixture.componentRef.setInput('ending', ending);
    fixture.componentRef.setInput('token', pageToken);
    events = [];
    createdEvents = [];
    fixture.componentInstance.back.subscribe(() => events.push('back'));
    fixture.componentInstance.sending.subscribe((sending) => events.push(`sending ${sending}`));
    fixture.componentInstance.created.subscribe((event) => createdEvents.push(event));
    await fixture.whenStable();
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(selector: string): string {
    return element().querySelector(selector)?.textContent.trim().replace(/\s+/g, ' ') ?? 'none';
  }

  function button(name: string): HTMLButtonElement {
    const found = Array.from(element().querySelectorAll('button')).find(
      (candidate) =>
        (candidate.getAttribute('aria-label') ?? candidate.textContent.trim()) === name,
    );
    if (!found) throw new Error(`No button ${name}`);
    return found;
  }

  function deadlineField(): HTMLButtonElement {
    const found = element().querySelector<HTMLButtonElement>('app-deadline-field button');
    if (!found) throw new Error('No deadline field');
    return found;
  }

  function note(): HTMLTextAreaElement {
    const found = element().querySelector<HTMLTextAreaElement>('textarea');
    if (!found) throw new Error('No note');
    return found;
  }

  function anonymousSwitch(): HTMLInputElement {
    const found = element().querySelector<HTMLInputElement>('input[role="switch"]');
    if (!found) throw new Error('No switch');
    return found;
  }

  function ending(): EventEnding {
    return fixture.componentInstance.ending();
  }

  async function click(target: HTMLElement): Promise<void> {
    target.click();
    await fixture.whenStable();
  }

  async function type(value: string): Promise<void> {
    note().value = value;
    note().setSelectionRange(value.length, value.length);
    note().dispatchEvent(new InputEvent('input'));
    await fixture.whenStable();
  }

  /** The deadline chosen on the field's calendar, a day of November. */
  async function pickDay(day: number): Promise<void> {
    await click(deadlineField());
    const found = Array.from(
      element().querySelectorAll<HTMLButtonElement>('app-deadline-field button.day'),
    ).find((candidate) => candidate.textContent.trim() === String(day));
    if (!found) throw new Error(`No day ${String(day)}`);
    await click(found);
  }

  async function create(): Promise<void> {
    await click(button('Crear'));
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(finishStyles)).toEqual([]);
  });

  describe('its fields', () => {
    it('ask for the deadline, a note, anonymous voting, then show the email, in this order', async () => {
      await render();

      expect(
        Array.from(element().querySelectorAll('.label')).map((label) => label.textContent.trim()),
      ).toEqual([
        '¿Hasta cuándo quieres que voten los participantes?',
        'Añade un comentario, si quieres.',
        'Tu email, para recibir un resumen y los resultados.',
      ]);
      expect(text('app-switch')).toBe('Voto anónimo');
      expect(text('.email')).toBe('ana@example.com');
    });

    it('start with the suggested deadline, no note and anonymous voting off', async () => {
      await render();

      expect(text('#deadline-value')).toBe('vie 27 nov 2026');
      expect(note().value).toBe('');
      expect(anonymousSwitch().checked).toBe(false);
    });

    it('show no email without a session', async () => {
      await render({ account: null });

      expect(element().querySelector('.email')).toBeNull();
      expect(element().textContent).not.toContain('Tu email');
    });
  });

  describe('the deadline', () => {
    it('follows the dates while it is the suggested one', async () => {
      await render();

      fixture.componentRef.setInput('selection', { ...NO_DATES, singles: ['2026-11-22'] });
      await fixture.whenStable();

      expect(text('#deadline-value')).toBe('sáb 21 nov 2026');
      expect(ending().deadline).toBeNull();
    });

    it('is kept once the organizer has chosen it, whatever the dates', async () => {
      await render();

      await pickDay(25);
      fixture.componentRef.setInput('selection', { ...NO_DATES, singles: ['2026-12-20'] });
      await fixture.whenStable();

      expect(ending().deadline).toBe('2026-11-25');
      expect(text('#deadline-value')).toBe('mié 25 nov 2026');
    });

    it('is shown as it was chosen when the step comes back', async () => {
      await render({ ending: { ...NO_ENDING, deadline: '2026-11-24' } });

      expect(text('#deadline-value')).toBe('mar 24 nov 2026');
    });

    it('rings the dates proposed on its calendar', async () => {
      await render();

      await click(deadlineField());

      const ringed = Array.from(
        element().querySelectorAll('app-deadline-field button.day.proposed'),
      ).map((day) => day.textContent.trim());
      expect(ringed).toEqual(['28']);
    });
  });

  describe('the warning', () => {
    function warning(): string {
      return text('.warning');
    }

    it('is not there while voting ends before the first date', async () => {
      await render();

      expect(element().querySelector('.warning')).toBeNull();
    });

    it('tells the first date once voting ends on it or after it, in a live region', async () => {
      await render();

      await pickDay(28);

      expect(warning()).toBe(
        'Ojo: la votación cierra después de la primera fecha, el sábado 28 de noviembre.',
      );
      expect(element().querySelector('.warning')?.closest('[role="status"]')).not.toBeNull();
    });

    it('is there from the start when the first date is today', async () => {
      await render({ selection: { ...NO_DATES, singles: ['2026-11-20'] } });

      expect(warning()).toBe(
        'Ojo: la votación cierra después de la primera fecha, el viernes 20 de noviembre.',
      );
    });

    it('says the year of a first date in another year', async () => {
      await render({
        selection: { ...NO_DATES, singles: ['2027-01-08'] },
        ending: { ...NO_ENDING, deadline: '2027-01-09' },
      });

      expect(warning()).toBe(
        'Ojo: la votación cierra después de la primera fecha, el viernes 8 de enero de 2027.',
      );
    });

    it('counts the first day of a saved range too', async () => {
      await render({
        selection: { ...NO_DATES, saved: [{ start: '2026-11-23', end: '2026-11-25' }] },
        ending: { ...NO_ENDING, deadline: '2026-11-24' },
      });

      expect(warning()).toBe(
        'Ojo: la votación cierra después de la primera fecha, el lunes 23 de noviembre.',
      );
    });
  });

  describe('the note', () => {
    it('is kept as it is typed', async () => {
      await render();

      await type('Cenamos en casa de Marta.');

      expect(ending().note).toBe('Cenamos en casa de Marta.');
    });

    it('counts its characters as people see them, out of 150', async () => {
      await render();
      expect(text('.count')).toBe('0/150');

      await type('Cena 👨‍👩‍👧');

      expect(text('.count')).toBe('6/150');
    });

    it('leaves the spaces around its text out of the count', async () => {
      await render();

      await type('  Cena en casa  ');

      expect(text('.count')).toBe('12/150');
    });

    it('stops at 150 characters', async () => {
      await render();

      await type('a'.repeat(151));

      expect(ending().note).toBe('a'.repeat(150));
      expect(text('.count')).toBe('150/150');
    });

    it('is described by its count, which is never read out as it changes', async () => {
      await render();

      const count = element().querySelector(`#${note().getAttribute('aria-describedby') ?? ''}`);

      expect(count?.textContent.trim()).toBe('0/150');
      expect(count?.closest('[role="status"], [aria-live]')).toBeNull();
    });

    it('is labelled by its question', async () => {
      await render();

      expect(element().querySelector(`label[for="${note().id}"]`)?.textContent.trim()).toBe(
        'Añade un comentario, si quieres.',
      );
    });
  });

  describe('anonymous voting', () => {
    it('is turned on and off with its switch', async () => {
      await render();

      await click(anonymousSwitch());
      expect(ending().anonymous).toBe(true);

      await click(anonymousSwitch());
      expect(ending().anonymous).toBe(false);
    });

    it('explains itself in a tip that its button opens and closes', async () => {
      await render();
      const info = button('¿Qué es el voto anónimo?');
      expect(info.getAttribute('aria-expanded')).toBe('false');
      expect(element().querySelector('app-tooltip')).toBeNull();

      await click(info);

      expect(info.getAttribute('aria-expanded')).toBe('true');
      expect(
        Array.from(element().querySelectorAll('app-tooltip > *')).map((part) =>
          part.textContent.trim(),
        ),
      ).toEqual([
        'Voto anónimo',
        'Si activas este switch, el voto será anónimo y no se pedirá el nombre a los participantes al voto.',
        'Más facilidad para ellos; menos trazabilidad para ti.',
      ]);

      await click(info);

      expect(element().querySelector('app-tooltip')).toBeNull();
    });

    it('closes its tip on Escape and on a press anywhere else', async () => {
      await render();
      const info = button('¿Qué es el voto anónimo?');

      await click(info);
      info.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await fixture.whenStable();
      expect(element().querySelector('app-tooltip')).toBeNull();

      await click(info);
      await click(note());
      expect(element().querySelector('app-tooltip')).toBeNull();
    });
  });

  describe('its arrow back', () => {
    it('goes back to the step before', async () => {
      await render();

      await click(button('Volver al paso 2'));

      expect(events).toEqual(['back']);
    });

    it('names the summary as the step before when times are asked for', async () => {
      await render({ step: 5 });

      expect(button('Volver al paso 4')).toBeTruthy();
    });
  });

  describe('"Crear"', () => {
    it('sends the event with every option, the deadline, the note and anonymous voting', async () => {
      await render({
        selection: {
          ...NO_DATES,
          singles: ['2026-11-28'],
          saved: [{ start: '2026-12-01', end: '2026-12-03' }],
        },
      });
      await type('Cenamos en casa de Marta.');
      await click(anonymousSwitch());

      await create();

      const request = httpTesting.expectOne(createRequest);
      expect(request.request.headers.get('X-Management-Token')).toBe(pageToken);
      expect(request.request.body).toEqual({
        title: 'Cena de verano',
        organizerName: 'Ana',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        deadline: '2026-11-27',
        note: 'Cenamos en casa de Marta.',
        anonymous: true,
        options: [
          { dates: { kind: 'single', date: '2026-11-28' }, time: null },
          { dates: { kind: 'range', start: '2026-12-01', end: '2026-12-03' }, time: null },
        ],
      });
      request.flush(created, { status: 201, statusText: 'Created' });
      await settle();
    });

    it('shows no failure, nor "Reintentar", before anything is sent', async () => {
      await render();

      expect(element().querySelector('[role="alert"]')).toBeNull();
      expect(element().querySelector('.retry')).toBeNull();
    });

    it('sends the deadline suggested for the day it is pressed, not for the day the step opened', async () => {
      // A date far enough: the deadline suggested is a week from today.
      await render({ selection: { ...NO_DATES, singles: ['2026-12-12'] } });
      expect(text('#deadline-value')).toBe('vie 27 nov 2026');

      // Past midnight, with the step still open.
      vi.setSystemTime(new Date(2026, 10, 21, 0, 5));
      await create();

      const request = httpTesting.expectOne(createRequest);
      expect((request.request.body as { deadline: string }).deadline).toBe('2026-11-28');
      request.flush(created, { status: 201, statusText: 'Created' });
      await settle();
    });

    it('sends the deadline the organizer chose', async () => {
      await render();
      await pickDay(25);

      await create();

      const request = httpTesting.expectOne(createRequest);
      expect((request.request.body as { deadline: string }).deadline).toBe('2026-11-25');
      request.flush(created, { status: 201, statusText: 'Created' });
      await settle();
    });

    it('shows a spinner in its place, the fields dimmed and off and the way back closed, while it waits', async () => {
      await render();

      await create();

      expect(button('Crear').querySelector('.spinner')).not.toBeNull();
      expect(element().querySelector('fieldset')?.disabled).toBe(true);
      expect(button('Volver al paso 2').disabled).toBe(true);
      expect(events).toEqual(['sending true']);
      httpTesting.expectOne(createRequest).flush(created, { status: 201, statusText: 'Created' });
      await settle();
    });

    it('sends once, however many times it is pressed while it waits', async () => {
      await render();

      await create();
      await create();

      httpTesting.expectOne(createRequest).flush(created, { status: 201, statusText: 'Created' });
      await settle();
    });

    it('keeps the event’s management link in this browser and tells the page it is created', async () => {
      await render();
      await create();

      httpTesting.expectOne(createRequest).flush(created, { status: 201, statusText: 'Created' });
      await settle();
      await fixture.whenStable();

      expect(TestBed.inject(ManagementTokens).of(created.participationId)).toBe(pageToken);
      expect(createdEvents).toEqual([
        { participationId: created.participationId, deadline: '2026-11-27' },
      ]);
      expect(events).toEqual(['sending true', 'sending false']);
    });

    it('keeps everything and says so when the event could not be created', async () => {
      await render();
      await type('Cenamos en casa de Marta.');
      await create();

      httpTesting.expectOne(createRequest).flush(
        { error: { code: 'INTERNAL', message: 'x', details: [] } },
        {
          status: 500,
          statusText: 'Internal Server Error',
        },
      );
      await settle();
      await fixture.whenStable();

      expect(text('[role="alert"]')).toBe('No se ha podido crear el evento. Inténtalo de nuevo.');
      expect(note().value).toBe('Cenamos en casa de Marta.');
      expect(element().querySelector('fieldset')?.disabled).toBe(false);
      expect(button('Crear').querySelector('.spinner')).toBeNull();
      expect(createdEvents).toEqual([]);
      expect(events).toEqual(['sending true', 'sending false']);
    });

    it('sends again with "Reintentar", the focus on "Crear" meanwhile', async () => {
      await render();
      await create();
      httpTesting.expectOne(createRequest).error(new ProgressEvent('error'));
      await settle();
      await fixture.whenStable();

      await click(button('Reintentar'));

      expect(element().querySelector('[role="alert"]')).toBeNull();
      expect(document.activeElement).toBe(button('Crear'));
      const again = httpTesting.expectOne(createRequest);
      // The same token: if the first send did store the event, this one answers it again.
      expect(again.request.headers.get('X-Management-Token')).toBe(pageToken);
      again.flush(created, { status: 201, statusText: 'Created' });
      await settle();
      expect(createdEvents).toHaveLength(1);
    });

    it('takes a new management token when the one sent holds an event of another account', async () => {
      await render();
      await create();
      httpTesting.expectOne(createRequest).flush(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'The event was rejected',
            details: [{ code: 'MANAGEMENT_TOKEN_TAKEN' }],
          },
        },
        { status: 400, statusText: 'Bad Request' },
      );
      await settle();
      await fixture.whenStable();

      expect(text('[role="alert"]')).toBe('No se ha podido crear el evento. Inténtalo de nuevo.');
      const taken = fixture.componentInstance.token();
      expect(taken).not.toBe(pageToken);
      expect(managementTokenSchema.safeParse(taken).success).toBe(true);
      await click(button('Reintentar'));
      const again = httpTesting.expectOne(createRequest);
      expect(again.request.headers.get('X-Management-Token')).toBe(taken);
      again.flush(created, { status: 201, statusText: 'Created' });
      await settle();
    });

    it('keeps its management token for any other refusal', async () => {
      await render();
      await create();
      httpTesting.expectOne(createRequest).flush(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'The event was rejected',
            details: [{ code: 'DATE_PAST', index: 0 }],
          },
        },
        { status: 400, statusText: 'Bad Request' },
      );
      await settle();

      expect(fixture.componentInstance.token()).toBe(pageToken);
    });
  });
});
