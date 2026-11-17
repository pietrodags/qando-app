import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { installTestScreen } from '../../../test/media-queries';
import { CreatePage } from './create-page';
import pageStyles from './create-page.scss' with { loader: 'text' };

describe('CreatePage', () => {
  beforeEach(() => {
    installTestScreen({ '(min-width: 650px)': true });
    // Monday 15 June 2026.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 15, 12));
    TestBed.configureTestingModule({ imports: [CreatePage], providers: [provideI18n()] });
  });

  afterEach(() => {
    vi.useRealTimers();
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
      card(fixture)?.querySelector<HTMLInputElement>('input[role="switch"]');
    expect(timesSwitch()?.checked).toBe(false);
    timesSwitch()?.click();
    await fixture.whenStable();

    await press(fixture, /^Volver al paso 1$/);
    await press(fixture, /^Siguiente$/);

    expect(timesSwitch()?.checked).toBe(true);
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

  it('stays on the dates until one is marked, then goes on to step 3, still to build', async () => {
    const fixture = await render();
    await fillDetails(fixture);
    await press(fixture, /^Siguiente$/);

    await press(fixture, /^Siguiente$/);
    expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 2');

    await press(fixture, /^sábado, 20 de junio$/);
    await press(fixture, /^Siguiente$/);

    expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 3');
    expect(card(fixture)?.textContent).toContain('Esta página está en construcción.');
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
      card(fixture)?.querySelector<HTMLInputElement>('input[role="switch"]')?.click();
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
      expect(card(fixture)?.textContent).not.toContain('Esta página está en construcción.');
      expect(
        card(fixture)
          ?.querySelector<HTMLElement>('.step-label')
          ?.style.getPropertyValue('--step-accent'),
      ).toBe('var(--q-accent-amber)');
    });

    it('goes on from the times to step 4, still to build', async () => {
      const fixture = await askForTimes();
      await press(fixture, /^Siguiente$/);

      await press(fixture, /^Siguiente$/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 4');
      expect(card(fixture)?.textContent).toContain('Esta página está en construcción.');
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
      card(fixture)?.querySelector<HTMLInputElement>('input[role="switch"]')?.click();
      await fixture.whenStable();

      await press(fixture, /^Siguiente$/);

      expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 3');
      expect(card(fixture)?.querySelector('app-wizard-times')).toBeNull();
      expect(card(fixture)?.textContent).toContain('Esta página está en construcción.');
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
      expect(card(fixture)?.textContent).toContain('Esta página está en construcción.');
    });
  });

  it('keeps the name and the title when the organizer goes back to step 1', async () => {
    const fixture = await render();
    await fillDetails(fixture);
    await press(fixture, /^Siguiente$/);

    await press(fixture, /^\s*paso 1\s*$/);

    expect(typed(fixture)).toEqual(['Ana', 'Cena de verano']);
  });
});
