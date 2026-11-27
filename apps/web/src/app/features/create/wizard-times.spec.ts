import { Component, ErrorHandler, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { type TestScreen, installTestScreen } from '../../../test/media-queries';
import { REPEAT_DELAY_MS, REPEAT_EVERY_MS } from '../../shared/ui/hold-repeat';
import { type DateSelection, NO_DATES } from './date-selection';
import type { DayTime, DayTimes } from './day-times';
import { WizardTimes } from './wizard-times';
import timesStyles from './wizard-times.scss' with { loader: 'text' };

const WIDE = '(min-width: 650px)';
const NO_MOUSE = '(hover: none), (pointer: coarse)';
const NARROWEST = '(max-width: 319.98px)';

// As the column's stylesheet lays them out: rows of 35 px, 6 px apart.
const ROW = 35;
const GAP = 6;

// A column starts 120 px after the one before it.
const STRIDE = 120;

function at(time: string): DayTime {
  return { kind: 'single', at: time };
}

/** The times of a day with these marked and none saved. */
function only(...times: DayTime[]): DayTimes {
  return { marked: times, saved: [] };
}

/** The first `count` hours of a day, each a time on the hour. */
function hoursFromMidnight(count: number): DayTimes {
  return only(
    ...Array.from({ length: count }, (_, hour) => at(`${String(hour).padStart(2, '0')}:00`)),
  );
}

/** Dates with times asked for, as the step is reached. */
function timed(parts: Partial<DateSelection>): DateSelection {
  return { ...NO_DATES, timed: true, ...parts };
}

@Component({
  imports: [WizardTimes],
  template: `<app-wizard-times
    [(selection)]="selection"
    [(place)]="place"
    (back)="went.push('back')"
    (next)="went.push('next')"
    ><p class="below">Volver sin guardar</p></app-wizard-times
  >`,
})
class Host {
  readonly selection = signal<DateSelection>(NO_DATES);
  readonly place = signal(0);
  readonly went: string[] = [];
}

/** `one` comes before `other` in the page. */
function precedes(one: Node, other: Node): boolean {
  return (one.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe('WizardTimes', () => {
  let fixture: ComponentFixture<Host>;
  let rendered: HTMLElement | undefined;
  let screen: TestScreen;
  // Where the lists start down the page, and how tall the screen is.
  let listTop: number;
  /** The height of the place of each column's trash. */
  let placeHeight: number;
  let innerHeight: number;

  /** The lists lay their rows out as a browser would; the step's card ends 100 px below. */
  function layOut(): void {
    const height = (list: HTMLElement): number => {
      const set = Number.parseFloat(list.style.blockSize);
      return Number.isNaN(set) ? 24 * ROW + 23 * GAP : set;
    };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('hours')) {
        return { top: listTop, bottom: listTop + height(this) } as DOMRect;
      }
      if (this.classList.contains('card')) {
        const lists = [...document.querySelectorAll<HTMLElement>('.hours')];
        return { bottom: listTop + Math.max(...lists.map(height)) + 100 } as DOMRect;
      }
      if (this.classList.contains('column')) {
        const place = [...(this.parentElement?.children ?? [])].indexOf(this);
        return { left: 16 + place * STRIDE, top: 0, bottom: 0 } as DOMRect;
      }
      const list = this.parentElement;
      if (list?.classList.contains('hours')) {
        const top = listTop + [...list.children].indexOf(this) * (ROW + GAP) - list.scrollTop;
        return { top, bottom: top + ROW } as DOMRect;
      }
      if (this.classList.contains('clear-place')) return { height: placeHeight } as DOMRect;
      return { top: 0, bottom: 0, height: 0 } as DOMRect;
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => innerHeight });
    HTMLElement.prototype.scrollTo = () => {};
  }

  beforeEach(() => {
    listTop = 400;
    innerHeight = 800;
    placeHeight = 0;
    screen = installTestScreen({ [WIDE]: true });
    layOut();
    TestBed.configureTestingModule({ imports: [Host], providers: [provideI18n()] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'innerHeight');
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
    rendered?.remove();
    rendered = undefined;
  });

  async function render(selection: DateSelection): Promise<void> {
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.selection.set(selection);
    // In the page, inside its step's card: the lists are measured.
    rendered = document.createElement('div');
    rendered.className = 'card';
    rendered.append(fixture.nativeElement as HTMLElement);
    document.body.append(rendered);
    await fixture.whenStable();
  }

  function step(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function current(): DateSelection {
    return fixture.componentInstance.selection();
  }

  function groups(): HTMLElement[] {
    return [...step().querySelectorAll<HTMLElement>('[role="group"]')];
  }

  /** Whether a column is on screen: the ones off it are out of reach. */
  function onScreen(group: HTMLElement): boolean {
    return group.closest<HTMLElement>('.column')?.inert !== true;
  }

  /** The columns on screen, as screen readers name them. */
  function names(): (string | null)[] {
    return groups()
      .filter(onScreen)
      .map((group) => group.getAttribute('aria-label'));
  }

  /** A touch event on a column, with the finger on the screen after it, if one is. */
  async function touch(name: string, type: string, x?: number): Promise<void> {
    const touches = x === undefined ? [] : [{ identifier: 1, clientX: x, clientY: 300 }];
    const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), { touches });
    column(name).dispatchEvent(event);
    await fixture.whenStable();
  }

  /** A finger is put down on a column and moves sideways, to the left when `by` is less than 0. */
  async function slideOn(name: string, by: number): Promise<void> {
    await touch(name, 'touchstart', 200);
    await touch(name, 'touchmove', 200 + by);
  }

  /** A finger slides sideways on a column and lifts. */
  async function slide(name: string, by: number): Promise<void> {
    await slideOn(name, by);
    await touch(name, 'touchend');
  }

  /** Whether the row of columns is with a finger: it moves as the finger does, with no delay. */
  function withFinger(): boolean {
    return step().querySelector('.strip')?.classList.contains('with-finger') === true;
  }

  /** How many columns the row of columns is moved to its start, and how many its window shows. */
  function strip(): { moved: string; shows: string } {
    const row = step().querySelector<HTMLElement>('.strip');
    return {
      moved: row?.style.getPropertyValue('--first') ?? 'no strip',
      shows: row?.parentElement?.style.getPropertyValue('--visible') ?? 'no window',
    };
  }

  function column(name: string): HTMLElement {
    const found = groups().find((group) => group.getAttribute('aria-label') === name);
    if (!found) throw new Error(`No column named ${name}`);
    return found;
  }

  /** The times marked in a column, as they read. */
  function marked(name: string): string[] {
    return [...column(name).querySelectorAll('button[aria-pressed="true"]')].map((time) =>
      time.textContent.trim(),
    );
  }

  /** What each header on screen shows, its parts joined by spaces. */
  function headers(): string[] {
    return [...step().querySelectorAll('app-column-header')].map((header) =>
      [...header.querySelectorAll('span')].map((part) => part.textContent.trim()).join(' '),
    );
  }

  async function press(name: string, label: string): Promise<void> {
    const button = [...column(name).querySelectorAll('button')].find(
      (each) => (each.getAttribute('aria-label') ?? each.textContent.trim()) === label,
    );
    if (!button) throw new Error(`No button ${label} in ${name}`);
    button.click();
    await fixture.whenStable();
  }

  function arrow(name: string): HTMLButtonElement {
    const found = step().querySelector<HTMLButtonElement>(
      `app-step-pager button[aria-label="${name}"]`,
    );
    if (!found) throw new Error(`No arrow named ${name}`);
    return found;
  }

  async function go(name: string): Promise<void> {
    arrow(name).click();
    await fixture.whenStable();
  }

  function place(): string {
    return step().querySelector('app-step-pager .place')?.textContent.trim() ?? 'no place';
  }

  function years(): string[] {
    return [...step().querySelectorAll('.year')].map((year) => year.textContent.trim());
  }

  function counter(): string {
    return step().querySelector('app-option-counter')?.textContent.trim() ?? 'no counter';
  }

  function listHeights(): string[] {
    return [...step().querySelectorAll<HTMLElement>('.hours')].map((list) => list.style.blockSize);
  }

  function rows(count: number): string {
    return `${String(count * ROW + (count - 1) * GAP)}px`;
  }

  const SATURDAY = 'sábado, 20 de junio';
  const SUNDAY = 'domingo, 21 de junio';
  const MONDAY = 'lunes, 22 de junio';

  it('styles itself only with design tokens', () => {
    expect(literalValues(timesStyles)).toEqual([]);
  });

  it('says what to do', async () => {
    await render(timed({ singles: ['2026-06-20'] }));

    expect(step().querySelector('.instructions')?.textContent.trim()).toBe(
      'Selecciona los horarios para cada día.',
    );
  });

  describe('the columns', () => {
    it('gives each date of its own a column named after its day, with its times', async () => {
      await render(
        timed({
          singles: ['2026-06-20', '2026-06-21'],
          times: { '2026-06-21': only(at('09:00'), at('18:15')) },
        }),
      );

      expect(names()).toEqual([SATURDAY, SUNDAY]);
      expect(groups().map((group) => group.tagName)).toEqual([
        'APP-HOUR-COLUMN',
        'APP-HOUR-COLUMN',
      ]);
      expect(marked(SATURDAY)).toEqual([]);
      expect(marked(SUNDAY)).toEqual(['9:00', '18:15']);
    });

    it('shows each day over its column, for the eye only', async () => {
      await render(timed({ singles: ['2026-06-20', '2026-06-21'] }));

      expect(headers()).toEqual(['Jun 20 Sáb', 'Jun 21 Dom']);
      expect(
        [...step().querySelectorAll('app-column-header')].map((header) =>
          header.getAttribute('aria-hidden'),
        ),
      ).toEqual(['true', 'true']);
    });

    it('gives a range a column without times: its two ends and "Sin horario"', async () => {
      await render(timed({ ranges: [{ start: '2026-06-22', end: '2026-06-23' }] }));

      expect(names()).toEqual(['lunes, 22 de junio a martes, 23 de junio']);
      expect(groups()[0]?.textContent.trim()).toBe('Sin horario');
      expect(groups()[0]?.querySelector('button')).toBeNull();
      expect(headers()).toEqual(['Jun 22 Lun ➔ Jun 23 Mar']);
      expect(step().querySelector('app-column-header')?.getAttribute('aria-hidden')).toBe('true');
      expect(step().querySelector('app-hour-column')).toBeNull();
    });

    it('gives a saved range its column too', async () => {
      await render(timed({ saved: [{ start: '2026-06-22', end: '2026-06-23' }] }));

      expect(names()).toEqual(['lunes, 22 de junio a martes, 23 de junio']);
      expect(groups()[0]?.textContent.trim()).toBe('Sin horario');
    });

    it('puts them by first day, a day before the ranges that start on it', async () => {
      await render(
        timed({
          singles: ['2026-06-20', '2026-06-22'],
          ranges: [{ start: '2026-06-21', end: '2026-06-23' }],
          saved: [{ start: '2026-06-22', end: '2026-06-23' }],
        }),
      );

      expect(names()).toEqual([
        SATURDAY,
        'domingo, 21 de junio a martes, 23 de junio',
        MONDAY,
        'lunes, 22 de junio a martes, 23 de junio',
      ]);
    });
  });

  describe('marking times', () => {
    it('marks the hour pressed as a time of its day', async () => {
      await render(timed({ singles: ['2026-06-20', '2026-06-21'] }));

      await press(SUNDAY, '18:00');

      expect(current().times).toEqual({ '2026-06-21': only(at('18:00')) });
      expect(marked(SUNDAY)).toEqual(['18:00']);
      expect(marked(SATURDAY)).toEqual([]);
    });

    it('keeps the times of the other days', async () => {
      await render(
        timed({
          singles: ['2026-06-20', '2026-06-21'],
          times: { '2026-06-20': only(at('10:00')) },
        }),
      );

      await press(SUNDAY, '18:00');
      await press(SUNDAY, '11:00');

      expect(current().times).toEqual({
        '2026-06-20': only(at('10:00')),
        '2026-06-21': only(at('11:00'), at('18:00')),
      });
    });

    it('unmarks a marked time pressed again, and moves one a quarter with its arrows', async () => {
      await render(
        timed({ singles: ['2026-06-20'], times: { '2026-06-20': only(at('10:00'), at('18:00')) } }),
      );

      await press(SATURDAY, '10:00');
      await press(SATURDAY, '18:00, quince minutos después');

      expect(current().times).toEqual({ '2026-06-20': only(at('18:15')) });
      expect(marked(SATURDAY)).toEqual(['18:15']);
    });

    it('marks no further time on a day once every option is taken', async () => {
      // 24 + 24 + 11 times and a day without times: 60 options.
      await render(
        timed({
          singles: ['2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23'],
          times: {
            '2026-06-20': hoursFromMidnight(24),
            '2026-06-21': hoursFromMidnight(24),
            '2026-06-22': hoursFromMidnight(11),
          },
        }),
      );

      await press(MONDAY, '18:00');

      expect(current().times['2026-06-22']).toEqual(hoursFromMidnight(11));

      // The first time of a day is the same option the day was.
      await press('martes, 23 de junio', '18:00');

      expect(current().times['2026-06-23']).toEqual(only(at('18:00')));
    });
  });

  describe('the columns on screen', () => {
    const sixDays = timed({
      singles: ['2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25'],
    });
    const TUESDAY = 'martes, 23 de junio';
    const WEDNESDAY = 'miércoles, 24 de junio';
    const THURSDAY = 'jueves, 25 de junio';

    it('are four on a wide screen, the first ones on entering', async () => {
      await render(sixDays);

      expect(names()).toEqual([SATURDAY, SUNDAY, MONDAY, TUESDAY]);
      expect(place()).toBe('1 / 3');
    });

    it('are three on a narrow screen', async () => {
      screen.set(WIDE, false);
      await render(sixDays);

      expect(names()).toEqual([SATURDAY, SUNDAY, MONDAY]);
      expect(place()).toBe('1 / 4');
    });

    it('are two on a screen narrower than 320 px', async () => {
      screen.set(WIDE, false);
      screen.set(NARROWEST, true);
      await render(sixDays);

      expect(names()).toEqual([SATURDAY, SUNDAY]);
      expect(place()).toBe('1 / 5');
      expect(strip()).toEqual({ moved: '0', shows: '2' });
    });

    it('move one column at a time with the arrows of the step', async () => {
      await render(sixDays);

      await go('Día siguiente');

      expect(names()).toEqual([SUNDAY, MONDAY, TUESDAY, WEDNESDAY]);
      expect(place()).toBe('2 / 3');

      await go('Día siguiente');

      expect(names()).toEqual([MONDAY, TUESDAY, WEDNESDAY, THURSDAY]);
      expect(place()).toBe('3 / 3');

      await go('Día anterior');

      expect(names()).toEqual([SUNDAY, MONDAY, TUESDAY, WEDNESDAY]);
      expect(fixture.componentInstance.went).toEqual([]);
    });

    it('go on moving while an arrow is held, and stop at the last without leaving the step', async () => {
      await render(sixDays);
      vi.useFakeTimers();

      arrow('Día siguiente').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      fixture.detectChanges();
      expect(place()).toBe('2 / 3');

      vi.advanceTimersByTime(REPEAT_DELAY_MS);
      fixture.detectChanges();
      expect(place()).toBe('3 / 3');

      vi.advanceTimersByTime(REPEAT_EVERY_MS * 3);
      fixture.detectChanges();
      expect(names()).toEqual([MONDAY, TUESDAY, WEDNESDAY, THURSDAY]);
      expect(fixture.componentInstance.went).toEqual([]);
    });

    it('show the columns from the place they are given, as the summary left them', async () => {
      await render(sixDays);

      fixture.componentInstance.place.set(2);
      await fixture.whenStable();

      expect(names()).toEqual([MONDAY, TUESDAY, WEDNESDAY, THURSDAY]);
      expect(place()).toBe('3 / 3');
    });

    it('give the place they move to, for the summary to open on it', async () => {
      await render(sixDays);

      await go('Día siguiente');

      expect(fixture.componentInstance.place()).toBe(1);
    });

    it('lead back to step 2 from the first ones and on from the last', async () => {
      await render(sixDays);

      await go('Volver al paso 2');
      await go('Día siguiente');
      await go('Día siguiente');
      await go('Siguiente');

      expect(fixture.componentInstance.went).toEqual(['back', 'next']);
    });

    it('have no place to show when they are all the columns', async () => {
      await render(timed({ singles: ['2026-06-20', '2026-06-21'] }));

      expect(place()).toBe('no place');
      expect(arrow('Volver al paso 2')).toBeTruthy();
      expect(arrow('Siguiente')).toBeTruthy();
    });

    it('start at the same column when the screen turns narrower or wider, as far as the last ones allow', async () => {
      await render(sixDays);
      await go('Día siguiente');

      screen.set(WIDE, false);
      await fixture.whenStable();

      expect(names()).toEqual([SUNDAY, MONDAY, TUESDAY]);
      expect(place()).toBe('2 / 4');

      await go('Día siguiente');
      await go('Día siguiente');
      expect(names()).toEqual([TUESDAY, WEDNESDAY, THURSDAY]);

      screen.set(WIDE, true);
      await fixture.whenStable();

      expect(names()).toEqual([MONDAY, TUESDAY, WEDNESDAY, THURSDAY]);
      expect(place()).toBe('3 / 3');

      await go('Día anterior');

      expect(names()).toEqual([SUNDAY, MONDAY, TUESDAY, WEDNESDAY]);
    });

    it('start at the same column when the screen turns narrower than 320 px or back', async () => {
      screen.set(WIDE, false);
      await render(sixDays);
      await go('Día siguiente');

      screen.set(NARROWEST, true);
      await fixture.whenStable();

      expect(names()).toEqual([SUNDAY, MONDAY]);
      expect(place()).toBe('2 / 5');

      await go('Día siguiente');
      await go('Día siguiente');
      await go('Día siguiente');
      expect(names()).toEqual([WEDNESDAY, THURSDAY]);

      screen.set(NARROWEST, false);
      await fixture.whenStable();

      expect(names()).toEqual([TUESDAY, WEDNESDAY, THURSDAY]);
      expect(place()).toBe('4 / 4');
    });

    it('are in a row with the ones off screen, which are out of reach', async () => {
      await render(sixDays);

      expect(groups().map((group) => group.getAttribute('aria-label'))).toEqual([
        SATURDAY,
        SUNDAY,
        MONDAY,
        TUESDAY,
        WEDNESDAY,
        THURSDAY,
      ]);
      expect(groups().map(onScreen)).toEqual([true, true, true, true, false, false]);

      await go('Día siguiente');

      expect(groups().map(onScreen)).toEqual([false, true, true, true, true, false]);
    });

    it('slide into sight: their row moves a column for each one before the first on screen', async () => {
      await render(sixDays);
      expect(strip()).toEqual({ moved: '0', shows: '4' });

      await go('Día siguiente');
      await go('Día siguiente');
      expect(strip()).toEqual({ moved: '2', shows: '4' });

      screen.set(WIDE, false);
      await fixture.whenStable();
      expect(strip()).toEqual({ moved: '2', shows: '3' });
    });

    describe('under a finger that slides sideways', () => {
      beforeEach(() => {
        screen.set(WIDE, false);
      });

      it('move with it: their row is as far to its start as the finger has gone', async () => {
        await render(sixDays);
        await go('Día siguiente');

        await slideOn(SUNDAY, -60);
        expect(strip().moved).toBe('1.5');
        expect(withFinger()).toBe(true);

        await touch(SUNDAY, 'touchmove', 200 + 30);
        expect(strip().moved).toBe('0.75');
        // The ones on screen are the same until the finger lifts.
        expect(names()).toEqual([SUNDAY, MONDAY, TUESDAY]);
      });

      it('settle when the finger lifts, the first on screen being the one it brought there', async () => {
        await render(sixDays);

        await slide(SATURDAY, -120);

        expect(strip().moved).toBe('1');
        expect(withFinger()).toBe(false);
        expect(names()).toEqual([SUNDAY, MONDAY, TUESDAY]);
        expect(place()).toBe('2 / 4');
      });

      it('come back with a finger that slides the other way', async () => {
        await render(sixDays);
        await go('Día siguiente');
        await go('Día siguiente');

        await slide(MONDAY, 120);

        expect(names()).toEqual([SUNDAY, MONDAY, TUESDAY]);
        expect(place()).toBe('2 / 4');
      });

      it('stay when the finger has gone a quarter of the way to the next column, or less', async () => {
        await render(sixDays);

        await slide(SATURDAY, -30);
        expect(place()).toBe('1 / 4');
        expect(strip().moved).toBe('0');

        await go('Día siguiente');
        await slide(SUNDAY, 30);
        expect(place()).toBe('2 / 4');
      });

      it('move a column once the finger has gone more than a quarter of the way to it', async () => {
        await render(sixDays);

        await slide(SATURDAY, -31);
        expect(place()).toBe('2 / 4');

        await slide(SUNDAY, 31);
        expect(place()).toBe('1 / 4');
      });

      it('move as many columns as the finger has passed', async () => {
        await render(sixDays);

        await slide(SATURDAY, -150);
        expect(place()).toBe('2 / 4');

        await slide(SUNDAY, -151);
        expect(place()).toBe('4 / 4');

        await slide(TUESDAY, 240);
        expect(place()).toBe('2 / 4');
      });

      it('stop at the first one and at the last', async () => {
        await render(sixDays);

        await slideOn(SATURDAY, 60);
        expect(strip().moved).toBe('0');
        await touch(SATURDAY, 'touchend');
        expect(place()).toBe('1 / 4');

        await slideOn(SATURDAY, -1000);
        expect(strip().moved).toBe('3');
        await touch(SATURDAY, 'touchend');
        expect(place()).toBe('4 / 4');
        expect(names()).toEqual([TUESDAY, WEDNESDAY, THURSDAY]);

        // From the last place the arrow goes back one, however far the finger went.
        await go('Día anterior');
        expect(place()).toBe('3 / 4');
      });

      it('go back to where they were when the slide is given up', async () => {
        await render(sixDays);
        await go('Día siguiente');

        await slideOn(SUNDAY, -200);
        await touch(SUNDAY, 'touchcancel');

        expect(strip().moved).toBe('1');
        expect(withFinger()).toBe(false);
        expect(place()).toBe('2 / 4');
      });

      it('stay still when they are all on screen', async () => {
        await render(timed({ singles: ['2026-06-20', '2026-06-21'] }));

        await slideOn(SATURDAY, -200);
        expect(strip().moved).toBe('0');

        await touch(SATURDAY, 'touchend');
        expect(strip().moved).toBe('0');
        expect(names()).toEqual([SATURDAY, SUNDAY]);
      });

      it('stay still when there is one column alone, and nothing fails', async () => {
        const failures: unknown[] = [];
        const handler: ErrorHandler = { handleError: (error) => failures.push(error) };
        TestBed.overrideProvider(ErrorHandler, { useValue: handler });
        await render(timed({ singles: ['2026-06-20'] }));

        await slide(SATURDAY, -200);

        expect(strip().moved).toBe('0');
        expect(names()).toEqual([SATURDAY]);
        expect(failures).toEqual([]);
      });
    });

    it('stay as they are when they leave the screen and come back', async () => {
      await render(sixDays);
      const saturday = column(SATURDAY);
      const sunday = column(SUNDAY);

      await go('Día siguiente');
      expect(column(SATURDAY)).toBe(saturday);
      expect(onScreen(saturday)).toBe(false);

      await go('Día anterior');
      expect(column(SATURDAY)).toBe(saturday);
      expect(column(SUNDAY)).toBe(sunday);
      expect(onScreen(saturday)).toBe(true);
    });

    it('keep their times while they are off screen', async () => {
      await render(sixDays);

      await press(SATURDAY, '18:00');
      await go('Día siguiente');
      await press(WEDNESDAY, '9:00');
      await go('Día anterior');

      expect(marked(SATURDAY)).toEqual(['18:00']);
      expect(current().times).toEqual({
        '2026-06-20': only(at('18:00')),
        '2026-06-24': only(at('09:00')),
      });
    });
  });

  describe('the years', () => {
    it('shows the year of the days on screen beside them, with no row of its own', async () => {
      await render(timed({ singles: ['2026-06-20', '2026-06-21'] }));

      expect(years()).toEqual(['2026', '']);
      expect(step().querySelector('.year-row')).toBeNull();
      const [first, second] = [...step().querySelectorAll('.year')];
      const window = step().querySelector('.window');
      expect(first && window && precedes(first, window)).toBe(true);
      expect(second && window && precedes(window, second)).toBe(true);
    });

    it('shows a second year at its end when the days on screen reach into it', async () => {
      await render(timed({ ranges: [{ start: '2026-12-30', end: '2027-01-02' }] }));

      expect(years()).toEqual(['2026', '2027']);
    });

    it('follows the columns on screen', async () => {
      await render(
        timed({
          singles: ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-02'],
        }),
      );
      expect(years()).toEqual(['2026', '']);

      await go('Día siguiente');

      expect(years()).toEqual(['2026', '2027']);
    });
  });

  describe('the options counter', () => {
    it('is over the arrows, silent while they are far from the most', async () => {
      await render(
        timed({ singles: ['2026-06-20'], times: { '2026-06-20': hoursFromMidnight(24) } }),
      );

      expect(step().querySelector('app-option-counter + app-step-pager')).not.toBeNull();
      expect(counter()).toBe('');
    });

    it('is in the middle of the row of the "+" button without a mouse', async () => {
      screen = installTestScreen({ [WIDE]: true, [NO_MOUSE]: true });
      await render(
        timed({ singles: ['2026-06-20'], times: { '2026-06-20': hoursFromMidnight(24) } }),
      );

      expect(step().querySelectorAll('app-option-counter')).toHaveLength(1);
      expect(step().querySelector('app-save-offer app-option-counter')).not.toBeNull();
    });

    it('counts every time as an option, and follows the times as they are marked', async () => {
      await render(
        timed({
          singles: ['2026-06-20', '2026-06-21', '2026-06-22'],
          times: {
            '2026-06-20': hoursFromMidnight(24),
            '2026-06-21': hoursFromMidnight(24),
            '2026-06-22': hoursFromMidnight(9),
          },
        }),
      );

      expect(counter()).toBe('57 de 60 opciones');

      await press(MONDAY, '18:00');

      expect(counter()).toBe('58 de 60 opciones');
    });
  });

  describe('the room on the screen', () => {
    const twoDays = timed({ singles: ['2026-06-20', '2026-06-21'] });

    it('shows nine hours a column on a wide screen, whatever its height', async () => {
      await render(twoDays);

      expect(listHeights()).toEqual([rows(9), rows(9)]);
    });

    it('shows on a narrow screen the hours that leave the card on screen', async () => {
      screen.set(WIDE, false);
      await render(twoDays);

      // 800 − 10 − 400 − 100 leaves 290 px: seven hours.
      expect(listHeights()).toEqual([rows(7), rows(7)]);
    });

    it('leaves the place of a column’s trash out of what goes below the hours', async () => {
      screen.set(WIDE, false);
      // The card ends as far below the lists, the place of the trash in it: 40 px of the 100.
      placeHeight = 40;
      await render(twoDays);

      // 800 − 10 − 400 − (100 − 40) leaves 330 px: eight hours.
      expect(listHeights()).toEqual([rows(8), rows(8)]);
    });

    it('gives the columns off screen the same hours as the ones on it', async () => {
      screen.set(WIDE, false);
      await render(timed({ singles: ['2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23'] }));

      expect(listHeights()).toEqual([rows(7), rows(7), rows(7), rows(7)]);
    });

    it('lets the columns grow back to nine hours when the screen turns wide', async () => {
      screen.set(WIDE, false);
      await render(twoDays);

      screen.set(WIDE, true);
      await fixture.whenStable();

      expect(listHeights()).toEqual([rows(9), rows(9)]);
    });
  });
  it('shows what it holds under its arrows', async () => {
    await render(timed({ singles: ['2026-07-06'] }));

    expect(step().querySelector('app-step-pager ~ p.below')?.textContent).toBe(
      'Volver sin guardar',
    );
  });
});
