import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ErrorHandler } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { SignedInAccount } from '@qando/contracts';
import { Session } from '../../core/auth/session';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { OrganizerNameField, type ProposedName } from './organizer-name-field';
import fieldStyles from './organizer-name-field.scss' with { loader: 'text' };

const ana: SignedInAccount = { name: 'Ana', email: 'ana@example.com' };
const bea: SignedInAccount = { name: 'Bea', email: 'bea@example.com' };

/** Where the field asks the name of the account's last event. */
const NAME_ASKED = '/api/me/organizer-name';

/** Lets the answers given and the work they started end. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('OrganizerNameField', () => {
  let errors: unknown[];
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    errors = [];
    TestBed.configureTestingModule({
      imports: [OrganizerNameField],
      providers: [
        provideI18n(),
        provideHttpClient(),
        provideHttpClientTesting(),
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

  /** The field holding `name`, on a browser signed in as `account`, or none. */
  async function render(
    name = '',
    account: SignedInAccount | null = null,
  ): Promise<ComponentFixture<OrganizerNameField>> {
    TestBed.inject(Session);
    httpTesting.expectOne('/api/auth/session').flush(account);
    await settle();
    const fixture = TestBed.createComponent(OrganizerNameField);
    fixture.componentRef.setInput('name', name);
    await fixture.whenStable();
    await settle();
    return fixture;
  }

  function element(fixture: ComponentFixture<OrganizerNameField>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function input(fixture: ComponentFixture<OrganizerNameField>): HTMLInputElement {
    const field = element(fixture).querySelector('input');
    if (!field) throw new Error('No field');
    return field;
  }

  async function type(fixture: ComponentFixture<OrganizerNameField>, value: string): Promise<void> {
    input(fixture).value = value;
    input(fixture).dispatchEvent(new InputEvent('input'));
    await fixture.whenStable();
  }

  /** What is said under the field, as a screen reader hears it with the field. */
  function said(fixture: ComponentFixture<OrganizerNameField>): string | null {
    const id = input(fixture).getAttribute('aria-describedby');
    return id === null
      ? null
      : (element(fixture).querySelector(`#${id}`)?.textContent.trim() ?? '');
  }

  async function refuse(fixture: ComponentFixture<OrganizerNameField>): Promise<void> {
    fixture.componentRef.setInput('refused', true);
    await fixture.whenStable();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(fieldStyles)).toEqual([]);
  });

  it('asks the name with its label, offering the one the browser knows, without an example', async () => {
    const fixture = await render();

    expect(element(fixture).querySelectorAll('input')).toHaveLength(1);
    expect(
      element(fixture)
        .querySelector(`label[for="${input(fixture).id}"]`)
        ?.textContent.trim(),
    ).toBe('Tu nombre, para comunicárselo a los demás.');
    expect(input(fixture).autocomplete).toBe('name');
    expect(input(fixture).hasAttribute('placeholder')).toBe(false);
  });

  it('stops at 30 characters as people see them', async () => {
    const fixture = await render();
    // A family emoji is 11 code units: the browser's maxlength would have cut it, or refused it.
    const name = `${'a'.repeat(29)}👨‍👩‍👧‍👦`;

    await type(fixture, `${name}x`);

    expect(input(fixture).maxLength).toBe(-1);
    expect(input(fixture).value).toBe(name);
    expect(fixture.componentInstance.name()).toBe(name);
  });

  it('shows the name it holds, and gives what is typed as typed', async () => {
    const fixture = await render('Ana');
    expect(input(fixture).value).toBe('Ana');

    await type(fixture, ' Anita ');

    expect(fixture.componentInstance.name()).toBe(' Anita ');
  });

  it('marks a name with no check, and says nothing under it until it is refused', async () => {
    const fixture = await render('Ana');

    expect(element(fixture).querySelector('svg, .check')).toBeNull();
    expect(said(fixture)).toBeNull();
    expect(input(fixture).hasAttribute('aria-invalid')).toBe(false);
  });

  describe('refused', () => {
    it('says under it, in red, that the name is to be written', async () => {
      const fixture = await render();

      await refuse(fixture);

      expect(said(fixture)).toBe('Escribe tu nombre.');
      expect(input(fixture).getAttribute('aria-invalid')).toBe('true');
      const line = element(fixture).querySelector('.error');
      expect(line?.textContent.trim()).toBe('Escribe tu nombre.');
      expect(line?.getAttribute('role')).toBe('alert');
    });

    it('says a name of one letter is too short', async () => {
      const fixture = await render(' A ');

      await refuse(fixture);

      expect(said(fixture)).toBe('Tu nombre necesita al menos 2 letras.');
    });

    it('says it no more once the organizer types, and tells the holder', async () => {
      const fixture = await render();
      await refuse(fixture);

      await type(fixture, 'A');

      expect(fixture.componentInstance.refused()).toBe(false);
      expect(said(fixture)).toBeNull();
      expect(input(fixture).hasAttribute('aria-invalid')).toBe(false);
    });
  });

  it('takes the cursor when asked to', async () => {
    const fixture = await render();

    fixture.componentInstance.focus();

    expect(document.activeElement).toBe(input(fixture));
  });

  describe('the name of the account’s last event', () => {
    /** Answers the field's question with the name of the account's last event, or none. */
    async function answer(
      fixture: ComponentFixture<OrganizerNameField>,
      organizerName: string | null,
    ): Promise<void> {
      httpTesting.expectOne(NAME_ASKED).flush({ organizerName });
      await settle();
      await fixture.whenStable();
    }

    /** The names the field told its holder it proposed, each with the account's email. */
    function proposedNames(fixture: ComponentFixture<OrganizerNameField>): ProposedName[] {
      const names: ProposedName[] = [];
      fixture.componentInstance.proposed.subscribe((name) => names.push(name));
      return names;
    }

    async function signInAs(account: SignedInAccount | null): Promise<void> {
      const asking = TestBed.inject(Session).refresh();
      httpTesting.expectOne('/api/auth/session').flush(account);
      await asking;
      await settle();
    }

    it('fills the empty field with it and tells the holder, leaving the cursor where it was', async () => {
      const fixture = await render('', ana);
      const proposed = proposedNames(fixture);

      await answer(fixture, 'Ana G.');

      expect(input(fixture).value).toBe('Ana G.');
      expect(fixture.componentInstance.name()).toBe('Ana G.');
      expect(proposed).toEqual([{ name: 'Ana G.', email: ana.email }]);
      expect(document.activeElement).not.toBe(input(fixture));
    });

    it('leaves the field empty for an account without events', async () => {
      const fixture = await render('', ana);
      const proposed = proposedNames(fixture);

      await answer(fixture, null);

      expect(input(fixture).value).toBe('');
      expect(proposed).toEqual([]);
    });

    it('is not asked without a session', async () => {
      await render('', null);

      httpTesting.expectNone(NAME_ASKED);
    });

    it('is not asked when the field holds a name, the one typed before', async () => {
      const fixture = await render('Anita', ana);

      httpTesting.expectNone(NAME_ASKED);
      expect(input(fixture).value).toBe('Anita');
    });

    it('never replaces a name typed while it was asked', async () => {
      const fixture = await render('', ana);
      const proposed = proposedNames(fixture);
      await type(fixture, 'Anita');

      await answer(fixture, 'Ana G.');

      expect(input(fixture).value).toBe('Anita');
      expect(proposed).toEqual([]);
    });

    it('leaves the field empty for the organizer who went into it to type', async () => {
      const fixture = await render('', ana);
      const proposed = proposedNames(fixture);
      input(fixture).focus();

      await answer(fixture, 'Ana G.');

      expect(input(fixture).value).toBe('');
      expect(proposed).toEqual([]);
      expect(document.activeElement).toBe(input(fixture));
    });

    it('leaves the field empty, saying nothing, when the question gets no answer', async () => {
      const fixture = await render('', ana);

      httpTesting.expectOne(NAME_ASKED).flush(null, { status: 503, statusText: 'Unavailable' });
      await settle();
      await fixture.whenStable();

      expect(input(fixture).value).toBe('');
      expect(said(fixture)).toBeNull();
    });

    it('is asked once for an account: a name proposed and erased stays erased', async () => {
      const fixture = await render('', ana);
      await answer(fixture, 'Ana G.');

      await type(fixture, '');
      input(fixture).blur();
      await settle();
      await fixture.whenStable();

      httpTesting.expectNone(NAME_ASKED);
      expect(input(fixture).value).toBe('');
    });

    it('fills nothing once the browser has signed out meanwhile', async () => {
      const fixture = await render('', ana);
      const proposed = proposedNames(fixture);
      await signInAs(null);

      await answer(fixture, 'Ana G.');

      expect(input(fixture).value).toBe('');
      expect(proposed).toEqual([]);
    });

    it('fills the name of the account signed in meanwhile, never the one before’s', async () => {
      const fixture = await render('', ana);
      const proposed = proposedNames(fixture);
      await signInAs(bea);
      const [forAna, forBea] = httpTesting.match(NAME_ASKED);

      forAna?.flush({ organizerName: 'Ana G.' });
      await settle();
      await fixture.whenStable();
      expect(input(fixture).value).toBe('');

      forBea?.flush({ organizerName: 'Bea R.' });
      await settle();
      await fixture.whenStable();
      expect(input(fixture).value).toBe('Bea R.');
      expect(proposed).toEqual([{ name: 'Bea R.', email: bea.email }]);
    });

    it('is asked for the account signed in once the name another’s proposed is taken away', async () => {
      // The holder empties a name proposed for an account that is no longer the one signed in.
      const fixture = await render('Ana G.', bea);
      httpTesting.expectNone(NAME_ASKED);

      fixture.componentRef.setInput('name', '');
      await fixture.whenStable();
      await answer(fixture, 'Bea R.');

      expect(input(fixture).value).toBe('Bea R.');
    });

    it('changes nothing once the field has gone', async () => {
      const fixture = await render('', ana);
      const proposed = proposedNames(fixture);
      fixture.destroy();

      httpTesting.expectOne(NAME_ASKED).flush({ organizerName: 'Ana G.' });
      await settle();

      expect(fixture.componentInstance.name()).toBe('');
      expect(proposed).toEqual([]);
    });
  });
});
