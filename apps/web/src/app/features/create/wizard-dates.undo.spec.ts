import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DateInterpretation } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { installTestScreen } from '../../../test/media-queries';
import { Toast, Toaster } from '../../shared/ui/toast';
import { type DateSelection, NO_DATES } from './date-selection';
import { WizardDates } from './wizard-dates';

/** The dates a phrase takes the place of can be put back, from the message that says so. */
describe('WizardDates: undoing what a phrase replaced', () => {
  const READINGS = '/api/date-interpretations';
  const june = (number: number): string => `2026-06-${String(number).padStart(2, '0')}`;
  /** A date with its times, a range and a saved range in June, with times asked for. */
  const THREE: DateSelection = {
    singles: [june(20)],
    ranges: [{ start: june(22), end: june(23) }],
    saved: [{ start: june(24), end: june(26) }],
    times: { [june(20)]: { marked: [{ kind: 'single', at: '10:00' }], saved: [] } },
    timed: true,
  };

  let fixture: ComponentFixture<WizardDates>;
  /** The place of the app's messages, which the app's shell has. */
  let toast: ComponentFixture<Toast>;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    // Monday 15 June 2026.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 15, 12));
    installTestScreen();
    TestBed.configureTestingModule({
      imports: [WizardDates, Toast],
      providers: [provideI18n(), provideHttpClient(), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    toast = TestBed.createComponent(Toast);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.useRealTimers();
  });

  async function render(selection: DateSelection, month = '2026-06'): Promise<void> {
    fixture = TestBed.createComponent(WizardDates);
    fixture.componentRef.setInput('month', month);
    fixture.componentRef.setInput('selection', selection);
    fixture.componentRef.setInput('phrase', '');
    await fixture.whenStable();
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function day(number: number): HTMLButtonElement {
    const button = [...element().querySelectorAll<HTMLButtonElement>('button.day')].find(
      (each) => each.textContent.trim() === String(number),
    );
    if (!button) throw new Error(`No day ${String(number)}`);
    return button;
  }

  function button(name: string): HTMLButtonElement {
    const found = element().querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
    if (!found) throw new Error(`No button "${name}"`);
    return found;
  }

  function asker(): HTMLInputElement {
    const found = element().querySelector<HTMLInputElement>(
      'input[role="switch"][aria-label="Generar fechas con IA"]',
    );
    if (!found) throw new Error('No switch of the smart calendar');
    return found;
  }

  async function click(target: HTMLElement): Promise<void> {
    target.click();
    await fixture.whenStable();
    await toast.whenStable();
  }

  /** The reading of a phrase that gives these days, each a date of its own. */
  function days(...dates: string[]): DateInterpretation {
    return {
      options: dates.map((date) => ({ dates: { kind: 'single', date }, time: null })),
      questions: [],
      notices: [],
    };
  }

  /** The box is opened, a phrase written and sent, and the API answers with this reading. */
  async function ask(reading: DateInterpretation): Promise<void> {
    if (!asker().checked) await click(asker());
    const field = element().querySelector<HTMLTextAreaElement>('app-phrase-box textarea');
    if (!field) throw new Error('No text box');
    field.value = 'una frase';
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    await click(button('Generar fechas'));
    httpTesting.expectOne(READINGS).flush(reading);
    // The box takes the answer of the API, which no step of Angular's waits for.
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    await toast.whenStable();
  }

  /** The words of the message at the bottom of the screen; `null` without one. */
  function said(): string | null {
    const shell = toast.nativeElement as HTMLElement;
    return shell.querySelector('.toast .words')?.textContent.trim() ?? null;
  }

  /** The button of the message at the bottom of the screen. */
  function undo(): HTMLButtonElement {
    const shell = toast.nativeElement as HTMLElement;
    const found = shell.querySelector<HTMLButtonElement>('.toast button');
    if (!found) throw new Error('Nothing to undo');
    return found;
  }

  function selection(): DateSelection {
    return fixture.componentInstance.selection();
  }

  function told(): number {
    return element().querySelectorAll('.told app-notice-box p').length;
  }

  function focusedDay(): string {
    const focused = document.activeElement;
    return focused?.classList.contains('day') ? (focused.getAttribute('aria-label') ?? '') : '';
  }

  describe('the message', () => {
    it('says how many were replaced, each date, range and saved range as one, with "Deshacer"', async () => {
      await render(THREE);

      await ask(days(june(29)));

      expect(said()).toBe('Hemos sustituido las 3 fechas que tenías marcadas.');
      expect(undo().textContent.trim()).toBe('Deshacer');
    });

    it('counts two as several', async () => {
      await render({ ...NO_DATES, singles: [june(20)], saved: THREE.saved });

      await ask(days(june(29)));

      expect(said()).toBe('Hemos sustituido las 2 fechas que tenías marcadas.');
    });

    it('speaks of one date when one was replaced, a range of days too', async () => {
      await render({ ...NO_DATES, ranges: [{ start: june(22), end: june(26) }] });

      await ask(days(june(29)));

      expect(said()).toBe('Hemos sustituido la fecha que tenías marcada.');
      expect(undo().textContent.trim()).toBe('Deshacer');
    });

    it('is not said when nothing was chosen before, times asked for or not', async () => {
      await render({ ...NO_DATES, timed: true });

      await ask(days(june(29)));

      expect(selection().singles).toEqual([june(29)]);
      expect(said()).toBeNull();
    });
  });

  describe('"Deshacer"', () => {
    it('puts back the dates, their times, the ranges and the saved ranges as they were', async () => {
      await render(THREE);
      await ask(days(june(29)));
      expect(selection()).not.toEqual(THREE);

      await click(undo());

      expect(selection()).toEqual(THREE);
      expect(said()).toBeNull();
    });

    it('puts the calendar back on the month it was on, with the focus', async () => {
      await render(THREE, '2026-08');
      await ask(days('2026-07-06'));
      expect(fixture.componentInstance.month()).toBe('2026-07');

      await click(undo());

      expect(fixture.componentInstance.month()).toBe('2026-08');
      expect(focusedDay()).toBe('sábado, 1 de agosto');
    });

    it('takes away what the phrase told about its dates', async () => {
      await render(THREE);
      await ask({ ...days(june(29)), notices: [{ kind: 'unclear' }] });
      expect(told()).toBe(1);

      await click(undo());

      expect(told()).toBe(0);
    });

    it('closes the box if it was opened again, so that the dates put back are seen', async () => {
      await render(THREE);
      await ask(days(june(29)));
      await click(asker());
      expect(asker().checked).toBe(true);

      await click(undo());

      expect(asker().checked).toBe(false);
      expect(element().querySelector('.calendar')?.hasAttribute('inert')).toBe(false);
      expect(focusedDay()).toBe('lunes, 15 de junio');
    });

    it('lets go of a day held meanwhile', async () => {
      await render(THREE);
      await ask(days(june(29)));
      day(17).focus();
      day(17).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
      );
      await fixture.whenStable();
      expect(element().querySelector('.waits')?.textContent.trim()).not.toBe('');

      await click(undo());

      expect(element().querySelector('.waits')?.textContent.trim()).toBe('');
    });

    it('does not bring back a date that is past by then', async () => {
      await render({ ...NO_DATES, singles: [june(15), june(20)] });
      await ask(days(june(29)));

      vi.setSystemTime(new Date(2026, 5, 16, 0, 5));
      await click(undo());

      expect(selection().singles).toEqual([june(20)]);
    });

    it('goes back one phrase only: after two, to what the first one left', async () => {
      await render(THREE);
      await ask(days(june(29)));
      const first = selection();

      await ask(days(june(30)));
      expect(said()).toBe('Hemos sustituido la fecha que tenías marcada.');

      await click(undo());
      expect(selection()).toEqual(first);
      expect(said()).toBeNull();
    });
  });

  describe('the message goes', () => {
    it('when a day is pressed: the dates are no longer those of the phrase', async () => {
      await render(THREE);
      await ask(days(june(29)));

      await click(day(17));

      expect(said()).toBeNull();
      expect(selection().singles).toEqual([june(17), june(29)]);
    });

    it('when times are asked for or not with "Horario"', async () => {
      await render(THREE);
      await ask(days(june(29)));

      const times = [...element().querySelectorAll<HTMLInputElement>('input[role="switch"]')].find(
        (each) => each !== asker(),
      );
      if (!times) throw new Error('No "Horario" switch');
      await click(times);

      expect(said()).toBeNull();
    });

    it('when the step is left', async () => {
      await render(THREE);
      await ask(days(june(29)));

      fixture.destroy();
      await toast.whenStable();

      expect(said()).toBeNull();
    });

    it('but not when the month is changed or the box opened: the dates are the same', async () => {
      await render(THREE);
      await ask(days(june(29)));

      button('Mes siguiente').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      button('Mes siguiente').dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
      await fixture.whenStable();
      expect(fixture.componentInstance.month()).toBe('2026-07');
      await click(asker());

      expect(said()).toBe('Hemos sustituido las 3 fechas que tenías marcadas.');
    });

    it('and leaves alone a message that took its place', async () => {
      await render(THREE);
      await ask(days(june(29)));
      TestBed.inject(Toaster).show('Enlace copiado');

      await click(day(17));

      expect(said()).toBe('Enlace copiado');
    });
  });
});
