import { ErrorHandler } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { PublicEvent } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { VoteWelcome } from './vote-welcome';
import welcomeStyles from './vote-welcome.scss' with { loader: 'text' };

const cenaDeVerano: PublicEvent = {
  title: 'Cena de verano',
  organizerName: 'pietro',
  note: 'Traed algo de picar.',
  deadline: '2026-07-01',
  timeZone: 'Europe/Madrid',
  anonymous: false,
  state: 'open',
  options: [
    {
      id: '6f1c2a0e-0000-4000-8000-000000000001',
      dates: { kind: 'single', date: '2026-07-06' },
      time: null,
    },
  ],
  confirmedOption: null,
};

const withTimes: PublicEvent = {
  ...cenaDeVerano,
  options: [
    ...cenaDeVerano.options,
    {
      id: '6f1c2a0e-0000-4000-8000-000000000002',
      dates: { kind: 'single', date: '2026-07-10' },
      time: { kind: 'single', at: '21:00' },
    },
  ],
};

describe('VoteWelcome', () => {
  let wideScreen: boolean;
  let errors: unknown[];

  beforeEach(() => {
    wideScreen = true;
    // jsdom has no layout: the screen width the field's autofocus depends on is the test's choice.
    window.matchMedia = (query: string) =>
      ({ matches: query === '(min-width: 650px)' && wideScreen, media: query }) as MediaQueryList;
    errors = [];
    TestBed.configureTestingModule({
      imports: [VoteWelcome],
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

  async function render(event: PublicEvent): Promise<ComponentFixture<VoteWelcome>> {
    const fixture = TestBed.createComponent(VoteWelcome);
    fixture.componentRef.setInput('event', event);
    await fixture.whenStable();
    return fixture;
  }

  function element(fixture: ComponentFixture<VoteWelcome>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(fixture: ComponentFixture<VoteWelcome>): string {
    return element(fixture).textContent.replace(/\s+/g, ' ').trim();
  }

  function nameField(fixture: ComponentFixture<VoteWelcome>): HTMLInputElement | null {
    return element(fixture).querySelector('input');
  }

  async function typeName(fixture: ComponentFixture<VoteWelcome>, name: string): Promise<void> {
    const field = nameField(fixture);
    if (!field) throw new Error('No name field');
    field.value = name;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  function choices(fixture: ComponentFixture<VoteWelcome>): HTMLButtonElement[] {
    return Array.from(element(fixture).querySelectorAll('button'));
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(welcomeStyles)).toEqual([]);
  });

  it('shows the title as the page heading', async () => {
    const fixture = await render(cenaDeVerano);

    expect(element(fixture).querySelector('h1')?.textContent.trim()).toBe('Cena de verano');
  });

  it('labels the card as step 1', async () => {
    const fixture = await render(cenaDeVerano);

    expect(text(fixture)).toContain('paso 1');
  });

  it('says the organizer proposed dates, with the name capitalised and in bold', async () => {
    const fixture = await render(cenaDeVerano);

    expect(text(fixture)).toContain('Pietro ha propuesto unas fechas.');
    expect(element(fixture).querySelector('strong')?.textContent).toBe('Pietro');
  });

  it('says the organizer proposed dates and times when an option has a time', async () => {
    const fixture = await render(withTimes);

    expect(text(fixture)).toContain('Pietro ha propuesto unas fechas y horarios.');
  });

  it('shows the organizer name as text, never as markup', async () => {
    const fixture = await render({ ...cenaDeVerano, organizerName: '<i>ana</i>' });

    expect(element(fixture).querySelector('strong')?.textContent).toBe('<i>ana</i>');
    expect(element(fixture).querySelector('strong i')).toBeNull();
  });

  it('quotes the note after "Y dice…"', async () => {
    const fixture = await render(cenaDeVerano);

    expect(text(fixture)).toContain('Y dice…—Traed algo de picar.');
  });

  it('leaves out "Y dice…" when there is no note', async () => {
    const fixture = await render({ ...cenaDeVerano, note: null });

    expect(text(fixture)).not.toContain('Y dice');
  });

  it('gives the deadline as a long date in bold', async () => {
    const fixture = await render(cenaDeVerano);

    expect(text(fixture)).toContain(
      'Tienes hasta el 1 de julio de 2026 para decidir junto a los demás.',
    );
    expect(Array.from(element(fixture).querySelectorAll('strong'), (b) => b.textContent)).toContain(
      '1 de julio de 2026',
    );
  });

  describe('on a named event', () => {
    it('asks for the name in a labelled field', async () => {
      const fixture = await render(cenaDeVerano);

      const field = nameField(fixture);
      expect(field?.labels?.[0]?.textContent.trim()).toBe('Escribe tu nombre para votar');
      expect(field?.autocomplete).toBe('name');
      // The browser's maxlength counts UTF-16 units: it would cut names the rule accepts.
      expect(field?.hasAttribute('maxlength')).toBe(false);
    });

    it('offers both choices, disabled until the name has two characters', async () => {
      const fixture = await render(cenaDeVerano);
      expect(choices(fixture).map((button) => button.textContent.trim())).toEqual([
        'Me adapto a lo que elija la mayoría…',
        'Quiero elegir mis preferencias…',
      ]);
      expect(choices(fixture).every((button) => button.disabled)).toBe(true);

      await typeName(fixture, '  A  ');
      expect(choices(fixture).every((button) => button.disabled)).toBe(true);

      await typeName(fixture, 'Li');
      expect(choices(fixture).every((button) => !button.disabled)).toBe(true);

      await typeName(fixture, 'L');
      expect(choices(fixture).every((button) => button.disabled)).toBe(true);
    });

    it('counts the name in characters as the voter sees them, up to thirty', async () => {
      const fixture = await render(cenaDeVerano);
      // Thirty characters, the "é" written as "e" plus a combining accent: 31 UTF-16 units.
      const thirty = 'Jose\u0301 Maria de los Angeles Vera';

      await typeName(fixture, thirty);
      expect(choices(fixture).every((button) => !button.disabled)).toBe(true);

      await typeName(fixture, `${thirty}x`);
      expect(choices(fixture).every((button) => button.disabled)).toBe(true);
    });

    it('shares the typed name with the page', async () => {
      const fixture = await render(cenaDeVerano);

      await typeName(fixture, 'Luis');

      expect(fixture.componentInstance.name()).toBe('Luis');
    });

    it('puts the cursor in the field from 650 px', async () => {
      const fixture = await render(cenaDeVerano);

      expect(document.activeElement).toBe(nameField(fixture));
    });

    it('leaves the cursor out on a phone, where the keyboard would cover the note', async () => {
      wideScreen = false;
      const fixture = await render(cenaDeVerano);

      expect(document.activeElement).not.toBe(nameField(fixture));
    });
  });

  describe('on an anonymous event', () => {
    it('does not ask for a name and says the vote is anonymous', async () => {
      const fixture = await render({ ...cenaDeVerano, anonymous: true });

      expect(nameField(fixture)).toBeNull();
      expect(text(fixture)).toContain(
        'Votación anónima: no se te pedirá el nombre y tu voto no lo llevará.',
      );
    });

    it('has no field to put the cursor in, even from 650 px', async () => {
      await render({ ...cenaDeVerano, anonymous: true });

      expect(document.activeElement).toBe(document.body);
      expect(errors).toEqual([]);
    });

    it('enables both choices at once', async () => {
      const fixture = await render({ ...cenaDeVerano, anonymous: true });

      expect(choices(fixture)).toHaveLength(2);
      expect(choices(fixture).every((button) => !button.disabled)).toBe(true);
    });
  });
});
