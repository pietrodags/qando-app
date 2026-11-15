import { ErrorHandler } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { installTestScreen, type TestScreen } from '../../../test/media-queries';
import { WizardDetails } from './wizard-details';
import detailsStyles from './wizard-details.scss' with { loader: 'text' };

describe('WizardDetails', () => {
  let screen: TestScreen;
  let errors: unknown[];

  beforeEach(() => {
    // jsdom has no layout: the screen width the field's autofocus depends on is the test's choice.
    screen = installTestScreen({ '(min-width: 650px)': true });
    errors = [];
    TestBed.configureTestingModule({
      imports: [WizardDetails],
      providers: [
        provideI18n(),
        // Errors after rendering (the autofocus) reach the error handler instead of the test.
        {
          provide: ErrorHandler,
          useValue: { handleError: (error: unknown) => errors.push(error) },
        },
      ],
    });
  });

  afterEach(() => {
    expect(errors).toEqual([]);
  });

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

  function field(fixture: ComponentFixture<WizardDetails>, id: string): HTMLInputElement {
    const input = element(fixture).querySelector<HTMLInputElement>(`#${id}`);
    if (!input) throw new Error(`No field #${id}`);
    return input;
  }

  const nameField = (fixture: ComponentFixture<WizardDetails>) => field(fixture, 'organizer-name');
  const titleField = (fixture: ComponentFixture<WizardDetails>) => field(fixture, 'event-title');

  function labelOf(fixture: ComponentFixture<WizardDetails>, input: HTMLInputElement): string {
    return (
      element(fixture).querySelector(`label[for="${input.id}"]`)?.textContent.trim() ?? 'no label'
    );
  }

  async function type(
    fixture: ComponentFixture<WizardDetails>,
    input: HTMLInputElement,
    value: string,
  ): Promise<void> {
    input.value = value;
    input.dispatchEvent(new InputEvent('input'));
    await fixture.whenStable();
  }

  function next(fixture: ComponentFixture<WizardDetails>): HTMLButtonElement {
    const button = element(fixture).querySelector<HTMLButtonElement>('button');
    if (!button) throw new Error('No button');
    return button;
  }

  /** The text an element's description points to: what a screen reader hears with it. */
  function description(fixture: ComponentFixture<WizardDetails>, of: HTMLElement): string | null {
    const id = of.getAttribute('aria-describedby');
    if (id === null) return null;
    return element(fixture).querySelector(`#${id}`)?.textContent.trim() ?? null;
  }

  /** What is missing, as a screen reader hears it with the arrow; never on screen. */
  function missing(fixture: ComponentFixture<WizardDetails>): string | null {
    const id = next(fixture).getAttribute('aria-describedby');
    const hidden = id === null ? null : element(fixture).querySelector(`#${id}`);
    if (hidden && !hidden.classList.contains('visually-hidden')) throw new Error('Shown on screen');
    return description(fixture, next(fixture));
  }

  /** The fields with the green check at their end, by id. */
  function checked(fixture: ComponentFixture<WizardDetails>): string[] {
    return [nameField(fixture), titleField(fixture)]
      .filter((input) => input.parentElement?.querySelector('.check') !== null)
      .map((input) => input.id);
  }

  function nextCount(fixture: ComponentFixture<WizardDetails>): () => number {
    let count = 0;
    fixture.componentInstance.next.subscribe(() => (count += 1));
    return () => count;
  }

  async function pressEnter(
    fixture: ComponentFixture<WizardDetails>,
    input: HTMLInputElement,
  ): Promise<void> {
    // Enter in a field submits its form: jsdom does not do it on its own.
    input.form?.requestSubmit();
    await fixture.whenStable();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(detailsStyles)).toEqual([]);
  });

  it('asks the name first, then the title, each with its label and example', async () => {
    const fixture = await render();
    const fields = Array.from(element(fixture).querySelectorAll('input'));

    expect(fields).toEqual([nameField(fixture), titleField(fixture)]);
    expect(labelOf(fixture, nameField(fixture))).toBe(
      'Tu nombre, para comunicárselo a los participantes.',
    );
    expect(nameField(fixture).placeholder).toBe('Lucero');
    expect(labelOf(fixture, titleField(fixture))).toBe('¿Qué hay que organizar?');
    expect(titleField(fixture).placeholder).toBe('Cena de verano del equipo');
  });

  it('offers the name the browser knows, and nothing for the title', async () => {
    const fixture = await render();

    expect(nameField(fixture).autocomplete).toBe('name');
    expect(titleField(fixture).autocomplete).toBe('off');
  });

  it('stops each field at what an event allows, counting characters as people see them', async () => {
    const fixture = await render();
    // A family emoji is 11 code units: the browser's maxlength would have cut it, or refused it.
    const title = `${'c'.repeat(49)}👨‍👩‍👧‍👦`;

    await type(fixture, nameField(fixture), 'a'.repeat(31));
    await type(fixture, titleField(fixture), `${title}x`);

    expect(nameField(fixture).maxLength).toBe(-1);
    expect(nameField(fixture).value).toBe('a'.repeat(30));
    expect(titleField(fixture).maxLength).toBe(-1);
    expect(titleField(fixture).value).toBe(title);
    expect(fixture.componentInstance.details()).toEqual({
      organizerName: 'a'.repeat(30),
      title,
    });
  });

  it('shows what the page holds, so nothing is lost when the step folds away and comes back', async () => {
    const fixture = await render({ organizerName: 'Ana', title: 'Cena de verano' });

    expect(nameField(fixture).value).toBe('Ana');
    expect(titleField(fixture).value).toBe('Cena de verano');
  });

  it('keeps a full field as it was when one more character is typed', async () => {
    const fixture = await render();

    await type(fixture, nameField(fixture), 'a'.repeat(30));
    await type(fixture, nameField(fixture), 'a'.repeat(31));
    await type(fixture, titleField(fixture), 'b'.repeat(50));
    await type(fixture, titleField(fixture), `${'b'.repeat(50)}c`);

    expect(nameField(fixture).value).toBe('a'.repeat(30));
    expect(titleField(fixture).value).toBe('b'.repeat(50));
    expect(fixture.componentInstance.details()).toEqual({
      organizerName: 'a'.repeat(30),
      title: 'b'.repeat(50),
    });
  });

  it('refuses a character typed inside a full field, leaving the rest and the cursor in place', async () => {
    const full = 'Cena del equipo para celebrar juntos este verano!!';
    const fixture = await render({ title: full });
    const input = titleField(fixture);

    // "X" typed after "Cena ": the browser has already put it there, with the cursor after it.
    input.value = `Cena X${full.slice(5)}`;
    input.setSelectionRange(6, 6);
    input.dispatchEvent(new InputEvent('input'));
    await fixture.whenStable();

    expect(input.value).toBe(full);
    expect([input.selectionStart, input.selectionEnd]).toEqual([5, 5]);
    expect(fixture.componentInstance.details().title).toBe(full);
  });

  it('leaves the field alone while what it holds fits, a selection included', async () => {
    const fixture = await render();
    const input = nameField(fixture);

    input.value = 'Ana';
    input.setSelectionRange(0, 3);
    input.dispatchEvent(new InputEvent('input'));
    await fixture.whenStable();

    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3]);
  });

  it('waits for a composed character to be committed before cutting', async () => {
    const fixture = await render({ organizerName: 'a'.repeat(29) });
    const input = nameField(fixture);

    // Pinyin typed for one Chinese character: the provisional "ni" goes past 30 for a while.
    input.value = `${'a'.repeat(29)}ni`;
    input.dispatchEvent(new InputEvent('input', { isComposing: true }));
    await fixture.whenStable();
    expect(input.value).toBe(`${'a'.repeat(29)}ni`);

    input.value = `${'a'.repeat(29)}你`;
    input.dispatchEvent(new InputEvent('input', { isComposing: true }));
    input.dispatchEvent(new CompositionEvent('compositionend'));
    await fixture.whenStable();
    expect(input.value).toBe(`${'a'.repeat(29)}你`);

    input.value = `${'a'.repeat(29)}你好`;
    input.dispatchEvent(new InputEvent('input', { isComposing: true }));
    input.dispatchEvent(new CompositionEvent('compositionend'));
    await fixture.whenStable();
    expect(input.value).toBe(`${'a'.repeat(29)}你`);
    expect(fixture.componentInstance.details().organizerName).toBe(`${'a'.repeat(29)}你`);
  });

  it('gives the page what is typed, as typed', async () => {
    const fixture = await render();

    await type(fixture, nameField(fixture), ' Ana ');
    await type(fixture, titleField(fixture), 'Cena de verano');

    expect(fixture.componentInstance.details()).toEqual({
      organizerName: ' Ana ',
      title: 'Cena de verano',
    });
  });

  it('names the round arrow "Siguiente"', async () => {
    const fixture = await render();

    expect(next(fixture).getAttribute('aria-label')).toBe('Siguiente');
    expect(next(fixture).type).toBe('submit');
    expect(next(fixture).querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  describe('until the step is valid', () => {
    it('tells screen readers with the arrow that both are missing on an untouched step', async () => {
      const fixture = await render();

      expect(next(fixture).getAttribute('aria-disabled')).toBe('true');
      expect(missing(fixture)).toBe('Completa tu nombre y el título del evento.');
    });

    it('says what is still missing as the organizer types', async () => {
      const fixture = await render();

      await type(fixture, nameField(fixture), 'Ana');
      expect(missing(fixture)).toBe('Completa el título del evento.');

      await type(fixture, nameField(fixture), '');
      await type(fixture, titleField(fixture), 'Cena de verano');
      expect(missing(fixture)).toBe('Completa tu nombre.');
    });

    it('marks no field on an untouched step', async () => {
      const fixture = await render();

      expect(checked(fixture)).toEqual([]);
      expect(description(fixture, nameField(fixture))).toBeNull();
      expect(description(fixture, titleField(fixture))).toBeNull();
    });

    it('marks each field with a green check once what it holds is valid', async () => {
      const fixture = await render();

      await type(fixture, nameField(fixture), 'Ana');
      expect(checked(fixture)).toEqual(['organizer-name']);

      await type(fixture, titleField(fixture), 'Cena de verano');
      expect(checked(fixture)).toEqual(['organizer-name', 'event-title']);

      await type(fixture, nameField(fixture), 'A');
      expect(checked(fixture)).toEqual(['event-title']);
    });

    it('tells screen readers a checked field is right', async () => {
      const fixture = await render({ organizerName: 'Ana', title: '   ' });
      const check = nameField(fixture).parentElement?.querySelector('.check');

      expect(description(fixture, nameField(fixture))).toBe('Correcto');
      expect(description(fixture, titleField(fixture))).toBeNull();
      expect(check?.getAttribute('aria-hidden')).toBe('true');
    });

    it('counts only spaces as nothing typed', async () => {
      const fixture = await render({ organizerName: '   ', title: '  ' });

      expect(missing(fixture)).toBe('Completa tu nombre y el título del evento.');
    });

    it('asks for a longer name', async () => {
      const fixture = await render({ organizerName: 'A', title: 'Cena de verano' });

      expect(missing(fixture)).toBe('Tu nombre necesita al menos 2 letras.');
    });

    it('says every problem, the name first', async () => {
      const fixture = await render({ organizerName: 'A', title: '' });

      expect(missing(fixture)).toBe(
        'Tu nombre necesita al menos 2 letras. Completa el título del evento.',
      );
    });

    it('says what is too long, though the fields stop the typing there', async () => {
      // Only what the page holds can be longer: a field cuts what is typed or pasted.
      const fixture = await render({ organizerName: 'a'.repeat(31), title: 'b'.repeat(51) });

      expect(missing(fixture)).toBe(
        'Tu nombre puede tener como mucho 30 letras. El título puede tener como mucho 50 letras.',
      );
    });

    it('stays put when the arrow is pressed, still reachable by the keyboard', async () => {
      const fixture = await render({ organizerName: 'Ana' });
      const nexts = nextCount(fixture);

      next(fixture).click();
      await fixture.whenStable();
      await pressEnter(fixture, nameField(fixture));

      expect(nexts()).toBe(0);
      // Not `disabled`: the arrow keeps its place in the Tab order, where it says why.
      expect(next(fixture).disabled).toBe(false);
    });
  });

  describe('once the step is valid', () => {
    it('enables the arrow, with nothing missing to tell', async () => {
      const fixture = await render();

      await type(fixture, nameField(fixture), 'Ana');
      await type(fixture, titleField(fixture), 'Cena de verano');

      expect(next(fixture).getAttribute('aria-disabled')).toBe('false');
      expect(missing(fixture)).toBeNull();
      expect(element(fixture).querySelector('.visually-hidden:not(.valid-text)')).toBeNull();
    });

    it('asks the page for the next step when the arrow is pressed', async () => {
      const fixture = await render({ organizerName: 'Ana', title: 'Cena de verano' });
      const nexts = nextCount(fixture);

      next(fixture).click();
      await fixture.whenStable();

      expect(nexts()).toBe(1);
    });

    it('keeps the browser from sending the form anywhere', async () => {
      const fixture = await render({ organizerName: 'Ana', title: 'Cena de verano' });
      const submits: Event[] = [];
      nameField(fixture).form?.addEventListener('submit', (event) => submits.push(event));

      await pressEnter(fixture, nameField(fixture));

      expect(submits.map((event) => event.defaultPrevented)).toEqual([true]);
    });

    it('asks for the next step on Enter in either field', async () => {
      const fixture = await render({ organizerName: 'Ana', title: 'Cena de verano' });
      const nexts = nextCount(fixture);

      await pressEnter(fixture, nameField(fixture));
      await pressEnter(fixture, titleField(fixture));

      expect(nexts()).toBe(2);
    });
  });

  describe('the cursor', () => {
    it('starts in the name field where the keyboard does not cover the page', async () => {
      const fixture = await render();

      expect(document.activeElement).toBe(nameField(fixture));
    });

    it('stays where it was on a phone, where the keyboard would cover the step', async () => {
      screen.set('(min-width: 650px)', false);
      const fixture = await render();

      expect(document.activeElement).not.toBe(nameField(fixture));
    });
  });
});
