import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { managementTokenSchema } from '@qando/contracts';
import { ManagementTokens } from '../../core/auth/management-tokens';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { installTestScreen } from '../../../test/media-queries';
import { CreatePage } from './create-page';
import pageStyles from './create-page.scss' with { loader: 'text' };

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

  it('stays on the dates until one is marked, then goes on to the last step, step 3, in salmon', async () => {
    const fixture = await render();
    await fillDetails(fixture);
    await press(fixture, /^Siguiente$/);

    await press(fixture, /^Siguiente$/);
    expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 2');

    await press(fixture, /^sábado, 20 de junio$/);
    await press(fixture, /^Siguiente$/);

    expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 3');
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

    it('goes on from the times to their summary, step 4, and from it to the last step, step 5', async () => {
      const fixture = await askForTimes();
      await press(fixture, /^Siguiente$/);

      await press(fixture, /^Siguiente$/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 4');
      expect(
        card(fixture)?.querySelector('app-wizard-summary ul[aria-label="sábado, 20 de junio"]'),
      ).not.toBeNull();
      expect(
        card(fixture)
          ?.querySelector<HTMLElement>('.step-label')
          ?.style.getPropertyValue('--step-accent'),
      ).toBe('var(--q-accent-amber)');

      await press(fixture, /^Siguiente$/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 5');
      expect(card(fixture)?.querySelector('app-wizard-finish')).not.toBeNull();
      expect(accent(fixture)).toBe('var(--q-accent-salmon)');
    });

    it('comes back to the summary with the arrow of the last step', async () => {
      const fixture = await askForTimes();
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Siguiente$/);

      await press(fixture, /^Volver al paso 4$/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 4');
    });

    it('keeps what is corrected on a column of the summary: the times step has it', async () => {
      const fixture = await askForTimes();
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Editar sábado, 20 de junio$/);
      await press(fixture, /^\s*18:00\s*$/);
      await press(fixture, /^Listo$/);

      await press(fixture, /^Volver al paso 3$/);

      expect(markedTimes(fixture)).toEqual(['18:00']);
    });

    it('comes back to the times with the arrow of the summary', async () => {
      const fixture = await askForTimes();
      await press(fixture, /^Siguiente$/);
      await press(fixture, /^Siguiente$/);

      await press(fixture, /^Volver al paso 3$/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 3');
      expect(card(fixture)?.querySelector('app-wizard-times')).not.toBeNull();
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

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 3');
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

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 3');
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

    function deadline(fixture: ComponentFixture<CreatePage>): string | undefined {
      return card(fixture)?.querySelector('#deadline-value')?.textContent.trim();
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

      expect(deadline(fixture)).toBe('vie 19 jun 2026');
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
      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 3');
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

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 3');
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

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 3');
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
      expect(deadline(fixture)).toBe('lun 22 jun 2026');
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
});
