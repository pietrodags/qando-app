import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  type TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { managementTokenSchema } from '@qando/contracts';
import { ManagementTokens } from '../../core/auth/management-tokens';
import { Session } from '../../core/auth/session';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { type DateSelection, NO_DATES } from './date-selection';
import type { ProposedName } from './organizer-name-field';
import { type CreatedEvent, type EventEnding, NO_ENDING, WizardFinish } from './wizard-finish';
import finishStyles from './wizard-finish.scss' with { loader: 'text' };

const ana = { name: 'Ana', email: 'ana@example.com' };
const createRequest = { method: 'POST', url: '/api/events' };
const created = {
  participationId: 'uHuaiU4BzZfa7oUR2OC3QQ',
  resultsId: 'r3sUlTs4BzZfa7oUR2OC3QQ',
};
/** The management token a request to create the event carries. */
const tokenOf = (request: TestRequest): string | null =>
  request.request.headers.get('X-Management-Token');
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
    fixture.componentRef.setInput('sent', null);
    fixture.componentRef.setInput('code', null);
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

  /** The deadline as its three selects show it: "27 noviembre 2026". */
  function deadlineShown(): string {
    return Array.from(element().querySelectorAll('app-deadline-field select'))
      .map((select) =>
        Array.from(select.querySelectorAll('option'))
          .filter((option) => option.selected)
          .map((option) => option.textContent.trim())
          .join(' + '),
      )
      .join(' ');
  }

  function note(): HTMLTextAreaElement {
    const found = element().querySelector<HTMLTextAreaElement>('textarea');
    if (!found) throw new Error('No note');
    return found;
  }

  /** The button that folds and unfolds the note, labelled as the note is. */
  function noteToggle(): HTMLButtonElement {
    return button('Añade un comentario, si quieres.');
  }

  function nameField(): HTMLInputElement {
    const found = element().querySelector<HTMLInputElement>('app-organizer-name-field input');
    if (!found) throw new Error('No name field');
    return found;
  }

  async function typeName(value: string): Promise<void> {
    nameField().focus();
    nameField().value = value;
    nameField().dispatchEvent(new InputEvent('input'));
    await fixture.whenStable();
  }

  /** What is said under the name field, as a screen reader hears it with the field. */
  function nameSaid(): string | null {
    const id = nameField().getAttribute('aria-describedby');
    return id === null ? null : (element().querySelector(`#${id}`)?.textContent.trim() ?? '');
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

  /** The deadline's day chosen in its select, a day of November. */
  async function pickDay(day: number): Promise<void> {
    const select = element().querySelector<HTMLSelectElement>(
      'app-deadline-field select[aria-label="Día"]',
    );
    if (!select) throw new Error('No day select');
    select.value = String(day);
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  async function create(): Promise<void> {
    await click(button('Crear'));
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(finishStyles)).toEqual([]);
  });

  describe('its fields', () => {
    it('ask for the deadline, a folded note beside anonymous voting, the name, then show the email, in this order', async () => {
      await render();

      const shown = Array.from(
        element().querySelectorAll(
          '#deadline-label, .note-toggle, app-switch, app-organizer-name-field label, .email, .label',
        ),
        (found) => found.textContent.trim(),
      );
      // Signed in, the email is shown without its label.
      expect(shown).toEqual([
        '¿Hasta cuándo quieres que voten los participantes?',
        'Añade un comentario, si quieres.',
        'Voto anónimo',
        'Tu nombre, para comunicárselo a los demás.',
        'ana@example.com',
      ]);
      expect(noteToggle().closest('.row')?.querySelector('app-switch')).not.toBeNull();
    });

    it('name the deadline’s selects by its question', async () => {
      await render();

      const group = element().querySelector('app-deadline-field [role="group"]');
      const name = element().querySelector(`#${group?.getAttribute('aria-labelledby') ?? 'none'}`);
      expect(name?.textContent.trim()).toBe('¿Hasta cuándo quieres que voten los participantes?');
    });

    it('start with the suggested deadline, no note and anonymous voting off', async () => {
      await render();

      expect(deadlineShown()).toBe('27 noviembre 2026');
      expect(ending().note).toBe('');
      expect(anonymousSwitch().checked).toBe(false);
    });
  });

  describe('the deadline', () => {
    it('follows the dates while it is the suggested one', async () => {
      await render();

      fixture.componentRef.setInput('selection', { ...NO_DATES, singles: ['2026-11-22'] });
      await fixture.whenStable();

      expect(deadlineShown()).toBe('21 noviembre 2026');
      expect(ending().deadline).toBeNull();
    });

    it('is kept once the organizer has chosen it, whatever the dates', async () => {
      await render();

      await pickDay(25);
      fixture.componentRef.setInput('selection', { ...NO_DATES, singles: ['2026-12-20'] });
      await fixture.whenStable();

      expect(ending().deadline).toBe('2026-11-25');
      expect(deadlineShown()).toBe('25 noviembre 2026');
    });

    it('is shown as it was chosen when the step comes back', async () => {
      await render({ ending: { ...NO_ENDING, deadline: '2026-11-24' } });

      expect(deadlineShown()).toBe('24 noviembre 2026');
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
      await click(noteToggle());

      await type('Cenamos en casa de Marta.');

      expect(ending().note).toBe('Cenamos en casa de Marta.');
    });

    it('counts its characters as people see them, out of 150', async () => {
      await render();
      await click(noteToggle());
      expect(text('.count')).toBe('0/150');

      await type('Cena 👨‍👩‍👧');

      expect(text('.count')).toBe('6/150');
    });

    it('leaves the spaces around its text out of the count', async () => {
      await render();
      await click(noteToggle());

      await type('  Cena en casa  ');

      expect(text('.count')).toBe('12/150');
    });

    it('stops at 150 characters', async () => {
      await render();
      await click(noteToggle());

      await type('a'.repeat(151));

      expect(ending().note).toBe('a'.repeat(150));
      expect(text('.count')).toBe('150/150');
    });

    it('is described by its count, which is never read out as it changes', async () => {
      await render();
      await click(noteToggle());

      const count = element().querySelector(`#${note().getAttribute('aria-describedby') ?? ''}`);

      expect(count?.textContent.trim()).toBe('0/150');
      expect(count?.closest('[role="status"], [aria-live]')).toBeNull();
    });

    it('is labelled by its question, the button that unfolds it', async () => {
      await render();
      await click(noteToggle());

      expect(note().getAttribute('aria-labelledby')).toBe(noteToggle().id);
    });
  });

  describe('the note’s fold', () => {
    it('is folded at first, the note’s question a button with a chevron', async () => {
      await render();

      expect(noteToggle().getAttribute('aria-expanded')).toBe('false');
      expect(noteToggle().hasAttribute('aria-controls')).toBe(false);
      expect(noteToggle().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(element().querySelector('textarea')).toBeNull();
    });

    it('unfolds three rows tall with the cursor in it, and folds again', async () => {
      await render();

      await click(noteToggle());
      expect(noteToggle().getAttribute('aria-expanded')).toBe('true');
      expect(noteToggle().getAttribute('aria-controls')).toBe(note().id);
      expect(note().rows).toBe(3);
      expect(document.activeElement).toBe(note());

      await click(noteToggle());
      expect(noteToggle().getAttribute('aria-expanded')).toBe('false');
      expect(element().querySelector('textarea')).toBeNull();
    });

    it('keeps the note written while it is folded, and shows it unfolded again', async () => {
      await render();
      await click(noteToggle());
      await type('Cenamos en casa de Marta.');

      await click(noteToggle());
      expect(ending().note).toBe('Cenamos en casa de Marta.');

      await click(noteToggle());
      expect(note().value).toBe('Cenamos en casa de Marta.');
    });

    it('opens unfolded when the page holds a note, and stays so once it is erased', async () => {
      await render({ ending: { ...NO_ENDING, note: 'Cenamos en casa de Marta.' } });
      expect(note().value).toBe('Cenamos en casa de Marta.');

      await type('');

      expect(element().querySelector('textarea')).not.toBeNull();
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
      await click(nameField());
      expect(element().querySelector('app-tooltip')).toBeNull();
    });
  });

  describe('the organizer’s name', () => {
    it('shows the name the page holds, and gives the page the name typed', async () => {
      await render();
      expect(nameField().value).toBe('Ana');

      await typeName('Anita');

      expect(fixture.componentInstance.details()).toEqual({
        organizerName: 'Anita',
        title: 'Cena de verano',
      });
    });

    it('stops "Crear" without a name: says so under it, the cursor in it, nothing sent', async () => {
      await render();
      await typeName('');

      await create();

      expect(nameSaid()).toBe('Escribe tu nombre.');
      expect(document.activeElement).toBe(nameField());
      expect(events).toEqual([]);
      httpTesting.expectNone('/api/events');
    });

    it('stops "Crear" with a name of one letter, saying it is too short', async () => {
      await render();
      await typeName('A');

      await create();

      expect(nameSaid()).toBe('Tu nombre necesita al menos 2 letras.');
      httpTesting.expectNone('/api/events');
    });

    it('says nothing more under it once the organizer types', async () => {
      await render();
      await typeName('');
      await create();

      await typeName('An');

      expect(nameSaid()).toBeNull();
    });

    it('tells the page the name it proposed for the account signed in', async () => {
      await render();
      const proposed: ProposedName[] = [];
      fixture.componentInstance.proposed.subscribe((name) => proposed.push(name));
      fixture.componentRef.setInput('details', { organizerName: '', title: 'Cena de verano' });
      await fixture.whenStable();

      httpTesting.expectOne('/api/me/organizer-name').flush({ organizerName: 'Ana G.' });
      await settle();
      await fixture.whenStable();

      expect(proposed).toEqual([{ name: 'Ana G.', email: ana.email }]);
      expect(fixture.componentInstance.details().organizerName).toBe('Ana G.');
    });
  });

  describe('its arrow back', () => {
    it('goes back to the step before', async () => {
      await render();

      await click(button('Volver al paso 2'));

      expect(events).toEqual(['back']);
    });

    it('names the times as the step before when times are asked for', async () => {
      await render({ step: 4 });

      expect(button('Volver al paso 3')).toBeTruthy();
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
      await click(noteToggle());
      await type('Cenamos en casa de Marta.');
      await click(anonymousSwitch());

      await create();

      const request = httpTesting.expectOne(createRequest);
      expect(managementTokenSchema.safeParse(tokenOf(request)).success).toBe(true);
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
      expect(deadlineShown()).toBe('27 noviembre 2026');

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

      const request = httpTesting.expectOne(createRequest);
      request.flush(created, { status: 201, statusText: 'Created' });
      await settle();
      await fixture.whenStable();

      expect(TestBed.inject(ManagementTokens).of(created.participationId)).toBe(tokenOf(request));
      expect(createdEvents).toEqual([
        { participationId: created.participationId, deadline: '2026-11-27' },
      ]);
      expect(events).toEqual(['sending true', 'sending false']);
    });

    it('keeps everything and says so when the event could not be created', async () => {
      await render();
      await click(noteToggle());
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
      const first = httpTesting.expectOne(createRequest);
      first.error(new ProgressEvent('error'));
      await settle();
      await fixture.whenStable();

      await click(button('Reintentar'));

      expect(element().querySelector('[role="alert"]')).toBeNull();
      expect(document.activeElement).toBe(button('Crear'));
      const again = httpTesting.expectOne(createRequest);
      // The same token: if the first send did store the event, this one answers it again.
      expect(tokenOf(again)).toBe(tokenOf(first));
      again.flush(created, { status: 201, statusText: 'Created' });
      await settle();
      expect(createdEvents).toHaveLength(1);
    });

    it('sends an event changed since its last send with a new management token: it is another event', async () => {
      await render();
      await create();
      const first = httpTesting.expectOne(createRequest);
      first.error(new ProgressEvent('error'));
      await settle();
      await fixture.whenStable();

      await click(noteToggle());
      await type('Cenamos en casa de Marta.');
      await create();

      const changed = httpTesting.expectOne(createRequest);
      expect(managementTokenSchema.safeParse(tokenOf(changed)).success).toBe(true);
      expect(tokenOf(changed)).not.toBe(tokenOf(first));
      changed.flush(created, { status: 201, statusText: 'Created' });
      await settle();
      expect(TestBed.inject(ManagementTokens).of(created.participationId)).toBe(tokenOf(changed));
    });

    it('takes a new management token when the one sent holds an event of another account', async () => {
      await render();
      await create();
      const first = httpTesting.expectOne(createRequest);
      first.flush(
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
      await click(button('Reintentar'));
      const again = httpTesting.expectOne(createRequest);
      expect(managementTokenSchema.safeParse(tokenOf(again)).success).toBe(true);
      expect(tokenOf(again)).not.toBe(tokenOf(first));
      again.flush(created, { status: 201, statusText: 'Created' });
      await settle();
    });

    it('keeps its management token for any other refusal', async () => {
      await render();
      await create();
      const first = httpTesting.expectOne(createRequest);
      first.flush(
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
      await fixture.whenStable();

      await click(button('Reintentar'));
      const again = httpTesting.expectOne(createRequest);
      expect(tokenOf(again)).toBe(tokenOf(first));
      again.flush(created, { status: 201, statusText: 'Created' });
      await settle();
    });
  });
});
