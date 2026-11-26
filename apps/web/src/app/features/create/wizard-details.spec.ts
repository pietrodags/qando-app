import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ErrorHandler } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { SignedInAccount } from '@qando/contracts';
import { Session } from '../../core/auth/session';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { installTestScreen, type TestScreen } from '../../../test/media-queries';
import { type ProposedName, WizardDetails } from './wizard-details';
import detailsStyles from './wizard-details.scss' with { loader: 'text' };

const ana: SignedInAccount = { name: 'Ana', email: 'ana@example.com' };
const bea: SignedInAccount = { name: 'Bea', email: 'bea@example.com' };

/** Where the step asks the name of the account's last event. */
const NAME_ASKED = '/api/me/organizer-name';

/** Lets the answers given and the work they started end. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('WizardDetails', () => {
  let screen: TestScreen;
  let errors: unknown[];
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    // jsdom has no layout: the screen width the field's autofocus depends on is the test's choice.
    screen = installTestScreen({ '(min-width: 650px)': true });
    errors = [];
    TestBed.configureTestingModule({
      imports: [WizardDetails],
      providers: [
        provideI18n(),
        provideHttpClient(),
        provideHttpClientTesting(),
        // Errors after rendering (the autofocus) reach the error handler instead of the test.
        {
          provide: ErrorHandler,
          useValue: { handleError: (error: unknown) => errors.push(error) },
        },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    expect(errors).toEqual([]);
  });

  /**
   * The step showing what the page holds, on a browser signed in as `account`, or none; the name
   * it holds proposed for the account of the email `proposedFor`, or not proposed.
   */
  async function render(
    values: { organizerName?: string; title?: string } = {},
    account: SignedInAccount | null = null,
    proposedFor: string | null = null,
  ): Promise<ComponentFixture<WizardDetails>> {
    TestBed.inject(Session);
    httpTesting.expectOne('/api/auth/session').flush(account);
    await settle();
    const fixture = TestBed.createComponent(WizardDetails);
    fixture.componentRef.setInput('details', { organizerName: '', title: '', ...values });
    fixture.componentRef.setInput('proposedFor', proposedFor);
    await fixture.whenStable();
    await settle();
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
    expect(nameField(fixture).hasAttribute('placeholder')).toBe(false);
    expect(labelOf(fixture, titleField(fixture))).toBe('¿Qué hay que organizar?');
    expect(titleField(fixture).hasAttribute('placeholder')).toBe(false);
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

  describe('the name of the account’s last event', () => {
    /** Answers the step's question with the name of the account's last event, or none. */
    async function answer(
      fixture: ComponentFixture<WizardDetails>,
      organizerName: string | null,
    ): Promise<void> {
      httpTesting.expectOne(NAME_ASKED).flush({ organizerName });
      await settle();
      await fixture.whenStable();
    }

    /** The names the step told the page it proposed, each with the account's email. */
    function proposedNames(fixture: ComponentFixture<WizardDetails>): ProposedName[] {
      const names: ProposedName[] = [];
      fixture.componentInstance.proposed.subscribe((name) => names.push(name));
      return names;
    }

    it('fills the empty name field with it, for the page to hold, and the cursor goes on to the title', async () => {
      const fixture = await render({}, ana);
      const proposed = proposedNames(fixture);

      await answer(fixture, 'Ana G.');

      expect(nameField(fixture).value).toBe('Ana G.');
      expect(fixture.componentInstance.details()).toEqual({ organizerName: 'Ana G.', title: '' });
      expect(proposed).toEqual([{ name: 'Ana G.', email: ana.email }]);
      expect(document.activeElement).toBe(titleField(fixture));
    });

    it('leaves the field empty, the cursor in it, for an account without events', async () => {
      const fixture = await render({}, ana);

      await answer(fixture, null);

      expect(nameField(fixture).value).toBe('');
      expect(document.activeElement).toBe(nameField(fixture));
    });

    it('is not asked without a session', async () => {
      await render({}, null);

      httpTesting.expectNone(NAME_ASKED);
    });

    it('is not asked when the page already holds a name, the one typed before', async () => {
      const fixture = await render({ organizerName: 'Anita' }, ana);

      httpTesting.expectNone(NAME_ASKED);
      expect(nameField(fixture).value).toBe('Anita');
    });

    it('never replaces a name typed while it was asked, and leaves the cursor in the name', async () => {
      const fixture = await render({}, ana);
      const proposed = proposedNames(fixture);
      await type(fixture, nameField(fixture), 'Anita');

      await answer(fixture, 'Ana G.');

      expect(nameField(fixture).value).toBe('Anita');
      expect(proposed).toEqual([]);
      expect(document.activeElement).toBe(nameField(fixture));
    });

    it('leaves the field empty for the organizer who went into it on a phone, the cursor in it', async () => {
      screen.set('(min-width: 650px)', false);
      const fixture = await render({}, ana);
      const proposed = proposedNames(fixture);
      nameField(fixture).focus();

      await answer(fixture, 'Ana G.');

      expect(nameField(fixture).value).toBe('');
      expect(proposed).toEqual([]);
      expect(document.activeElement).toBe(nameField(fixture));
    });

    it('leaves the field empty for the organizer who came back to it after leaving it', async () => {
      const fixture = await render({}, ana);
      titleField(fixture).focus();
      nameField(fixture).focus();

      await answer(fixture, 'Ana G.');

      expect(nameField(fixture).value).toBe('');
      expect(document.activeElement).toBe(nameField(fixture));
    });

    it('fills nothing once the browser has signed out meanwhile', async () => {
      const fixture = await render({}, ana);
      const proposed = proposedNames(fixture);
      const signingOut = TestBed.inject(Session).signOut();
      httpTesting.expectOne('/api/auth/sign-out').flush({ signedOut: true });
      await signingOut;

      await answer(fixture, 'Ana G.');

      expect(nameField(fixture).value).toBe('');
      expect(proposed).toEqual([]);
    });

    it('leaves the cursor where the organizer moved it', async () => {
      const fixture = await render({}, ana);
      next(fixture).focus();

      await answer(fixture, 'Ana G.');

      expect(nameField(fixture).value).toBe('Ana G.');
      expect(document.activeElement).toBe(next(fixture));
    });

    it('moves no cursor on a phone, where none was put in the name', async () => {
      screen.set('(min-width: 650px)', false);
      const fixture = await render({}, ana);

      await answer(fixture, 'Ana G.');

      expect(nameField(fixture).value).toBe('Ana G.');
      expect(document.activeElement).not.toBe(titleField(fixture));
    });

    it('leaves the field empty, saying nothing, when the question gets no answer', async () => {
      const fixture = await render({}, ana);

      httpTesting
        .expectOne(NAME_ASKED)
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      await fixture.whenStable();
      await settle();

      expect(nameField(fixture).value).toBe('');
      expect(document.activeElement).toBe(nameField(fixture));
    });

    it('puts the cursor in the title when the name it holds was proposed, asking nothing', async () => {
      const fixture = await render({ organizerName: 'Ana G.' }, ana, ana.email);

      expect(document.activeElement).toBe(titleField(fixture));
      httpTesting.expectNone(NAME_ASKED);
    });

    it('is asked for the account signed in when the name it holds was proposed for another', async () => {
      const fixture = await render({ organizerName: 'Ana G.', title: 'Cena' }, bea, ana.email);
      const proposed = proposedNames(fixture);
      // The page forgets the name proposed for Ana.
      fixture.componentRef.setInput('details', { organizerName: '', title: 'Cena' });
      fixture.componentRef.setInput('proposedFor', null);
      await fixture.whenStable();

      await answer(fixture, 'Bea R.');

      expect(nameField(fixture).value).toBe('Bea R.');
      expect(proposed).toEqual([{ name: 'Bea R.', email: bea.email }]);
    });

    it('fills nothing for another account while the name proposed for the one before is held', async () => {
      const fixture = await render({ organizerName: 'Ana G.', title: 'Cena' }, bea, ana.email);
      const proposed = proposedNames(fixture);

      await answer(fixture, 'Bea R.');

      expect(nameField(fixture).value).toBe('Ana G.');
      expect(proposed).toEqual([]);
    });

    it('changes nothing once the step has gone', async () => {
      const fixture = await render({}, ana);
      fixture.destroy();

      httpTesting.expectOne(NAME_ASKED).flush({ organizerName: 'Ana G.' });
      await settle();

      expect(fixture.componentInstance.details()).toEqual({ organizerName: '', title: '' });
    });
  });
});
