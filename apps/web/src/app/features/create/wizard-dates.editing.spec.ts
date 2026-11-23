import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { installTestScreen } from '../../../test/media-queries';
import type { StepFinish } from '../../shared/ui/step-pager';
import { type DateSelection, NO_DATES } from './date-selection';
import type { NoticeLine } from './notice-box';
import { WizardDates } from './wizard-dates';

const ARROW_LEFT = 'M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18';
const ARROW_RIGHT = 'M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3';
const CHECK = 'm4.5 12.75 6 6 9-13.5';
const READINGS = '/api/date-interpretations';

/** The step as a page that edits an event's options holds it: in the event's zone, as the last. */
@Component({
  imports: [WizardDates],
  template: `<app-wizard-dates
    [(selection)]="selection"
    [(month)]="month"
    [(phrase)]="phrase"
    [(notices)]="notices"
    [timeZone]="timeZone()"
    [backArrow]="backArrow()"
    [finish]="finish()"
    (back)="went.push('back')"
    (next)="went.push('next')"
    ><p class="below">Volver sin guardar</p></app-wizard-dates
  >`,
})
class Host {
  readonly selection = signal<DateSelection>(NO_DATES);
  readonly month = signal('2026-06');
  readonly phrase = signal('');
  readonly notices = signal<readonly NoticeLine[]>([]);
  readonly timeZone = signal<string | undefined>(undefined);
  readonly backArrow = signal(true);
  readonly finish = signal<StepFinish | null>(null);
  readonly went: string[] = [];
}

describe('WizardDates, as the last step in the zone of an event', () => {
  let fixture: ComponentFixture<Host>;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T09:30:00Z'));
    installTestScreen();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideI18n(), provideHttpClient(), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.useRealTimers();
  });

  async function render(set: (host: Host) => void = () => undefined): Promise<Host> {
    fixture = TestBed.createComponent(Host);
    set(fixture.componentInstance);
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function day(number: number): HTMLButtonElement {
    const found = [...element().querySelectorAll<HTMLButtonElement>('button.day')].find(
      (each) => each.textContent.trim() === String(number),
    );
    if (!found) throw new Error(`No day ${String(number)}`);
    return found;
  }

  function arrows(): HTMLButtonElement[] {
    return [...element().querySelectorAll<HTMLButtonElement>('.nav button')];
  }

  function labels(): (string | null)[] {
    return arrows().map((each) => each.getAttribute('aria-label'));
  }

  function icons(): (string | null)[] {
    return arrows().map((each) => each.querySelector('path')?.getAttribute('d') ?? null);
  }

  /** The arrow that goes on: the last one under the calendar. */
  function forward(): HTMLButtonElement {
    const found = arrows().at(-1);
    if (!found) throw new Error('No arrow that goes on');
    return found;
  }

  async function click(target: HTMLElement): Promise<void> {
    target.click();
    await fixture.whenStable();
  }

  /** What is told above the calendar, each of its lines. */
  function told(): string[] {
    return [...element().querySelectorAll('.told app-notice-box p')].map((each) =>
      each.textContent.replace(/\s+/g, ' ').trim(),
    );
  }

  const june = (day: number): string => `2026-06-${String(day).padStart(2, '0')}`;
  const singles = (...days: number[]): DateSelection => ({ ...NO_DATES, singles: days.map(june) });

  describe('today', () => {
    it("is the event zone's: in Kiritimati it is already 16 June", async () => {
      vi.setSystemTime(new Date('2026-06-15T10:30:00Z'));
      await render((host) => {
        host.timeZone.set('Pacific/Kiritimati');
      });

      expect(day(15).disabled).toBe(true);
      expect(day(16).disabled).toBe(false);
    });

    it("is the event zone's: in Pago Pago it is still 14 June", async () => {
      vi.setSystemTime(new Date('2026-06-15T05:00:00Z'));
      await render((host) => {
        host.timeZone.set('Pacific/Pago_Pago');
      });

      expect(day(13).disabled).toBe(true);
      expect(day(14).disabled).toBe(false);
    });

    it("is read again in the event's zone on a press, after midnight there", async () => {
      const host = await render((each) => {
        each.timeZone.set('Pacific/Kiritimati');
      });
      expect(day(15).disabled).toBe(false);

      // 00:30 on 16 June in Kiritimati.
      vi.setSystemTime(new Date('2026-06-15T10:30:00Z'));
      await click(day(15));

      expect(host.selection()).toEqual(NO_DATES);
      expect(day(15).disabled).toBe(true);
    });
  });

  describe('the smart calendar', () => {
    async function generate(phrase: string): Promise<void> {
      const asker = element().querySelector<HTMLInputElement>(
        'input[role="switch"][aria-label="Generar fechas con IA"]',
      );
      if (!asker) throw new Error('No switch of the smart calendar');
      await click(asker);
      const box = element().querySelector<HTMLTextAreaElement>('app-phrase-box textarea');
      if (!box) throw new Error('No text box');
      box.value = phrase;
      box.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      await click(forward());
    }

    function zoneAsked(): string {
      const [request] = httpTesting.match(READINGS);
      if (!request) throw new Error('No phrase sent');
      return (request.request.body as { timeZone: string }).timeZone;
    }

    it("has a phrase read in the event's zone", async () => {
      await render((host) => {
        host.timeZone.set('Pacific/Kiritimati');
      });

      await generate('el próximo viernes');

      expect(zoneAsked()).toBe('Pacific/Kiritimati');
    });

    it("has a phrase read in the person's own zone without one", async () => {
      await render();

      await generate('el próximo viernes');

      expect(zoneAsked()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    });
  });

  describe('the notices it is given', () => {
    const dropped: NoticeLine = {
      lead: 'sábado 13 de junio',
      text: 'ya ha pasado; lo hemos quitado.',
    };

    it('are told above the calendar, one line each', async () => {
      await render((host) => {
        host.notices.set([dropped, { ...dropped, lead: 'domingo 14 de junio' }]);
      });

      expect(told()).toEqual([
        'sábado 13 de junio: ya ha pasado; lo hemos quitado.',
        'domingo 14 de junio: ya ha pasado; lo hemos quitado.',
      ]);
    });

    it('are gone with their cross, for whoever holds them too', async () => {
      const host = await render((each) => {
        each.notices.set([dropped]);
      });

      const cross = element().querySelector<HTMLButtonElement>('.told app-notice-box button');
      if (!cross) throw new Error('No cross');
      await click(cross);

      expect(told()).toEqual([]);
      expect(host.notices()).toEqual([]);
    });
  });

  describe('without its arrow back', () => {
    it('has only the arrow that goes on', async () => {
      await render((host) => {
        host.backArrow.set(false);
      });

      expect(labels()).toEqual(['Siguiente']);
      expect(icons()).toEqual([ARROW_RIGHT]);
    });
  });

  describe('as the last step', () => {
    const saving: StepFinish = { label: 'Guardar opciones', busy: false };

    it('ends with a tick named as asked, which goes on', async () => {
      await render((host) => {
        host.selection.set(singles(16));
        host.finish.set(saving);
      });

      expect(labels()).toEqual(['Volver al paso 1', 'Guardar opciones']);
      expect(icons()).toEqual([ARROW_LEFT, CHECK]);

      await click(forward());

      expect(fixture.componentInstance.went).toEqual(['next']);
    });

    it('saves nothing without dates, and says why', async () => {
      await render((host) => {
        host.finish.set(saving);
      });

      await click(forward());

      expect(forward().getAttribute('aria-disabled')).toBe('true');
      expect(forward().getAttribute('aria-describedby')).toBe('dates-missing');
      expect(fixture.componentInstance.went).toEqual([]);
    });

    it('shows a spinner in place of the tick while busy, and a press sends nothing more', async () => {
      await render((host) => {
        host.selection.set(singles(16));
        host.finish.set({ ...saving, busy: true });
      });

      expect(forward().getAttribute('aria-label')).toBe('Guardar opciones');
      expect(forward().querySelector('svg')).toBeNull();
      expect(forward().querySelector('.spinner')?.getAttribute('aria-hidden')).toBe('true');
      expect(arrows()[0]?.disabled).toBe(true);

      await click(forward());

      expect(fixture.componentInstance.went).toEqual([]);
    });

    it('goes on again once it is no longer busy', async () => {
      const host = await render((each) => {
        each.selection.set(singles(16));
        each.finish.set({ ...saving, busy: true });
      });
      host.finish.set(saving);
      await fixture.whenStable();

      await click(forward());

      expect(host.went).toEqual(['next']);
      expect(arrows()[0]?.disabled).toBe(false);
    });
  });

  it('shows what it holds under its arrows', async () => {
    await render();

    expect(element().querySelector('.nav ~ p.below')?.textContent).toBe('Volver sin guardar');
  });
});
