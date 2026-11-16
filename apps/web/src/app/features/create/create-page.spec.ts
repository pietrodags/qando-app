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

  it('keeps the name and the title when the organizer goes back to step 1', async () => {
    const fixture = await render();
    await fillDetails(fixture);
    await press(fixture, /^Siguiente$/);

    await press(fixture, /^\s*paso 1\s*$/);

    expect(typed(fixture)).toEqual(['Ana', 'Cena de verano']);
  });
});
