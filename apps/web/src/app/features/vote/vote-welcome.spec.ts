import { ErrorHandler } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PublicEvent } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { VoteWelcome } from './vote-welcome';
import welcomeStyles from './vote-welcome.scss' with { loader: 'text' };
import { installTestScreen, type TestScreen } from '../../../test/media-queries';

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
  let screen: TestScreen;
  let errors: unknown[];

  beforeEach(() => {
    // jsdom has no layout: the screen width the field's autofocus depends on is the test's choice.
    screen = installTestScreen({ '(min-width: 650px)': true });
    errors = [];
    TestBed.configureTestingModule({
      imports: [VoteWelcome],
      providers: [
        provideI18n(),
        provideRouter([]),
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

  it('says nothing about an earlier vote by default', async () => {
    const fixture = await render(cenaDeVerano);

    expect(element(fixture).querySelector('.notice')).toBeNull();
  });

  it('tells a voter who voted before that the next step shows their answers', async () => {
    const fixture = TestBed.createComponent(VoteWelcome);
    fixture.componentRef.setInput('event', cenaDeVerano);
    fixture.componentRef.setInput('notice', 'alreadyVoted');
    await fixture.whenStable();

    const notice = element(fixture).querySelector('.deadline + .notice');
    expect(notice?.textContent.replace(/\s+/g, ' ').trim()).toBe(
      'Ya has votado. Si quieres cambiar tu voto, verás tus respuestas en el siguiente paso.',
    );
    expect(notice?.querySelector('strong')?.textContent).toBe('Ya has votado.');
    expect(notice?.classList.contains('warn')).toBe(false);
    expect(notice?.getAttribute('role')).toBeNull();
  });

  it('says the options changed in a new alert, heard over the notice shown before', async () => {
    const fixture = TestBed.createComponent(VoteWelcome);
    fixture.componentRef.setInput('event', cenaDeVerano);
    fixture.componentRef.setInput('notice', 'unknownLink');
    await fixture.whenStable();
    const before = element(fixture).querySelector('.notice');

    fixture.componentRef.setInput('notice', 'optionsChanged');
    await fixture.whenStable();

    const alert = element(fixture).querySelector('.notice[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert).not.toBe(before);
  });

  it('warns at once, as the days step does, that the options changed', async () => {
    const fixture = TestBed.createComponent(VoteWelcome);
    fixture.componentRef.setInput('event', cenaDeVerano);
    fixture.componentRef.setInput('notice', 'optionsChanged');
    await fixture.whenStable();

    const notice = element(fixture).querySelector('.deadline + .notice.warn');
    expect(notice?.textContent.replace(/\s+/g, ' ').trim()).toBe(
      'Las opciones han cambiado: vuelve a marcar tus preferencias.',
    );
    expect(notice?.querySelector('strong')?.textContent).toBe('Las opciones han cambiado:');
    expect(notice?.getAttribute('role')).toBe('alert');
  });

  it('warns that the private link holds no vote, and still lets the voter vote', async () => {
    const fixture = TestBed.createComponent(VoteWelcome);
    fixture.componentRef.setInput('event', { ...cenaDeVerano, anonymous: true });
    fixture.componentRef.setInput('notice', 'unknownLink');
    await fixture.whenStable();

    const notice = element(fixture).querySelector('.deadline + .notice.warn');
    expect(notice?.textContent.replace(/\s+/g, ' ').trim()).toBe(
      'No encontramos ningún voto con este enlace. Comprueba que lo has copiado entero, o vota aquí.',
    );
    expect(notice?.getAttribute('role')).toBeNull();
    expect(choices(fixture).map((choice) => choice.disabled)).toEqual([false, false]);
  });

  it('asks the page for the next step when the voter wants to choose', async () => {
    const fixture = await render({ ...cenaDeVerano, anonymous: true });
    let chosen = 0;
    fixture.componentInstance.choose.subscribe(() => (chosen += 1));

    choices(fixture)[1]?.click();

    expect(chosen).toBe(1);
  });

  it('asks the page to send the quick vote when the voter fits in with the majority', async () => {
    const fixture = await render({ ...cenaDeVerano, anonymous: true });
    let quick = 0;
    fixture.componentInstance.quickVote.subscribe(() => (quick += 1));

    choices(fixture)[0]?.click();

    expect(quick).toBe(1);
  });

  it('disables both choices while the quick vote is on its way', async () => {
    const fixture = await render({ ...cenaDeVerano, anonymous: true });

    fixture.componentRef.setInput('sending', true);
    await fixture.whenStable();

    expect(choices(fixture).map((choice) => choice.disabled)).toEqual([true, true]);
  });

  it('says under the choices when the quick vote could not be sent', async () => {
    const fixture = await render({ ...cenaDeVerano, anonymous: true });
    expect(element(fixture).querySelector('[role="alert"]')).toBeNull();

    fixture.componentRef.setInput('quickVoteFailure', { kind: 'failed' });
    await fixture.whenStable();

    const error = element(fixture).querySelector('.choices + .send-error [role="alert"]');
    expect(error?.textContent.trim()).toBe('No se ha podido enviar tu voto. Inténtalo de nuevo.');
    expect(choices(fixture).map((choice) => choice.disabled)).toEqual([false, false]);
  });

  it('holds both choices while the API limits the requests, saying for how long', async () => {
    const fixture = await render({ ...cenaDeVerano, anonymous: true });

    fixture.componentRef.setInput('quickVoteFailure', { kind: 'limited', seconds: 42 });
    await fixture.whenStable();

    expect(element(fixture).querySelector('.choices + .send-error')?.textContent).toContain(
      'Podrás enviar tu voto en 42 s.',
    );
    expect(choices(fixture).map((choice) => choice.disabled)).toEqual([true, true]);

    fixture.componentRef.setInput('quickVoteFailure', { kind: 'limited', seconds: 0 });
    await fixture.whenStable();

    expect(element(fixture).querySelector('.send-error')?.textContent.trim()).toBe('');
    expect(choices(fixture).map((choice) => choice.disabled)).toEqual([false, false]);
  });

  it('offers "Privacidad y condiciones" under the choices, before any vote is sent', async () => {
    const fixture = await render(cenaDeVerano);

    // After the choices and the line that says a quick vote failed, never between them.
    const privacy = element(fixture).querySelector('.choices + .send-error + .privacy');
    expect(privacy?.querySelector('app-privacy-link a')?.textContent.trim()).toBe(
      'Privacidad y condiciones',
    );
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

    it('stops the name at thirty characters as the voter sees them, so it never blocks the choices', async () => {
      const fixture = await render(cenaDeVerano);
      // Thirty characters, the "é" written as "e" plus a combining accent: 31 UTF-16 units.
      const thirty = 'Jose\u0301 Maria de los Angeles Vera';

      await typeName(fixture, thirty);
      expect(nameField(fixture)?.value).toBe(thirty);
      expect(choices(fixture).every((button) => !button.disabled)).toBe(true);

      await typeName(fixture, `${thirty}x`);
      expect(nameField(fixture)?.value).toBe(thirty);
      expect(fixture.componentInstance.name()).toBe(thirty);
      expect(choices(fixture).every((button) => !button.disabled)).toBe(true);
    });

    it('still checks a longer name the page holds', async () => {
      const fixture = await render(cenaDeVerano);

      fixture.componentInstance.name.set('a'.repeat(31));
      await fixture.whenStable();

      expect(nameField(fixture)?.value).toBe('a'.repeat(31));
      expect(choices(fixture).every((button) => button.disabled)).toBe(true);
    });

    it('shows the name the page holds, so it is kept when the voter comes back to step 1', async () => {
      const fixture = await render(cenaDeVerano);

      fixture.componentInstance.name.set('Luis');
      await fixture.whenStable();

      expect(nameField(fixture)?.value).toBe('Luis');
      expect(choices(fixture).every((button) => !button.disabled)).toBe(true);
    });

    it('draws the name the same from the first character, valid or not', async () => {
      const fixture = await render(cenaDeVerano);
      const look = (): string => nameField(fixture)?.className ?? '';
      const empty = look();

      await typeName(fixture, 'L');
      expect(look()).toBe(empty);

      await typeName(fixture, 'Luis');
      expect(look()).toBe(empty);
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
      screen.set('(min-width: 650px)', false);
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
