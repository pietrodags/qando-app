import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { managementTokenSchema } from '@qando/contracts';
import { ManagementTokens } from '../../core/auth/management-tokens';
import { Session } from '../../core/auth/session';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { installTestScreen } from '../../../test/media-queries';
import { CreatePage } from './create-page';
import pageStyles from './create-page.scss' with { loader: 'text' };
import { keepDraft, newDraft, openingDraft } from './wizard-draft';

@Component({ template: '' })
class Blank {}

describe('CreatePage', () => {
  beforeEach(() => {
    // A tab without a draft, whatever the tests run before left (mutation runs share the storage).
    sessionStorage.clear();
    installTestScreen({ '(min-width: 650px)': true });
    // Monday 15 June 2026.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 15, 12));
    TestBed.configureTestingModule({
      imports: [CreatePage],
      providers: [
        provideI18n(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', component: Blank }]),
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
    // jsdom has none: some tests stand it in.
    delete (Element.prototype as Partial<Element>).getAnimations;
  });

  async function render(): Promise<ComponentFixture<CreatePage>> {
    const fixture = TestBed.createComponent(CreatePage);
    await fixture.whenStable();
    return fixture;
  }

  function element(fixture: ComponentFixture<CreatePage>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** The step on screen, named by its label. */
  function card(fixture: ComponentFixture<CreatePage>): HTMLElement | null {
    return element(fixture).querySelector<HTMLElement>('.card');
  }

  /** What the name and the title fields of the step on screen show. */
  function typed(fixture: ComponentFixture<CreatePage>): string[] {
    return ['organizer-name', 'event-title'].map(
      (id) => card(fixture)?.querySelector<HTMLInputElement>(`#${id}`)?.value ?? 'no field',
    );
  }

  /** The marked days of the calendar on screen, as screen readers name them. */
  function markedDays(fixture: ComponentFixture<CreatePage>): (string | null)[] {
    return Array.from(card(fixture)?.querySelectorAll('[aria-pressed="true"]') ?? []).map((day) =>
      day.getAttribute('aria-label'),
    );
  }

  /** The colour of the dot beside the label of the step on screen. */
  function accent(fixture: ComponentFixture<CreatePage>): string | undefined {
    return card(fixture)
      ?.querySelector<HTMLElement>('.step-label')
      ?.style.getPropertyValue('--step-accent');
  }

  async function type(
    fixture: ComponentFixture<CreatePage>,
    id: string,
    value: string,
  ): Promise<void> {
    const input = element(fixture).querySelector<HTMLInputElement>(`#${id}`);
    if (!input) throw new Error(`No field #${id}`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function fillDetails(fixture: ComponentFixture<CreatePage>): Promise<void> {
    await type(fixture, 'organizer-name', 'Ana');
    await type(fixture, 'event-title', 'Cena de verano');
  }

  async function press(fixture: ComponentFixture<CreatePage>, name: RegExp): Promise<void> {
    const button = Array.from(element(fixture).querySelectorAll('button')).find((candidate) =>
      name.test(candidate.getAttribute('aria-label') ?? candidate.textContent),
    );
    if (!button) throw new Error(`No button ${String(name)}`);
    button.click();
    await fixture.whenStable();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(pageStyles)).toEqual([]);
  });

  it('opens on step 1, the name and the title, in the colour of the first step', async () => {
    const fixture = await render();

    expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 1');
    expect(card(fixture)?.querySelector('app-wizard-details')).not.toBeNull();
    expect(
      card(fixture)
        ?.querySelector<HTMLElement>('.step-label')
        ?.style.getPropertyValue('--step-accent'),
    ).toBe('var(--q-accent-blue)');
  });

  it('starts with nothing typed', async () => {
    const fixture = await render();

    expect(typed(fixture)).toEqual(['', '']);
  });

  it('stays on step 1 until the name and the title are valid', async () => {
    const fixture = await render();

    await press(fixture, /^Siguiente$/);

    expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 1');
  });

  it('goes on to the dates, on the current month, once they are', async () => {
    const fixture = await render();
    await fillDetails(fixture);

    await press(fixture, /^Siguiente$/);

    expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 2');
    expect(card(fixture)?.querySelector('app-wizard-dates h2')?.textContent.trim()).toBe(
      'Junio 2026',
    );
    expect(markedDays(fixture)).toEqual([]);
    expect(
      card(fixture)
        ?.querySelector<HTMLElement>('.step-label')
        ?.style.getPropertyValue('--step-accent'),
    ).toBe('var(--q-accent-teal)');
  });

  it('comes back to step 1 with the arrow of the dates', async () => {
    const fixture = await render();
    await fillDetails(fixture);
    await press(fixture, /^Siguiente$/);

    await press(fixture, /^Volver al paso 1$/);

    expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 1');
    expect(typed(fixture)).toEqual(['Ana', 'Cena de verano']);
  });

  it('keeps the dates and the month on screen while the organizer visits step 1', async () => {
    const fixture = await render();
    await fillDetails(fixture);
    await press(fixture, /^Siguiente$/);
    await press(fixture, /^Mes siguiente$/);
    await press(fixture, /^lunes, 6 de julio$/);

    await press(fixture, /^Volver al paso 1$/);
    await press(fixture, /^Siguiente$/);

    expect(card(fixture)?.querySelector('h2')?.textContent.trim()).toBe('Julio 2026');
    expect(markedDays(fixture)).toEqual(['lunes, 6 de julio']);
  });

  it('keeps the "Horario" switch as it was left while the organizer visits step 1', async () => {
    const fixture = await render();
    await fillDetails(fixture);
    await press(fixture, /^Siguiente$/);
    await press(fixture, /^sábado, 20 de junio$/);
    const timesSwitch = (): HTMLInputElement | null | undefined =>
      card(fixture)?.querySelector<HTMLInputElement>('input[role="switch"]:not([aria-label])');
    expect(timesSwitch()?.checked).toBe(false);
    timesSwitch()?.click();
    await fixture.whenStable();

    await press(fixture, /^Volver al paso 1$/);
    await press(fixture, /^Siguiente$/);

    expect(timesSwitch()?.checked).toBe(true);
  });

  describe('the smart calendar', () => {
    function asker(fixture: ComponentFixture<CreatePage>): HTMLInputElement {
      const found = card(fixture)?.querySelector<HTMLInputElement>(
        'input[role="switch"][aria-label="Generar fechas con IA"]',
      );
      if (!found) throw new Error('No switch of the smart calendar');
      return found;
    }

    function field(fixture: ComponentFixture<CreatePage>): HTMLTextAreaElement | null {
      return card(fixture)?.querySelector<HTMLTextAreaElement>('app-phrase-box textarea') ?? null;
    }

    it('keeps what was written in its box while the organizer visits step 1, and is closed when the dates are entered again', async () => {
      const fixture = await render();
      await fillDetails(fixture);
      await press(fixture, /^Siguiente$/);
      asker(fixture).click();
      await fixture.whenStable();
      const box = field(fixture);
      if (!box) throw new Error('No text box');
      expect(box.value).toBe('');
      box.value = 'todos los lunes de julio';
      box.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      await press(fixture, /^Volver al paso 1$/);
      await press(fixture, /^Siguiente$/);

      expect(asker(fixture).checked).toBe(false);
      expect(field(fixture)).toBeNull();

      asker(fixture).click();
      await fixture.whenStable();

      expect(field(fixture)?.value).toBe('todos los lunes de julio');
    });

    it('keeps what was written in its box and the month on screen after a reload', async () => {
      const left = await render();
      await fillDetails(left);
      await press(left, /^Siguiente$/);
      await press(left, /^Mes siguiente$/);
      asker(left).click();
      await left.whenStable();
      const box = field(left);
      if (!box) throw new Error('No text box');
      box.value = 'todos los lunes de julio';
      box.dispatchEvent(new Event('input'));
      await left.whenStable();

      left.destroy();
      const fixture = await render();
      asker(fixture).click();
      await fixture.whenStable();

      expect(card(fixture)?.querySelector('app-wizard-dates h2')?.textContent.trim()).toBe(
        'Julio 2026',
      );
      expect(field(fixture)?.value).toBe('todos los lunes de julio');
    });
  });

  it('drops a date that is past when the organizer comes back to the dates the day after', async () => {
    const fixture = await render();
    await fillDetails(fixture);
    await press(fixture, /^Siguiente$/);
    await press(fixture, /^lunes, 15 de junio$/);
    expect(markedDays(fixture)).toEqual(['lunes, 15 de junio']);

    await press(fixture, /^Volver al paso 1$/);
    vi.setSystemTime(new Date(2026, 5, 16, 0, 5));
    await press(fixture, /^Siguiente$/);

    expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 2');
    expect(markedDays(fixture)).toEqual([]);
    expect(
      card(fixture)?.querySelector('button[aria-label="Siguiente"]')?.getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('stays on the dates until one is marked, then goes on to the last step, named "último paso", in salmon', async () => {
    const fixture = await render();
    await fillDetails(fixture);
    await press(fixture, /^Siguiente$/);

    await press(fixture, /^Siguiente$/);
    expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 2');

    await press(fixture, /^sábado, 20 de junio$/);
    await press(fixture, /^Siguiente$/);

    expect(card(fixture)?.getAttribute('aria-label')).toBe('último paso');
    expect(card(fixture)?.querySelector('app-wizard-finish')).not.toBeNull();
    expect(accent(fixture)).toBe('var(--q-accent-salmon)');
  });

  describe('with times asked for', () => {
    beforeEach(() => {
      // jsdom scrolls nothing; a column of hours opens scrolled to 9:00.
      HTMLElement.prototype.scrollTo = () => {};
    });

    afterEach(() => {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
    });

    /** On the dates, with Saturday 20 marked and the "Horario" switch on. */
    async function askForTimes(): Promise<ComponentFixture<CreatePage>> {
      const fixture = await render();
      await fillDetails(fixture);
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^sábado, 20 de junio$/);
      card(fixture)
        ?.querySelector<HTMLInputElement>('input[role="switch"]:not([aria-label])')
        ?.click();
      await fixture.whenStable();
      return fixture;
    }

    function markedTimes(fixture: ComponentFixture<CreatePage>): string[] {
      return Array.from(
        card(fixture)?.querySelectorAll('app-wizard-times button[aria-pressed="true"]') ?? [],
      ).map((time) => time.textContent.trim());
    }

    it('goes on from the dates to their times, step 3, in amber', async () => {
      const fixture = await askForTimes();

      await press(fixture, /^Siguiente$/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 3');
      expect(card(fixture)?.querySelector('app-wizard-times [role="group"]')).not.toBeNull();
      expect(
        card(fixture)
          ?.querySelector<HTMLElement>('.step-label')
          ?.style.getPropertyValue('--step-accent'),
      ).toBe('var(--q-accent-amber)');
    });

    /** On the times of six dates from Saturday 20 June, two places further than the first. */
    async function onLastTimes(): Promise<ComponentFixture<CreatePage>> {
      const fixture = await askForTimes();
      for (const day of ['domingo, 21', 'lunes, 22', 'martes, 23', 'miércoles, 24', 'jueves, 25']) {
        await press(fixture, new RegExp(`^${day} de junio$`));
      }
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Día siguiente$/);
      await press(fixture, /^Día siguiente$/);
      return fixture;
    }

    /** The place among the columns, as the step's arrows show it ("3 / 3"). */
    function place(fixture: ComponentFixture<CreatePage>): string | undefined {
      return card(fixture)?.querySelector('app-step-pager .place')?.textContent.trim();
    }

    /** The days of the summary's columns on screen: the ones off it are out of reach. */
    function summaryOnScreen(fixture: ComponentFixture<CreatePage>): (string | null)[] {
      return Array.from(
        card(fixture)?.querySelectorAll<HTMLElement>('app-wizard-summary .column') ?? [],
      )
        .filter((column) => !column.inert)
        .map((column) => column.querySelector('ul')?.getAttribute('aria-label') ?? null);
    }

    it('goes on from the times to their summary in the same card, step 3, and from it to the last step, named "último paso"', async () => {
      const fixture = await askForTimes();
      await press(fixture, /^Siguiente$/);

      await press(fixture, /^Siguiente$/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 3');
      expect(
        card(fixture)?.querySelector('app-wizard-summary ul[aria-label="sábado, 20 de junio"]'),
      ).not.toBeNull();
      expect(card(fixture)?.querySelector('app-wizard-times')).toBeNull();
      expect(element(fixture).querySelectorAll('.tab')).toHaveLength(2);

      await press(fixture, /^Siguiente$/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('último paso');
      expect(card(fixture)?.querySelector('app-wizard-finish')).not.toBeNull();
      expect(accent(fixture)).toBe('var(--q-accent-salmon)');
    });

    it('moves the focus to the card when the times give way to their summary, and back', async () => {
      const fixture = await askForTimes();
      await press(fixture, /^Siguiente$/);
      card(fixture)?.querySelector<HTMLElement>('app-step-pager button')?.focus();

      await press(fixture, /^Siguiente$/);

      expect(document.activeElement).toBe(card(fixture));

      card(fixture)?.querySelector<HTMLElement>('app-step-pager button')?.focus();
      await press(fixture, /^Volver a los horarios$/);

      expect(document.activeElement).toBe(card(fixture));
    });

    it('opens the summary on the columns the times showed, and the times on those the summary showed', async () => {
      const fixture = await onLastTimes();

      await press(fixture, /^Siguiente$/);

      expect(place(fixture)).toBe('3 / 3');
      expect(summaryOnScreen(fixture)).toEqual([
        'lunes, 22 de junio',
        'martes, 23 de junio',
        'miércoles, 24 de junio',
        'jueves, 25 de junio',
      ]);

      await press(fixture, /^Día anterior$/);
      await press(fixture, /^Día anterior$/);
      await press(fixture, /^Volver a los horarios$/);

      expect(card(fixture)?.querySelector('app-wizard-times')).not.toBeNull();
      expect(place(fixture)).toBe('1 / 3');
    });

    it('comes back to the summary as it was left with the arrow of the last step', async () => {
      const fixture = await onLastTimes();
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Siguiente$/);

      await press(fixture, /^Volver al paso 3$/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 3');
      expect(card(fixture)?.querySelector('app-wizard-summary')).not.toBeNull();
      expect(place(fixture)).toBe('3 / 3');
    });

    it('comes back to the summary with the tab of step 3 from the last step', async () => {
      const fixture = await askForTimes();
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Siguiente$/);

      await press(fixture, /^\s*paso 3\s*$/);

      expect(card(fixture)?.querySelector('app-wizard-summary')).not.toBeNull();
    });

    it('opens the times on their first columns when the dates go on to them again', async () => {
      const fixture = await onLastTimes();
      await press(fixture, /^Siguiente$/);

      await press(fixture, /^\s*paso 2\s*$/);
      await press(fixture, /^Siguiente$/);

      expect(card(fixture)?.querySelector('app-wizard-times')).not.toBeNull();
      expect(place(fixture)).toBe('1 / 3');
    });

    /** From now on the steps' motions never end: a step that folds or fades keeps what it shows. */
    function endlessMotion(): void {
      const endless = { finished: new Promise<Animation>(() => undefined) } as Animation;
      Element.prototype.getAnimations = (): Animation[] => [endless];
    }

    /** What step 3 shows while it folds into its tab or fades out: its part and its place. */
    function stepThree(fixture: ComponentFixture<CreatePage>): string[] {
      const three = element(fixture).querySelectorAll('section.step')[2];
      const part = three?.querySelector('app-wizard-summary, app-wizard-times')?.localName ?? '';
      const place = three?.querySelector('app-step-pager .place')?.textContent.trim() ?? '';
      return [part, place];
    }

    it('keeps the summary on its columns in step 3 while it folds into its tab', async () => {
      const fixture = await onLastTimes();
      await press(fixture, /^Siguiente$/);
      endlessMotion();

      await press(fixture, /^Siguiente$/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('último paso');
      expect(stepThree(fixture)).toEqual(['app-wizard-summary', '3 / 3']);
    });

    it('keeps the summary on its columns in step 3 while it fades out for an earlier step', async () => {
      const fixture = await onLastTimes();
      await press(fixture, /^Siguiente$/);
      endlessMotion();

      await press(fixture, /^\s*paso 2\s*$/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 2');
      expect(stepThree(fixture)).toEqual(['app-wizard-summary', '3 / 3']);
    });

    it('opens again on the summary after a reload', async () => {
      const fixture = await askForTimes();
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Siguiente$/);
      fixture.destroy();

      const again = await render();

      expect(card(again)?.getAttribute('aria-label')).toBe('paso 3');
      expect(card(again)?.querySelector('app-wizard-summary')).not.toBeNull();
    });

    it('keeps what is corrected on a column of the summary: the times have it', async () => {
      const fixture = await askForTimes();
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Editar sábado, 20 de junio$/);
      await press(fixture, /^\s*18:00\s*$/);
      await press(fixture, /^Listo$/);

      await press(fixture, /^Volver a los horarios$/);

      expect(markedTimes(fixture)).toEqual(['18:00']);
    });

    it('comes back to the dates with the arrow of the times, and keeps the times marked', async () => {
      const fixture = await askForTimes();
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^\s*18:00\s*$/);

      await press(fixture, /^Volver al paso 2$/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 2');
      expect(markedDays(fixture)).toEqual(['sábado, 20 de junio']);

      await press(fixture, /^Siguiente$/);

      expect(markedTimes(fixture)).toEqual(['18:00']);
    });

    it('has no times step once the switch is turned off', async () => {
      const fixture = await askForTimes();
      card(fixture)
        ?.querySelector<HTMLInputElement>('input[role="switch"]:not([aria-label])')
        ?.click();
      await fixture.whenStable();

      await press(fixture, /^Siguiente$/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('último paso');
      expect(card(fixture)?.querySelector('app-wizard-times')).toBeNull();
      expect(card(fixture)?.querySelector('app-wizard-finish')).not.toBeNull();
    });

    it('has no times step when no date of its own is left to have them', async () => {
      const fixture = await askForTimes();
      // Saturday 20 becomes the first day of a range: held with Shift+Enter, then the last day.
      const saturday = card(fixture)?.querySelector('button[aria-label="sábado, 20 de junio"]');
      saturday?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
      );
      await fixture.whenStable();
      await press(fixture, /^lunes, 22 de junio$/);
      expect(markedDays(fixture)).toHaveLength(3);

      await press(fixture, /^Siguiente$/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('último paso');
      expect(card(fixture)?.querySelector('app-wizard-times')).toBeNull();
      expect(card(fixture)?.querySelector('app-wizard-finish')).not.toBeNull();
    });
  });

  it('keeps the name and the title when the organizer goes back to step 1', async () => {
    const fixture = await render();
    await fillDetails(fixture);
    await press(fixture, /^Siguiente$/);

    await press(fixture, /^\s*paso 1\s*$/);

    expect(typed(fixture)).toEqual(['Ana', 'Cena de verano']);
  });

  describe('the last step', () => {
    const ana = { name: 'Ana', email: 'ana@example.com' };
    const created = {
      participationId: 'uHuaiU4BzZfa7oUR2OC3QQ',
      resultsId: 'r3sUlTs4BzZfa7oUR2OC3QQ',
    };

    /** Lets a settled request's promise chain run. */
    function settle(): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve));
    }

    /** On the last step, with Saturday 20 June marked, signed in as Ana. */
    async function toLastStep(
      account: typeof ana | null = ana,
    ): Promise<ComponentFixture<CreatePage>> {
      const fixture = await render();
      await fillDetails(fixture);
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^sábado, 20 de junio$/);
      await press(fixture, /^Siguiente$/);
      for (const asked of TestBed.inject(HttpTestingController).match('/api/auth/session')) {
        asked.flush(account);
      }
      await settle();
      await fixture.whenStable();
      return fixture;
    }

    function note(fixture: ComponentFixture<CreatePage>): HTMLTextAreaElement {
      const found = card(fixture)?.querySelector<HTMLTextAreaElement>('app-wizard-finish textarea');
      if (!found) throw new Error('No note');
      return found;
    }

    function anonymous(fixture: ComponentFixture<CreatePage>): HTMLInputElement {
      const found = card(fixture)?.querySelector<HTMLInputElement>(
        'app-wizard-finish input[role="switch"]',
      );
      if (!found) throw new Error('No anonymous voting');
      return found;
    }

    /** The deadline as its three selects show it: "19 junio 2026". */
    function deadline(fixture: ComponentFixture<CreatePage>): string | undefined {
      return Array.from(
        card(fixture)?.querySelectorAll<HTMLSelectElement>('app-deadline-field select') ?? [],
      )
        .map((select) => select.selectedOptions[0]?.textContent.trim())
        .join(' ');
    }

    /** The text box of the smart calendar, while it is open. */
    function phraseBox(fixture: ComponentFixture<CreatePage>): HTMLTextAreaElement | null {
      return card(fixture)?.querySelector<HTMLTextAreaElement>('app-phrase-box textarea') ?? null;
    }

    /** The switch of the smart calendar pressed: it opens, or closes. */
    async function toggleSmartCalendar(fixture: ComponentFixture<CreatePage>): Promise<void> {
      const asker = card(fixture)?.querySelector<HTMLInputElement>(
        'input[role="switch"][aria-label="Generar fechas con IA"]',
      );
      if (!asker) throw new Error('No switch of the smart calendar');
      asker.click();
      await fixture.whenStable();
    }

    /**
     * Presses "Crear", signed in as Ana, and answers that the event is created; the management
     * token it sent.
     */
    async function createEvent(fixture: ComponentFixture<CreatePage>): Promise<string | null> {
      for (const asked of TestBed.inject(HttpTestingController).match('/api/auth/session')) {
        asked.flush(ana);
      }
      await settle();
      await fixture.whenStable();
      await press(fixture, /^Crear$/);
      const sent = TestBed.inject(HttpTestingController).expectOne({
        method: 'POST',
        url: '/api/events',
      });
      sent.flush(created, { status: 201, statusText: 'Created' });
      await settle();
      await fixture.whenStable();
      return sent.request.headers.get('X-Management-Token');
    }

    /** Presses "Crear" and loses the answer; the management token it sent. */
    async function failToCreate(fixture: ComponentFixture<CreatePage>): Promise<string | null> {
      await press(fixture, /^Crear$/);
      const sent = TestBed.inject(HttpTestingController).expectOne({
        method: 'POST',
        url: '/api/events',
      });
      sent.error(new ProgressEvent('error'));
      await settle();
      await fixture.whenStable();
      return sent.request.headers.get('X-Management-Token');
    }

    it('suggests the day before the first date as the deadline, and shows the email', async () => {
      const fixture = await toLastStep();

      expect(deadline(fixture)).toBe('19 junio 2026');
      expect(card(fixture)?.querySelector('.email')?.textContent.trim()).toBe('ana@example.com');
    });

    it('comes back to the dates with its arrow', async () => {
      const fixture = await toLastStep();

      await press(fixture, /^Volver al paso 2$/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 2');
    });

    it('keeps the note and anonymous voting while the organizer visits step 1', async () => {
      const fixture = await toLastStep();
      note(fixture).value = 'Cenamos en casa de Marta.';
      note(fixture).dispatchEvent(new InputEvent('input'));
      anonymous(fixture).click();
      await fixture.whenStable();

      await press(fixture, /^\s*paso 1\s*$/);
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Siguiente$/);

      expect(note(fixture).value).toBe('Cenamos en casa de Marta.');
      expect(anonymous(fixture).checked).toBe(true);
    });

    it('keeps the other steps closed while the event is sent', async () => {
      const fixture = await toLastStep();

      await press(fixture, /^Crear$/);

      const tabs = Array.from(element(fixture).querySelectorAll<HTMLButtonElement>('button.tab'));
      expect(tabs.map((tab) => tab.disabled)).toEqual([true, true]);
      TestBed.inject(HttpTestingController)
        .expectOne({ method: 'POST', url: '/api/events' })
        .flush(created, { status: 201, statusText: 'Created' });
      await settle();
    });

    /** Without a session, "Crear" with Ana's email, its code sent. */
    async function waitForCode(fixture: ComponentFixture<CreatePage>): Promise<void> {
      const field = card(fixture)?.querySelector<HTMLInputElement>('input[type="email"]');
      if (!field) throw new Error('No email field');
      field.value = 'ana@example.com';
      field.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      await press(fixture, /^Crear$/);
      TestBed.inject(HttpTestingController)
        .expectOne({ method: 'POST', url: '/api/auth/sign-in-code' })
        .flush({ sent: true, resendAfterSeconds: 30 });
      await settle();
      await fixture.whenStable();
    }

    function tabsOff(fixture: ComponentFixture<CreatePage>): boolean[] {
      return Array.from(element(fixture).querySelectorAll<HTMLButtonElement>('button.tab')).map(
        (tab) => tab.disabled,
      );
    }

    it('keeps the other steps closed while the code is waited for, until "Cambiar email"', async () => {
      const fixture = await toLastStep(null);

      await waitForCode(fixture);

      expect(card(fixture)?.querySelector('h2')?.textContent.trim()).toBe('Escribe el código');
      expect(tabsOff(fixture)).toEqual([true, true]);
      await press(fixture, /^\s*Cambiar email\s*$/);
      expect(tabsOff(fixture)).toEqual([false, false]);
    });

    it('opens the other steps again when the event could not be created', async () => {
      const fixture = await toLastStep();
      await press(fixture, /^Crear$/);

      TestBed.inject(HttpTestingController)
        .expectOne({ method: 'POST', url: '/api/events' })
        .error(new ProgressEvent('error'));
      await settle();
      await fixture.whenStable();

      const tabs = Array.from(element(fixture).querySelectorAll<HTMLButtonElement>('button.tab'));
      expect(tabs.map((tab) => tab.disabled)).toEqual([false, false]);
      expect(card(fixture)?.getAttribute('aria-label')).toBe('último paso');
    });

    it('sends the event again with the management token of its first send, also after a visit to step 1', async () => {
      const fixture = await toLastStep();
      const first = await failToCreate(fixture);

      await press(fixture, /^\s*paso 1\s*$/);
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Siguiente$/);
      const again = await createEvent(fixture);

      expect(managementTokenSchema.safeParse(first).success).toBe(true);
      expect(again).toBe(first);
      expect(TestBed.inject(ManagementTokens).of(created.participationId)).toBe(first);
    });

    it('sends an event changed after a lost answer with a management token of its own', async () => {
      const fixture = await toLastStep();
      const first = await failToCreate(fixture);

      await press(fixture, /^\s*paso 1\s*$/);
      await type(fixture, 'event-title', 'Cena de otoño');
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Siguiente$/);
      const changed = await createEvent(fixture);

      expect(managementTokenSchema.safeParse(changed).success).toBe(true);
      expect(changed).not.toBe(first);
    });

    it('sends the event made after "Crear otro evento" with a management token of its own', async () => {
      const fixture = await toLastStep();
      const first = await createEvent(fixture);

      await press(fixture, /^\s*Crear otro evento\s*$/);
      await fillDetails(fixture);
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^sábado, 20 de junio$/);
      await press(fixture, /^Siguiente$/);
      const next = await createEvent(fixture);

      expect(managementTokenSchema.safeParse(next).success).toBe(true);
      expect(next).not.toBe(first);
    });

    /** The page opened again in the same tab, as a reload leaves it. */
    async function reload(
      fixture: ComponentFixture<CreatePage>,
    ): Promise<ComponentFixture<CreatePage>> {
      fixture.destroy();
      const again = await render();
      for (const asked of TestBed.inject(HttpTestingController).match('/api/auth/session')) {
        asked.flush(ana);
      }
      await settle();
      await again.whenStable();
      return again;
    }

    it('opens again on the step it was left, with everything entered, after a reload', async () => {
      const left = await toLastStep();
      note(left).value = 'Cenamos en casa de Marta.';
      note(left).dispatchEvent(new InputEvent('input'));
      anonymous(left).click();
      await left.whenStable();

      const fixture = await reload(left);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('último paso');
      expect(note(fixture).value).toBe('Cenamos en casa de Marta.');
      expect(anonymous(fixture).checked).toBe(true);
      await press(fixture, /^Volver al paso 2$/);
      expect(markedDays(fixture)).toEqual(['sábado, 20 de junio']);
      await press(fixture, /^Volver al paso 1$/);
      expect(typed(fixture)).toEqual(['Ana', 'Cena de verano']);
    });

    it('comes back to the code waited for after a reload, the other steps closed', async () => {
      const left = await toLastStep(null);
      await waitForCode(left);

      const fixture = await reload(left);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('último paso');
      expect(card(fixture)?.querySelector('.lead strong')?.textContent).toBe('ana@example.com');
      expect(tabsOff(fixture)).toEqual([true, true]);
    });

    it('sends the event again after a reload with the management token of its first send', async () => {
      const left = await toLastStep();
      const first = await failToCreate(left);

      const again = await createEvent(await reload(left));

      expect(managementTokenSchema.safeParse(first).success).toBe(true);
      expect(again).toBe(first);
    });

    it('opens empty again after a reload once the event is created', async () => {
      const left = await toLastStep();
      await createEvent(left);

      const fixture = await reload(left);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 1');
      expect(typed(fixture)).toEqual(['', '']);
    });

    it('keeps what is entered after "Crear otro evento" for a reload too', async () => {
      const left = await toLastStep();
      await createEvent(left);
      await press(left, /^\s*Crear otro evento\s*$/);
      await type(left, 'organizer-name', 'Bea');

      const fixture = await reload(left);

      expect(typed(fixture)).toEqual(['Bea', '']);
    });

    it('leaves only "¡Hecho!" once the event is created, without the steps', async () => {
      const fixture = await toLastStep();

      await createEvent(fixture);

      expect(element(fixture).querySelector('app-step-stack')).toBeNull();
      expect(element(fixture).querySelector('app-create-done h2')?.textContent.trim()).toBe(
        '¡Hecho!',
      );
      expect(element(fixture).querySelector('app-create-done .link')?.textContent.trim()).toBe(
        `${location.host}/vote/uHuaiU4BzZfa7oUR2OC3QQ`,
      );
      expect(element(fixture).querySelector('app-create-done strong')?.textContent.trim()).toBe(
        'viernes, 19 de junio',
      );
    });

    it('starts again with nothing on "Crear otro evento", every default back', async () => {
      const fixture = await toLastStep();
      await press(fixture, /^\s*paso 1\s*$/);
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Siguiente$/);
      note(fixture).value = 'Cenamos en casa de Marta.';
      note(fixture).dispatchEvent(new InputEvent('input'));
      anonymous(fixture).click();
      await fixture.whenStable();
      await createEvent(fixture);

      await press(fixture, /^\s*Crear otro evento\s*$/);

      expect(element(fixture).querySelector('app-create-done')).toBeNull();
      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 1');
      expect(typed(fixture)).toEqual(['', '']);

      await fillDetails(fixture);
      await press(fixture, /^Siguiente$/);
      expect(markedDays(fixture)).toEqual([]);
      expect(card(fixture)?.querySelector('app-wizard-dates h2')?.textContent.trim()).toBe(
        'Junio 2026',
      );

      await press(fixture, /^sábado, 27 de junio$/);
      await press(fixture, /^Siguiente$/);

      expect(note(fixture).value).toBe('');
      expect(anonymous(fixture).checked).toBe(false);
      expect(deadline(fixture)).toBe('22 junio 2026');
    });

    it('shows the dates on the month of today and an empty smart calendar after "Crear otro evento"', async () => {
      const fixture = await render();
      await fillDetails(fixture);
      await press(fixture, /^Siguiente$/);
      await toggleSmartCalendar(fixture);
      const box = phraseBox(fixture);
      if (!box) throw new Error('No text box');
      box.value = 'todos los lunes de julio';
      box.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      await toggleSmartCalendar(fixture);
      await press(fixture, /^Mes siguiente$/);
      await press(fixture, /^lunes, 6 de julio$/);
      await press(fixture, /^Siguiente$/);
      await createEvent(fixture);

      await press(fixture, /^\s*Crear otro evento\s*$/);
      await fillDetails(fixture);
      await press(fixture, /^Siguiente$/);

      expect(card(fixture)?.querySelector('app-wizard-dates h2')?.textContent.trim()).toBe(
        'Junio 2026',
      );
      await toggleSmartCalendar(fixture);
      expect(phraseBox(fixture)?.value).toBe('');
    });

    it('leaves the steps open after "Crear otro evento"', async () => {
      const fixture = await toLastStep();
      await createEvent(fixture);

      await press(fixture, /^\s*Crear otro evento\s*$/);
      await fillDetails(fixture);
      await press(fixture, /^Siguiente$/);

      const tabs = Array.from(element(fixture).querySelectorAll<HTMLButtonElement>('button.tab'));
      expect(tabs.map((tab) => tab.disabled)).toEqual([false]);
      await press(fixture, /^\s*paso 1\s*$/);
      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 1');
    });
  });

  describe('a name proposed from the account signed in', () => {
    const ana = { name: 'Ana', email: 'ana@example.com' };
    const bea = { name: 'Bea', email: 'bea@example.com' };
    const http = () => TestBed.inject(HttpTestingController);

    /** Lets a settled request's promise chain run. */
    function settle(): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve));
    }

    async function answered(fixture: ComponentFixture<CreatePage>): Promise<void> {
      await settle();
      await fixture.whenStable();
    }

    /** Signed in as Ana: step 1 holds the name of her last event, "Ana G.", and a title. */
    async function proposed(): Promise<ComponentFixture<CreatePage>> {
      const fixture = await render();
      http().expectOne('/api/auth/session').flush(ana);
      await answered(fixture);
      http().expectOne('/api/me/organizer-name').flush({ organizerName: 'Ana G.' });
      await answered(fixture);
      await type(fixture, 'event-title', 'Cena de verano');
      return fixture;
    }

    /** The tab keeps a wizard left on `step` with "Ana G." as it was proposed for Ana. */
    function keptWithAnaProposed(step: number): void {
      keepDraft({
        ...newDraft(),
        step,
        details: { organizerName: 'Ana G.', title: 'Cena de verano' },
        dates: { ...newDraft().dates, singles: ['2026-06-20'] },
        proposedName: { name: 'Ana G.', email: ana.email },
      });
    }

    /** "Cerrar sesión", from the account menu or the last step. */
    async function signOut(fixture: ComponentFixture<CreatePage>): Promise<void> {
      const signingOut = TestBed.inject(Session).signOut();
      http().expectOne('/api/auth/sign-out').flush({ signedOut: true });
      await signingOut;
      await answered(fixture);
    }

    /** On the last step, Ana's session has ended when she presses "Crear". */
    async function sessionEndsAtCreate(fixture: ComponentFixture<CreatePage>): Promise<void> {
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^sábado, 20 de junio$/);
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Crear$/);
      http()
        .expectOne({ method: 'POST', url: '/api/events' })
        .flush(
          { error: { code: 'UNAUTHENTICATED', message: 'No session', details: [] } },
          { status: 401, statusText: 'Unauthorized' },
        );
      await answered(fixture);
      http().expectOne('/api/auth/session').flush(null);
      await answered(fixture);
    }

    /** After the code to her email, "Cambiar email", another email and "Crear". */
    async function codeToAnotherEmail(fixture: ComponentFixture<CreatePage>): Promise<void> {
      http()
        .expectOne({ method: 'POST', url: '/api/auth/sign-in-code' })
        .flush({ sent: true, resendAfterSeconds: 30 });
      await answered(fixture);
      await press(fixture, /Cambiar email/);
      await type(fixture, 'event-email', 'ana.trabajo@example.com');
      await press(fixture, /^Crear$/);
    }

    it('is forgotten when the browser signs out, left as it was: the wizard goes back to step 1, the rest kept', async () => {
      const fixture = await proposed();
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^sábado, 20 de junio$/);

      await signOut(fixture);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 1');
      expect(typed(fixture)).toEqual(['', 'Cena de verano']);
      expect(openingDraft().proposedName).toBeNull();
      await type(fixture, 'organizer-name', 'Bea');
      await press(fixture, /^Siguiente$/);
      expect(markedDays(fixture)).toEqual(['sábado, 20 de junio']);
    });

    it('stays when changed by hand, and so does the step, when the browser signs out', async () => {
      const fixture = await proposed();
      await type(fixture, 'organizer-name', 'Ana');
      await press(fixture, /^Siguiente$/);

      await signOut(fixture);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 2');
      expect(openingDraft().details.organizerName).toBe('Ana');
    });

    it('is kept by the draft with the account it was proposed for', async () => {
      await proposed();

      expect(openingDraft().proposedName).toEqual({ name: 'Ana G.', email: ana.email });
    });

    it('is forgotten by a draft opened again without a session', async () => {
      keptWithAnaProposed(2);

      const fixture = await render();
      http().expectOne('/api/auth/session').flush(null);
      await answered(fixture);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 1');
      expect(typed(fixture)).toEqual(['', 'Cena de verano']);
    });

    it('is forgotten by a draft opened again once the session has answered without one', async () => {
      // Back from another page: the session was asked when the app started.
      TestBed.inject(Session);
      http().expectOne('/api/auth/session').flush(null);
      await settle();
      keptWithAnaProposed(2);

      const fixture = await render();
      await answered(fixture);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 1');
      expect(typed(fixture)).toEqual(['', 'Cena de verano']);
    });

    it('stays in a draft opened again by the account it was proposed for', async () => {
      keptWithAnaProposed(2);

      const fixture = await render();
      http().expectOne('/api/auth/session').flush(ana);
      await answered(fixture);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 2');
      expect(openingDraft().details.organizerName).toBe('Ana G.');
    });

    it('stays when the question about the session gets no answer', async () => {
      keptWithAnaProposed(2);

      const fixture = await render();
      http()
        .expectOne('/api/auth/session')
        .flush('down', { status: 503, statusText: 'Service Unavailable' });
      await answered(fixture);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 2');
      expect(openingDraft().details.organizerName).toBe('Ana G.');
      expect(openingDraft().proposedName).toEqual({ name: 'Ana G.', email: ana.email });
    });

    it('is forgotten by a draft opened again by another account, whose own name is proposed', async () => {
      keptWithAnaProposed(2);

      const fixture = await render();
      http().expectOne('/api/auth/session').flush(bea);
      await answered(fixture);
      http().expectOne('/api/me/organizer-name').flush({ organizerName: 'Bea R.' });
      await answered(fixture);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 1');
      expect(typed(fixture)).toEqual(['Bea R.', 'Cena de verano']);
      expect(openingDraft().proposedName).toEqual({ name: 'Bea R.', email: bea.email });
    });

    it('is forgotten on step 1 too when another account opens it, whose own name is proposed', async () => {
      keptWithAnaProposed(1);

      const fixture = await render();
      http().expectOne('/api/auth/session').flush(bea);
      await answered(fixture);
      http().expectOne('/api/me/organizer-name').flush({ organizerName: 'Bea R.' });
      await answered(fixture);

      expect(typed(fixture)).toEqual(['Bea R.', 'Cena de verano']);
    });

    it('puts the cursor in the title when step 1 opens again with it', async () => {
      keptWithAnaProposed(1);

      const fixture = await render();
      http().expectOne('/api/auth/session').flush(ana);
      await answered(fixture);

      expect(document.activeElement?.id).toBe('event-title');
      http().expectNone('/api/me/organizer-name');
      expect(typed(fixture)).toEqual(['Ana G.', 'Cena de verano']);
    });

    it('stays while the code sent to the email of a session that ended is waited for', async () => {
      const fixture = await proposed();
      await sessionEndsAtCreate(fixture);
      http()
        .expectOne({ method: 'POST', url: '/api/auth/sign-in-code' })
        .flush({ sent: true, resendAfterSeconds: 30 });
      await answered(fixture);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('último paso');
      expect(card(fixture)?.querySelector('h2')?.textContent.trim()).toBe('Escribe el código');
      expect(openingDraft().details.organizerName).toBe('Ana G.');
    });

    it('stays when the code to the email of a session that ended was not sent, which the last step says', async () => {
      const fixture = await proposed();
      await sessionEndsAtCreate(fixture);
      http()
        .expectOne({ method: 'POST', url: '/api/auth/sign-in-code' })
        .flush('down', { status: 503, statusText: 'Service Unavailable' });
      await answered(fixture);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('último paso');
      expect(card(fixture)?.textContent).toContain('No hemos podido enviarte el código.');
      expect(openingDraft().details.organizerName).toBe('Ana G.');
    });

    it('stays while another email is typed after the session ended', async () => {
      const fixture = await proposed();
      await sessionEndsAtCreate(fixture);
      http()
        .expectOne({ method: 'POST', url: '/api/auth/sign-in-code' })
        .flush({ sent: true, resendAfterSeconds: 30 });
      await answered(fixture);
      await press(fixture, /Cambiar email/);

      await type(fixture, 'event-email', 'ana.trabajo@example.com');

      expect(card(fixture)?.getAttribute('aria-label')).toBe('último paso');
      expect(openingDraft().details.organizerName).toBe('Ana G.');
    });

    it('stays after "Cambiar email" again, once the code went to another email', async () => {
      const fixture = await proposed();
      await sessionEndsAtCreate(fixture);
      await codeToAnotherEmail(fixture);
      http()
        .expectOne({ method: 'POST', url: '/api/auth/sign-in-code' })
        .flush({ sent: true, resendAfterSeconds: 30 });
      await answered(fixture);

      await press(fixture, /Cambiar email/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('último paso');
      expect(openingDraft().details.organizerName).toBe('Ana G.');
    });

    it('stays when the code to another email was not sent, which the last step says', async () => {
      const fixture = await proposed();
      await sessionEndsAtCreate(fixture);
      await codeToAnotherEmail(fixture);

      http()
        .expectOne({ method: 'POST', url: '/api/auth/sign-in-code' })
        .flush('down', { status: 503, statusText: 'Service Unavailable' });
      await answered(fixture);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('último paso');
      expect(card(fixture)?.textContent).toContain('No hemos podido enviarte el código.');
      expect(openingDraft().details.organizerName).toBe('Ana G.');
    });

    it('puts the cursor in the emptied name field when step 1, opened again with it, forgets it', async () => {
      keptWithAnaProposed(1);

      const fixture = await render();
      http().expectOne('/api/auth/session').flush(null);
      await answered(fixture);

      expect(typed(fixture)).toEqual(['', 'Cena de verano']);
      expect(document.activeElement?.id).toBe('organizer-name');
    });

    it('is not kept by "Crear otro evento" when the name cannot be asked again', async () => {
      const fixture = await proposed();
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^sábado, 20 de junio$/);
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Crear$/);
      http()
        .expectOne({ method: 'POST', url: '/api/events' })
        .flush(
          { participationId: 'uHuaiU4BzZfa7oUR2OC3QQ', resultsId: 'r3sUlTs4BzZfa7oUR2OC3QQ' },
          { status: 201, statusText: 'Created' },
        );
      await answered(fixture);

      await press(fixture, /^\s*Crear otro evento\s*$/);
      http()
        .expectOne('/api/me/organizer-name')
        .flush('down', { status: 503, statusText: 'Service Unavailable' });
      await answered(fixture);

      expect(typed(fixture)).toEqual(['', '']);
      expect(openingDraft().proposedName).toBeNull();
    });

    it('is the account’s that the code to another email signs in: the event is sent with it, and a failure keeps it', async () => {
      const fixture = await proposed();
      await sessionEndsAtCreate(fixture);
      await codeToAnotherEmail(fixture);
      http()
        .expectOne({ method: 'POST', url: '/api/auth/sign-in-code' })
        .flush({ sent: true, resendAfterSeconds: 30 });
      await answered(fixture);

      await type(fixture, 'sign-in-code', '482915');
      http().expectOne({ method: 'POST', url: '/api/auth/sign-in' }).flush({ signedIn: true });
      await answered(fixture);
      http()
        .expectOne('/api/auth/session')
        .flush({ name: 'Ana', email: 'ana.trabajo@example.com' });
      await answered(fixture);
      const sending = http().expectOne({ method: 'POST', url: '/api/events' });
      expect(sending.request.body).toMatchObject({ organizerName: 'Ana G.' });
      sending.flush('down', { status: 503, statusText: 'Service Unavailable' });
      await answered(fixture);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('último paso');
      expect(openingDraft().details.organizerName).toBe('Ana G.');
      expect(openingDraft().proposedName).toEqual({
        name: 'Ana G.',
        email: 'ana.trabajo@example.com',
      });
    });

    it('is the account’s that signs in while its code is waited for: it stays, on the last step', async () => {
      const fixture = await proposed();
      await sessionEndsAtCreate(fixture);
      http()
        .expectOne({ method: 'POST', url: '/api/auth/sign-in-code' })
        .flush({ sent: true, resendAfterSeconds: 30 });
      await answered(fixture);

      // Signed in another way (another tab) while the code was waited for.
      const signingIn = TestBed.inject(Session).refresh();
      http().expectOne('/api/auth/session').flush(bea);
      await signingIn;
      await answered(fixture);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('último paso');
      expect(card(fixture)?.querySelector('h2')?.textContent.trim()).not.toBe('Escribe el código');
      expect(openingDraft().details.organizerName).toBe('Ana G.');
      expect(openingDraft().proposedName).toEqual({ name: 'Ana G.', email: bea.email });
    });
  });
});
