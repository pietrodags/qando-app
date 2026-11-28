import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { type TestScreen, installTestScreen } from '../../../test/media-queries';
import type { StepFinish } from '../../shared/ui/step-pager';
import { type DateSelection, NO_DATES } from './date-selection';
import type { DayTime, DayTimes } from './day-times';
import { PartHandover } from './part-handover';
import { WizardSummary } from './wizard-summary';
import blockStyles from '../vote/_time-blocks.scss' with { loader: 'text' };
import stepStyles from './_column-step.scss' with { loader: 'text' };
import summaryStyles from './wizard-summary.scss' with { loader: 'text' };

const WIDE = '(min-width: 650px)';
const NARROWEST = '(max-width: 319.98px)';

// A column starts 120 px after the one before it.
const STRIDE = 120;

function at(time: string): DayTime {
  return { kind: 'single', at: time };
}

function between(start: string, end: string): DayTime {
  return { kind: 'range', start, end };
}

/** Dates with times asked for, as the step is reached. */
function timed(parts: Partial<DateSelection>): DateSelection {
  return { ...NO_DATES, timed: true, ...parts };
}

/** The days from `first` on, `count` of them, each a date of its own without times. */
function days(first: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `2026-06-${String(first + index)}`);
}

@Component({
  imports: [WizardSummary],
  template: `<app-wizard-summary
    [selection]="selection()"
    [(place)]="place"
    [finish]="finish()"
    (back)="went.push('back')"
    (next)="went.push('next')"
    ><p class="below">Volver sin guardar</p></app-wizard-summary
  >`,
})
class Host {
  readonly selection = signal<DateSelection>(NO_DATES);
  readonly place = signal(0);
  readonly finish = signal<StepFinish | null>(null);
  readonly went: string[] = [];
}

/** `one` comes before `other` in the page. */
function precedes(one: Node, other: Node): boolean {
  return (one.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** The options counter is alone over the arrows: after the window on the columns, before them. */
function counterOverArrows(step: Element): boolean {
  const [window, counter, arrows] = ['.window', 'app-option-counter', 'app-step-pager'].map(
    (selector) => step.querySelector(selector),
  );
  if (!window || !counter || !arrows) return false;
  return (
    precedes(window, counter) && precedes(counter, arrows) && !counter.closest('app-save-offer')
  );
}

describe('WizardSummary', () => {
  let fixture: ComponentFixture<Host>;
  let screen: TestScreen;

  beforeEach(() => {
    screen = installTestScreen({ [WIDE]: true });
    // jsdom lays nothing out: the columns are placed as a browser would.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('column')) {
        const place = [...(this.parentElement?.children ?? [])].indexOf(this);
        return { left: 16 + place * STRIDE } as DOMRect;
      }
      return { left: 0, top: 0, bottom: 0, height: 0 } as DOMRect;
    });
    TestBed.configureTestingModule({ imports: [Host], providers: [provideI18n(), PartHandover] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function render(selection: DateSelection): Promise<void> {
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.selection.set(selection);
    await fixture.whenStable();
  }

  function step(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function lists(): HTMLElement[] {
    return [...step().querySelectorAll<HTMLElement>('ul[role="list"]')];
  }

  /** The columns on screen: the ones off it are out of reach. */
  function onScreen(): HTMLElement[] {
    return lists().filter((list) => list.closest<HTMLElement>('.column')?.inert !== true);
  }

  /** The columns on screen, as screen readers name them. */
  function names(): (string | null)[] {
    return onScreen().map((list) => list.getAttribute('aria-label'));
  }

  /** What screen readers hear of each option of a column. */
  function heard(list: HTMLElement | undefined): string[] {
    return [...(list?.querySelectorAll('li') ?? [])].map((item) => {
      const name = item.querySelector('.visually-hidden') ?? item;
      return name.textContent.trim();
    });
  }

  function arrow(name: string): HTMLButtonElement {
    const found = [...step().querySelectorAll<HTMLButtonElement>('app-step-pager button')].find(
      (button) => button.getAttribute('aria-label') === name,
    );
    if (!found) throw new Error(`No arrow named ${name}`);
    return found;
  }

  async function press(name: string): Promise<void> {
    arrow(name).click();
    await fixture.whenStable();
  }

  function place(): string | undefined {
    return step().querySelector('app-step-pager .place')?.textContent.trim();
  }

  function years(): string[] {
    return [...step().querySelectorAll('.year')].map((year) => year.textContent.trim());
  }

  it('styles itself only with design tokens, in the styles it shares too', () => {
    expect(literalValues(summaryStyles)).toEqual([]);
    expect(literalValues(stepStyles)).toEqual([]);
    expect(literalValues(blockStyles)).toEqual([]);
  });

  it('leaves its height to the times that take its place, and none on going on', async () => {
    await render(timed({ singles: ['2026-06-20'] }));
    vi.spyOn(step().querySelector('app-wizard-summary')!, 'getBoundingClientRect').mockReturnValue({
      height: 880,
    } as DOMRect);

    await press('Siguiente');
    expect(TestBed.inject(PartHandover).take()).toBeNull();

    await press('Volver a los horarios');
    expect(TestBed.inject(PartHandover).take()).toBe(880);
  });

  it('has a column for each date of its own, each range and each saved range, by first day and then by last', async () => {
    await render(
      timed({
        singles: ['2026-07-06', '2026-07-10'],
        ranges: [{ start: '2026-07-06', end: '2026-07-09' }],
        saved: [{ start: '2026-07-06', end: '2026-07-07' }],
        times: { '2026-07-06': { marked: [at('18:15')], saved: [] } },
      }),
    );

    expect(names()).toEqual([
      'lunes, 6 de julio',
      'lunes, 6 de julio a martes, 7 de julio',
      'lunes, 6 de julio a jueves, 9 de julio',
      'viernes, 10 de julio',
    ]);
  });

  it('lists the times of a day once each, marked and saved, by when they start and then by when they end', async () => {
    const times: DayTimes = {
      marked: [between('20:00', '22:00'), at('18:15')],
      saved: [at('18:15'), between('18:15', '19:00')],
    };
    await render(timed({ singles: ['2026-07-06'], times: { '2026-07-06': times } }));

    expect(heard(lists()[0])).toEqual(['18:15', '18:15–19:00', '20:00–22:00']);
  });

  it('draws a time with its minutes small, and a time range from its start down to its end', async () => {
    const times: DayTimes = { marked: [at('09:30'), between('20:00', '22:15')], saved: [] };
    await render(timed({ singles: ['2026-07-06'], times: { '2026-07-06': times } }));

    const [nine, evening] = [...(lists()[0]?.querySelectorAll('li') ?? [])];
    expect(nine?.classList).toContain('single');
    expect(nine?.textContent.trim()).toBe('9:30');
    // One line: the hour and its minutes in one box of the option, as the voting page has them.
    expect(nine?.querySelector(':scope > span > small')?.textContent).toBe(':30');
    expect(evening?.classList).toContain('range');
    const drawn = evening?.querySelector('[aria-hidden="true"]');
    const parts = [...(drawn?.children ?? [])];
    expect(parts.map((each) => each.textContent.trim())).toEqual(['20:00', '', '22:15']);
    // The arrow between them is a drawing, as on the voting page: written as a character, each
    // device draws its own, and a phone an emoji.
    expect(parts[1]?.matches('svg.arrow')).toBe(true);
  });

  it('gives a date without times and a range of days one option, "Sin horario"', async () => {
    await render(
      timed({
        singles: ['2026-07-06'],
        saved: [{ start: '2026-07-08', end: '2026-07-09' }],
      }),
    );

    expect(lists().map(heard)).toEqual([['Sin horario'], ['Sin horario']]);
    expect(lists()[0]?.querySelector('li')?.classList).toContain('whole-day');
  });

  it('puts four columns on screen from 650 px, the rest out of reach', async () => {
    await render(timed({ singles: days(20, 6) }));

    expect(names()).toEqual([
      'sábado, 20 de junio',
      'domingo, 21 de junio',
      'lunes, 22 de junio',
      'martes, 23 de junio',
    ]);
    expect(lists()).toHaveLength(6);
  });

  it('puts three columns on screen below 650 px, and two under 320 px', async () => {
    screen.set(WIDE, false);
    await render(timed({ singles: days(20, 6) }));
    expect(onScreen()).toHaveLength(3);

    screen.set(NARROWEST, true);
    await fixture.whenStable();
    expect(onScreen()).toHaveLength(2);
  });

  describe('the step’s arrows', () => {
    it('move the columns one at a time, and say the place of the first on screen', async () => {
      await render(timed({ singles: days(20, 6) }));
      expect(place()).toBe('1 / 3');

      await press('Día siguiente');

      expect(names()[0]).toBe('domingo, 21 de junio');
      expect(place()).toBe('2 / 3');

      await press('Día anterior');

      expect(names()[0]).toBe('sábado, 20 de junio');
    });

    it('show the columns from the place they are given, as the times left them', async () => {
      await render(timed({ singles: days(20, 6) }));

      fixture.componentInstance.place.set(2);
      await fixture.whenStable();

      expect(names()[0]).toBe('lunes, 22 de junio');
      expect(place()).toBe('3 / 3');
    });

    it('give the place they move to, for the times to open on it', async () => {
      await render(timed({ singles: days(20, 6) }));

      await press('Día siguiente');

      expect(fixture.componentInstance.place()).toBe(1);
    });

    it('go back to the times from the first columns, and on from the last', async () => {
      await render(timed({ singles: days(20, 5) }));

      await press('Volver a los horarios');
      await press('Día siguiente');
      await press('Siguiente');

      expect(fixture.componentInstance.went).toEqual(['back', 'next']);
    });

    it('go back or on at once when every column is on screen', async () => {
      await render(timed({ singles: days(20, 2) }));

      expect(place()).toBeUndefined();
      await press('Volver a los horarios');
      await press('Siguiente');

      expect(fixture.componentInstance.went).toEqual(['back', 'next']);
    });
  });

  it('moves its columns with a finger that slides sideways, settling on the column brought', async () => {
    await render(timed({ singles: days(20, 6) }));
    const column = step().querySelector<HTMLElement>('.column');
    const touch = (type: string, x?: number): void => {
      const touches = x === undefined ? [] : [{ identifier: 1, clientX: x, clientY: 300 }];
      const event = new Event(type, { bubbles: true, cancelable: true });
      column?.dispatchEvent(Object.assign(event, { touches }));
    };

    touch('touchstart', 300);
    touch('touchmove', 180);
    touch('touchend');
    await fixture.whenStable();

    expect(names()[0]).toBe('domingo, 21 de junio');
    expect(fixture.componentInstance.place()).toBe(1);
  });

  it('shows the year of the days on screen, and a second one when they reach into it', async () => {
    await render(timed({ singles: ['2026-12-30', '2027-01-02'] }));

    expect(years()).toEqual(['2026', '2027']);
  });

  it('counts the options from 50 on, as the steps before it', async () => {
    const many = Array.from({ length: 50 }, (_, index) => {
      const day = new Date(Date.UTC(2026, 6, 1 + index));
      return day.toISOString().slice(0, 10);
    });
    await render(timed({ singles: many }));

    expect(step().querySelector('app-option-counter')?.textContent).toContain('50');
  });

  it('shows its years beside the columns, before and after their window, and the counter over the arrows', async () => {
    await render(timed({ singles: ['2026-12-30', '2027-01-02'] }));

    const [first, second] = [...step().querySelectorAll('.year')];
    const window = step().querySelector('.window');
    expect(first && window && precedes(first, window)).toBe(true);
    expect(second && window && precedes(window, second)).toBe(true);
    expect(counterOverArrows(step())).toBe(true);
  });

  describe('a long column', () => {
    /** Twelve times on the 6th: over the 10 units a column shows. */
    const twelve: DayTimes = {
      marked: Array.from({ length: 12 }, (_, hour) =>
        at(`${String(hour + 8).padStart(2, '0')}:00`),
      ),
      saved: [],
    };

    // jsdom lays nothing out: a folded box holds more than it shows, as in a browser.
    beforeEach(() => {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get(this: HTMLElement) {
          return this.style.blockSize === '' ? 0 : 500;
        },
      });
    });

    afterEach(() => {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
    });

    it('scrolls inside its box under ︿ and ﹀, which the keyboard reaches by the box itself', async () => {
      await render(
        timed({ singles: ['2026-07-06', '2026-07-07'], times: { '2026-07-06': twelve } }),
      );
      const [long, short] = lists();

      expect(long?.classList).toContain('folded');
      expect(long?.tabIndex).toBe(0);
      const arrows = [...(long?.closest('.column')?.querySelectorAll('.fold-arrow') ?? [])];
      expect(arrows.map((each) => each.textContent.trim())).toEqual(['︿', '﹀']);
      expect(short?.classList).not.toContain('folded');
      expect(short?.hasAttribute('tabindex')).toBe(false);
    });
  });
  describe('as the last step', () => {
    const CHECK = 'm4.5 12.75 6 6 9-13.5';
    const saving: StepFinish = { label: 'Guardar opciones', busy: false };

    async function renderLast(finish: StepFinish): Promise<void> {
      await render(timed({ singles: ['2026-07-06'] }));
      fixture.componentInstance.finish.set(finish);
      await fixture.whenStable();
    }

    it('ends with a tick named as asked, which goes on', async () => {
      await renderLast(saving);
      expect(arrow('Guardar opciones').querySelector('path')?.getAttribute('d')).toBe(CHECK);

      await press('Guardar opciones');

      expect(fixture.componentInstance.went).toEqual(['next']);
    });

    it('shows a spinner in place of the tick while busy, and a press sends nothing more', async () => {
      await renderLast({ ...saving, busy: true });
      expect(arrow('Guardar opciones').querySelector('.spinner')).not.toBeNull();

      await press('Guardar opciones');

      expect(fixture.componentInstance.went).toEqual([]);
    });
  });

  it('shows what it holds under its arrows', async () => {
    await render(timed({ singles: ['2026-07-06'] }));

    expect(step().querySelector('app-step-pager ~ p.below')?.textContent).toBe(
      'Volver sin guardar',
    );
  });
});
