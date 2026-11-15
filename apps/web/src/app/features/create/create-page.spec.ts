import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { installTestScreen } from '../../../test/media-queries';
import { CreatePage } from './create-page';
import pageStyles from './create-page.scss' with { loader: 'text' };

describe('CreatePage', () => {
  beforeEach(() => {
    installTestScreen({ '(min-width: 650px)': true });
    TestBed.configureTestingModule({ imports: [CreatePage], providers: [provideI18n()] });
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

  it('goes on to the dates, still to build, once they are', async () => {
    const fixture = await render();
    await fillDetails(fixture);

    await press(fixture, /^Siguiente$/);

    expect(card(fixture)?.getAttribute('aria-label')).toBe('paso 2');
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
