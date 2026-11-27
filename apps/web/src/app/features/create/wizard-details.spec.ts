import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { installTestScreen, type TestScreen } from '../../../test/media-queries';
import { WizardDetails } from './wizard-details';
import detailsStyles from './wizard-details.scss' with { loader: 'text' };

describe('WizardDetails', () => {
  let screen: TestScreen;

  beforeEach(() => {
    // jsdom has no layout: the screen width the field's autofocus depends on is the test's choice.
    screen = installTestScreen({ '(min-width: 650px)': true });
    TestBed.configureTestingModule({ imports: [WizardDetails], providers: [provideI18n()] });
  });

  /** The step showing what the page holds. */
  async function render(
    values: { organizerName?: string; title?: string } = {},
  ): Promise<ComponentFixture<WizardDetails>> {
    const fixture = TestBed.createComponent(WizardDetails);
    fixture.componentRef.setInput('details', { organizerName: '', title: '', ...values });
    await fixture.whenStable();
    return fixture;
  }

  function element(fixture: ComponentFixture<WizardDetails>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function titleField(fixture: ComponentFixture<WizardDetails>): HTMLInputElement {
    const input = element(fixture).querySelector<HTMLInputElement>('#event-title');
    if (!input) throw new Error('No title field');
    return input;
  }

  async function type(fixture: ComponentFixture<WizardDetails>, value: string): Promise<void> {
    titleField(fixture).value = value;
    titleField(fixture).dispatchEvent(new InputEvent('input'));
    await fixture.whenStable();
  }

  function next(fixture: ComponentFixture<WizardDetails>): HTMLButtonElement {
    const button = element(fixture).querySelector<HTMLButtonElement>('button');
    if (!button) throw new Error('No button');
    return button;
  }

  /** What is missing, as a screen reader hears it with the arrow; never on screen. */
  function missing(fixture: ComponentFixture<WizardDetails>): string | null {
    const id = next(fixture).getAttribute('aria-describedby');
    if (id === null) return null;
    const hidden = element(fixture).querySelector(`#${id}`);
    if (!hidden?.classList.contains('visually-hidden')) throw new Error('Shown on screen');
    return hidden.textContent.trim();
  }

  function nextCount(fixture: ComponentFixture<WizardDetails>): () => number {
    let count = 0;
    fixture.componentInstance.next.subscribe(() => (count += 1));
    return () => count;
  }

  async function pressEnter(fixture: ComponentFixture<WizardDetails>): Promise<void> {
    // Enter in a field submits its form: jsdom does not do it on its own.
    titleField(fixture).form?.requestSubmit();
    await fixture.whenStable();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(detailsStyles)).toEqual([]);
  });

  it('asks the title alone, with its label as the question and no example', async () => {
    const fixture = await render();

    expect(Array.from(element(fixture).querySelectorAll('input'))).toEqual([titleField(fixture)]);
    expect(element(fixture).querySelector('label[for="event-title"]')?.textContent.trim()).toBe(
      '¿Qué organizamos?',
    );
    expect(titleField(fixture).hasAttribute('placeholder')).toBe(false);
    expect(titleField(fixture).autocomplete).toBe('off');
  });

  it('stops the title at what an event allows, counting characters as people see them', async () => {
    const fixture = await render();
    // A family emoji is 11 code units: the browser's maxlength would have cut it, or refused it.
    const title = `${'c'.repeat(49)}👨‍👩‍👧‍👦`;

    await type(fixture, `${title}x`);

    expect(titleField(fixture).maxLength).toBe(-1);
    expect(titleField(fixture).value).toBe(title);
  });

  it('shows the title the page holds, so nothing is lost when the step folds away and comes back', async () => {
    const fixture = await render({ title: 'Cena de verano' });

    expect(titleField(fixture).value).toBe('Cena de verano');
  });

  it('gives the page the title as typed, and leaves the name it holds as it is', async () => {
    const fixture = await render({ organizerName: 'Ana' });

    await type(fixture, ' Cena de verano ');

    expect(fixture.componentInstance.details()).toEqual({
      organizerName: 'Ana',
      title: ' Cena de verano ',
    });
  });

  it('names the round arrow "Siguiente"', async () => {
    const fixture = await render();

    expect(next(fixture).getAttribute('aria-label')).toBe('Siguiente');
    expect(next(fixture).type).toBe('submit');
    expect(next(fixture).querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks the title with no check, nor tells screen readers it is right', async () => {
    const fixture = await render({ title: 'Cena de verano' });

    // The arrow's is the step's only icon.
    expect(Array.from(element(fixture).querySelectorAll('svg'))).toEqual([
      next(fixture).querySelector('svg'),
    ]);
    expect(titleField(fixture).hasAttribute('aria-describedby')).toBe(false);
  });

  describe('until the title is written', () => {
    it('tells screen readers with the arrow that the title is missing', async () => {
      const fixture = await render();

      expect(next(fixture).getAttribute('aria-disabled')).toBe('true');
      expect(missing(fixture)).toBe('Completa el título del evento.');
    });

    it('counts only spaces as nothing typed', async () => {
      const fixture = await render({ title: '   ' });

      expect(missing(fixture)).toBe('Completa el título del evento.');
    });

    it('says a title too long, though the field stops the typing there', async () => {
      // Only what the page holds can be longer: the field cuts what is typed or pasted.
      const fixture = await render({ title: 'b'.repeat(51) });

      expect(missing(fixture)).toBe('El título puede tener como mucho 50 letras.');
    });

    it('asks nothing of the name, which the last step asks', async () => {
      const fixture = await render({ organizerName: '', title: 'Cena de verano' });

      expect(missing(fixture)).toBeNull();
    });

    it('stays put when the arrow or Enter is pressed, the arrow still reachable by the keyboard', async () => {
      const fixture = await render();
      const nexts = nextCount(fixture);

      next(fixture).click();
      await fixture.whenStable();
      await pressEnter(fixture);

      expect(nexts()).toBe(0);
      // Not `disabled`: the arrow keeps its place in the Tab order, where it says why.
      expect(next(fixture).disabled).toBe(false);
    });
  });

  describe('once the title is written', () => {
    it('enables the arrow, with nothing missing to tell', async () => {
      const fixture = await render();

      await type(fixture, 'Cena de verano');

      expect(next(fixture).getAttribute('aria-disabled')).toBe('false');
      expect(missing(fixture)).toBeNull();
      expect(element(fixture).querySelector('.visually-hidden')).toBeNull();
    });

    it('asks the page for the next step when the arrow is pressed, or Enter in the field', async () => {
      const fixture = await render({ title: 'Cena de verano' });
      const nexts = nextCount(fixture);

      next(fixture).click();
      await fixture.whenStable();
      await pressEnter(fixture);

      expect(nexts()).toBe(2);
    });

    it('keeps the browser from sending the form anywhere', async () => {
      const fixture = await render({ title: 'Cena de verano' });
      const submits: Event[] = [];
      titleField(fixture).form?.addEventListener('submit', (event) => submits.push(event));

      await pressEnter(fixture);

      expect(submits.map((event) => event.defaultPrevented)).toEqual([true]);
    });
  });

  describe('the cursor', () => {
    it('starts in the title where the keyboard does not cover the page', async () => {
      const fixture = await render();

      expect(document.activeElement).toBe(titleField(fixture));
    });

    it('starts in the title the page holds too, the step opened again', async () => {
      const fixture = await render({ organizerName: 'Ana', title: 'Cena de verano' });

      expect(document.activeElement).toBe(titleField(fixture));
    });

    it('stays where it was on a phone, where the keyboard would cover the step', async () => {
      screen.set('(min-width: 650px)', false);
      const fixture = await render();

      expect(document.activeElement).not.toBe(titleField(fixture));
    });
  });
});
