import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { Option } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { HOLD_MS } from '../../shared/ui/long-press';
import { literalValues } from '../../../styles/token-usage';
import { type Answers, allAvailable } from './answers';
import { VoteTimes } from './vote-times';
import stepStyles from './_vote-step.scss' with { loader: 'text' };
import timesStyles from './vote-times.scss' with { loader: 'text' };
import { installTestScreen, type TestScreen } from '../../../test/media-queries';

const WIDE = '(min-width: 650px)';
const TOUCH = '(pointer: coarse)';

const nine: Option = {
  id: 'nine',
  dates: { kind: 'single', date: '2026-07-06' },
  time: { kind: 'single', at: '09:00' },
};
const evening: Option = {
  id: 'evening',
  dates: { kind: 'single', date: '2026-07-06' },
  time: { kind: 'range', start: '18:00', end: '20:30' },
};
const seventh: Option = {
  id: 'seventh',
  dates: { kind: 'single', date: '2026-07-07' },
  time: null,
};
const weekend: Option = {
  id: 'weekend',
  dates: { kind: 'range', start: '2026-07-11', end: '2026-07-12' },
  time: null,
};

function wholeDay(date: string): Option {
  return { id: date, dates: { kind: 'single', date }, time: null };
}

/** The browser's own zone: no notice is due when the event is in it. */
const BROWSER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe('VoteTimes', () => {
  let screen: TestScreen;

  beforeEach(() => {
    // jsdom has neither pointer nor width: both are the test's choice.
    screen = installTestScreen({ [WIDE]: false });
    TestBed.configureTestingModule({ imports: [VoteTimes], providers: [provideI18n()] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function render(
    options: readonly Option[],
    answers: Answers = allAvailable(options.map(({ id }) => id)),
    timeZone = BROWSER_ZONE,
  ): Promise<ComponentFixture<VoteTimes>> {
    const fixture = TestBed.createComponent(VoteTimes);
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('answers', answers);
    fixture.componentRef.setInput('timeZone', timeZone);
    await fixture.whenStable();
    return fixture;
  }

  function element(fixture: ComponentFixture<VoteTimes>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(fixture: ComponentFixture<VoteTimes>): string {
    return element(fixture).textContent.replace(/\s+/g, ' ').trim();
  }

  function button(fixture: ComponentFixture<VoteTimes>, name: RegExp): HTMLButtonElement {
    const found = Array.from(element(fixture).querySelectorAll('button')).find((candidate) =>
      name.test(candidate.getAttribute('aria-label') ?? candidate.textContent),
    );
    if (found === undefined) throw new Error(`No button named ${String(name)}`);
    return found;
  }

  function blockNames(fixture: ComponentFixture<VoteTimes>): string[] {
    return Array.from(
      element(fixture).querySelectorAll('.block'),
      (block) => block.getAttribute('aria-label') ?? '',
    );
  }

  /** Each header's lines, read as flat text: "Jul 6 Lun", "Jul 11 Sáb ➔ Jul 12 Dom". */
  function headers(fixture: ComponentFixture<VoteTimes>): string[] {
    return Array.from(element(fixture).querySelectorAll('.header'), (header) =>
      Array.from(header.querySelectorAll('*'))
        .filter((part) => part.children.length === 0)
        .map((part) => part.textContent.trim())
        .join(' '),
    );
  }

  async function act(fixture: ComponentFixture<VoteTimes>, action: () => void): Promise<void> {
    action();
    await fixture.whenStable();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(timesStyles)).toEqual([]);
    expect(literalValues(stepStyles)).toEqual([]);
  });

  it('keeps each day drawn when the options come again: its scroll and the focus stay', async () => {
    const fixture = await render([nine, evening, seventh]);
    const before = Array.from(element(fixture).querySelectorAll('.column'));

    await act(fixture, () => {
      fixture.componentRef.setInput('options', structuredClone([nine, evening, seventh]));
    });

    const after = Array.from(element(fixture).querySelectorAll('.column'));
    expect(after).toHaveLength(before.length);
    expect(after.every((column, index) => column === before[index])).toBe(true);
  });

  it('explains the mouse gestures on a screen with a mouse', async () => {
    const fixture = await render([nine]);

    expect(text(fixture)).toContain(
      'Y ahora los horarios... Haz doble clic para marcar tu preferido (máximo uno).',
    );
  });

  it('explains the touch gestures on a touch screen', async () => {
    screen.set(TOUCH, true);
    const fixture = await render([nine]);

    expect(text(fixture)).toContain(
      'Y ahora los horarios... Toca una hora para indicar si puedes o no. Mantén pulsado para elegir tu preferido (máximo uno).',
    );
  });

  it('shows the legend of the three answers and tells keyboard users how to answer', async () => {
    const fixture = await render([nine]);
    const legend = Array.from(element(fixture).querySelectorAll('.legend li'), (item) =>
      item.textContent.trim(),
    );

    expect(legend).toEqual(['Disponible', 'Preferido', 'No puedo']);
    expect(text(fixture)).toContain('Intro: puedes o no puedes. Mayúsculas+Intro: tu preferido.');
  });

  it('heads each column with its month, day and weekday, and a range with both ends', async () => {
    const fixture = await render([nine, evening, seventh, weekend]);

    expect(headers(fixture)).toEqual(['Jul 6 Lun', 'Jul 7 Mar', 'Jul 11 Sáb ➔ Jul 12 Dom']);
  });

  it('shows each option as the organizer chose its time, named with its day and answer', async () => {
    const fixture = await render([nine, evening, seventh, weekend], {
      nine: 'available',
      evening: 'preferred',
      seventh: 'unavailable',
      weekend: 'available',
    });
    // The whole-day option of 7 July is unavailable, so its day is out of step 3.

    expect(blockNames(fixture)).toEqual([
      'lunes, 6 de julio, 9:00: Disponible',
      // A range of times is named with the times joined as they are shown, so a voice user says
      // what they see (WCAG 2.5.3).
      'lunes, 6 de julio, 18:00–20:30: Preferido',
      'sábado, 11 de julio a domingo, 12 de julio, Sin horario: Disponible',
    ]);
    expect(
      Array.from(element(fixture).querySelectorAll('.block'), (block) =>
        block.textContent.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['9:00', '18:00 ⬇ 20:30', 'Sin horario']);
    expect(
      Array.from(element(fixture).querySelectorAll('.block'), (block) =>
        [...block.classList].sort(),
      ),
    ).toEqual([
      ['available', 'block', 'single'],
      ['block', 'preferred', 'range'],
      ['available', 'block', 'whole-day'],
    ]);
  });

  it('shortens every month and weekday to three letters, September too', async () => {
    const fixture = await render([wholeDay('2026-09-01')]);

    expect(headers(fixture)).toEqual(['Sep 1 Mar']);
  });

  it('leaves out the days that are not possible', async () => {
    const fixture = await render([nine, seventh], { nine: 'unavailable', seventh: 'available' });

    expect(headers(fixture)).toEqual(['Jul 7 Mar']);
  });

  it('toggles a time between available and unavailable when it is pressed', async () => {
    const fixture = await render([nine, evening]);

    await act(fixture, () => {
      button(fixture, /9:00:/).click();
    });
    expect(fixture.componentInstance.answers()).toEqual({
      nine: 'unavailable',
      evening: 'available',
    });

    await act(fixture, () => {
      button(fixture, /9:00:/).click();
    });
    expect(fixture.componentInstance.answers()).toEqual({
      nine: 'available',
      evening: 'available',
    });
  });

  it('keeps a day shown while its last time turns unavailable, until the step is opened again', async () => {
    const fixture = await render([nine]);

    await act(fixture, () => {
      button(fixture, /9:00:/).click();
    });

    expect(blockNames(fixture)).toEqual(['lunes, 6 de julio, 9:00: No puedo']);
  });

  it('makes a time the preferred one on double-click, and the previous one available', async () => {
    const fixture = await render([nine, evening], { nine: 'preferred', evening: 'available' });

    await act(fixture, () =>
      button(fixture, /20:30:/).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
    );

    expect(fixture.componentInstance.answers()).toEqual({
      nine: 'available',
      evening: 'preferred',
    });
  });

  it('ignores a double tap: a quick second tap only corrects the first', async () => {
    const fixture = await render([nine]);
    const block = button(fixture, /9:00:/);
    const touch = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });

    await act(fixture, () => {
      block.dispatchEvent(touch);
      block.click();
      block.click();
      block.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    expect(fixture.componentInstance.answers()).toEqual({ nine: 'available' });
  });

  it('makes a time the preferred one when a finger rests on it', async () => {
    const fixture = await render([nine]);
    vi.useFakeTimers();
    const touch = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });

    button(fixture, /9:00:/).dispatchEvent(touch);
    vi.advanceTimersByTime(HOLD_MS);

    expect(fixture.componentInstance.answers()).toEqual({ nine: 'preferred' });
  });

  it('makes the focused time the preferred one with Shift+Enter, without toggling it', async () => {
    const fixture = await render([nine]);
    const shiftEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });

    await act(fixture, () => button(fixture, /9:00:/).dispatchEvent(shiftEnter));

    expect(fixture.componentInstance.answers()).toEqual({ nine: 'preferred' });
    expect(shiftEnter.defaultPrevented).toBe(true);
  });

  it('lets a whole-day option be the preferred one', async () => {
    const fixture = await render([seventh]);

    await act(fixture, () =>
      button(fixture, /Sin horario/).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
    );

    expect(fixture.componentInstance.answers()).toEqual({ seventh: 'preferred' });
  });

  describe('with few columns', () => {
    it('shows no page indicator, goes back to step 2 and confirms the times', async () => {
      const fixture = await render([nine, seventh]);
      let back = 0;
      let done = 0;
      fixture.componentInstance.back.subscribe(() => (back += 1));
      fixture.componentInstance.done.subscribe(() => (done += 1));

      expect(element(fixture).querySelector('.page-indicator')).toBeNull();
      button(fixture, /Volver al paso 2/).click();
      button(fixture, /Confirmar mis horas/).click();

      expect([back, done]).toEqual([1, 1]);
    });
  });

  describe('with more columns than fit', () => {
    const july = ['06', '07', '08', '09', '10'].map((day) => wholeDay(`2026-07-${day}`));

    it('shows three columns at a time on a narrow screen and four on a wide one', async () => {
      const narrow = await render(july);

      expect(headers(narrow)).toHaveLength(3);
      expect(element(narrow).querySelector('.page-indicator')?.textContent.trim()).toBe('1 / 2');

      narrow.destroy();
      screen.set(WIDE, true);
      const wideScreen = await render(july);

      expect(headers(wideScreen)).toHaveLength(4);
    });

    it('goes back to the first page with the new number of columns when the screen turns wide', async () => {
      const fixture = await render(july);
      await act(fixture, () => {
        button(fixture, /Días siguientes/).click();
      });

      await act(fixture, () => {
        screen.set(WIDE, true);
      });

      expect(headers(fixture)).toHaveLength(4);
      expect(headers(fixture)[0]).toBe('Jul 6 Lun');
      expect(element(fixture).querySelector('.page-indicator')?.textContent.trim()).toBe('1 / 2');
    });

    it('pages forward and back, marks the last page and only confirms from it', async () => {
      const fixture = await render(july);
      let back = 0;
      let done = 0;
      fixture.componentInstance.back.subscribe(() => (back += 1));
      fixture.componentInstance.done.subscribe(() => (done += 1));
      const indicator = () => element(fixture).querySelector('.page-indicator');

      expect(indicator()?.classList).not.toContain('last');
      await act(fixture, () => {
        button(fixture, /Días siguientes/).click();
      });

      expect(headers(fixture)).toEqual(['Jul 9 Jue', 'Jul 10 Vie']);
      expect(indicator()?.textContent.trim()).toBe('2 / 2');
      expect(indicator()?.classList).toContain('last');
      expect(done).toBe(0);

      await act(fixture, () => {
        button(fixture, /Días anteriores/).click();
      });
      expect(headers(fixture)[0]).toBe('Jul 6 Lun');
      await act(fixture, () => {
        button(fixture, /Volver al paso 2/).click();
      });
      expect(back).toBe(1);
      await act(fixture, () => {
        button(fixture, /Días siguientes/).click();
      });
      await act(fixture, () => {
        button(fixture, /Confirmar mis horas/).click();
      });
      expect(done).toBe(1);
    });
  });

  describe('the year row', () => {
    function yearRow(fixture: ComponentFixture<VoteTimes>): string[] {
      return Array.from(element(fixture).querySelectorAll('.year-row > *'), (slot) =>
        slot.textContent.trim(),
      );
    }

    it('shows the year of the days on the left', async () => {
      const fixture = await render([nine]);

      expect(yearRow(fixture)).toEqual(['2026', '']);
    });

    it('shows both years when the page reaches into the next one', async () => {
      const fixture = await render([wholeDay('2026-12-31'), wholeDay('2027-01-01')]);

      expect(yearRow(fixture)).toEqual(['2026', '2027']);
    });

    it('says whose clock the times are on when the browser is in another time zone', async () => {
      const elsewhere = BROWSER_ZONE === 'America/New_York' ? 'Europe/Madrid' : 'America/New_York';
      const fixture = await render([nine], undefined, elsewhere);

      expect(element(fixture).querySelector('.zone')?.textContent.trim()).toBe(
        `Hora de ${elsewhere === 'Europe/Madrid' ? 'Madrid' : 'New York'}`,
      );
    });

    it('says nothing of the time zone when the browser is in the event’s', async () => {
      const fixture = await render([nine]);

      expect(element(fixture).querySelector('.zone')).toBeNull();
    });
  });

  describe('a long column', () => {
    /** Twelve times on the 8th: over the 10 units a column shows. */
    const twelve = Array.from({ length: 12 }, (_, hour): Option => ({
      id: `eighth-${String(hour)}`,
      dates: { kind: 'single', date: '2026-07-08' },
      time: { kind: 'single', at: `${String(hour + 8).padStart(2, '0')}:00` },
    }));

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

    function columnsOf(fixture: ComponentFixture<VoteTimes>): HTMLElement[] {
      return Array.from(element(fixture).querySelectorAll<HTMLElement>('.column'));
    }

    function arrows(column: HTMLElement): HTMLButtonElement[] {
      return Array.from(column.querySelectorAll<HTMLButtonElement>('.fold-arrow'));
    }

    it('scrolls inside its box under ︿ and ﹀; a short one keeps the ︿ row empty, level', async () => {
      const fixture = await render([nine, ...twelve]);
      const [short, long] = columnsOf(fixture);

      expect(long?.querySelector('.blocks')?.classList).toContain('folded');
      expect(arrows(long!).map((arrow) => arrow.textContent.trim())).toEqual(['︿', '﹀']);
      expect(short?.querySelector('.blocks')?.classList).not.toContain('folded');
      expect(arrows(short!)).toEqual([]);
      expect(short?.querySelector('.fold-row')).not.toBeNull();
    });

    it('starts at the top: ︿ is off and ﹀ on', async () => {
      const fixture = await render(twelve);
      const [up, down] = arrows(columnsOf(fixture)[0]!);

      expect(up?.disabled).toBe(true);
      expect(down?.disabled).toBe(false);
    });

    it('moves one block down with ﹀ on a wider screen', async () => {
      screen.set(WIDE, true);
      const fixture = await render(twelve);
      const box = columnsOf(fixture)[0]!.querySelector<HTMLElement>('.blocks')!;
      const scrolls: unknown[] = [];
      box.scrollTo = ((options: ScrollToOptions) => {
        scrolls.push(options);
      }) as typeof box.scrollTo;

      arrows(columnsOf(fixture)[0]!)[1]?.click();

      expect(scrolls).toHaveLength(1);
    });

    it('leaves the arrows to the mouse and the finger: the keyboard reaches each time', async () => {
      const fixture = await render(twelve);

      for (const arrow of arrows(columnsOf(fixture)[0]!)) {
        expect(arrow.getAttribute('aria-hidden')).toBe('true');
        expect(arrow.tabIndex).toBe(-1);
      }
    });

    describe('on a phone, in a modal', () => {
      let revealed: string[];

      // jsdom has no modal dialogs nor scrolling into view: these stand for the browser's.
      beforeEach(() => {
        revealed = [];
        HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
          this.setAttribute('open', '');
        };
        HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
          this.removeAttribute('open');
          this.dispatchEvent(new Event('close'));
        };
        // Only as far as needed: the time comes in at the edge it was hidden behind.
        Element.prototype.scrollIntoView = function (this: Element, options?: unknown) {
          if (JSON.stringify(options) === '{"block":"nearest"}') {
            revealed.push(this.getAttribute('aria-label') ?? '');
          }
        };
      });

      afterEach(() => {
        Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
        Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
        Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
      });

      function modal(): HTMLDialogElement | null {
        return element(fixture()).querySelector('dialog');
      }

      let current: ComponentFixture<VoteTimes> | undefined;
      function fixture(): ComponentFixture<VoteTimes> {
        return current!;
      }

      async function open(how: (column: HTMLElement) => void): Promise<void> {
        current = await render([nine, ...twelve]);
        await act(current, () => {
          how(columnsOf(current!)[1]!);
        });
      }

      it('marks the header of a long column, not of a short one', async () => {
        current = await render([nine, ...twelve]);
        const [short, long] = columnsOf(current);

        expect(long?.querySelector('.header .expand')).not.toBeNull();
        expect(short?.querySelector('.header .expand')).toBeNull();
      });

      it('leaves the header alone on a wider screen', async () => {
        screen.set(WIDE, true);
        current = await render(twelve);

        expect(element(current).querySelector('.expand')).toBeNull();
        await act(current, () => {
          columnsOf(current!)[0]!.querySelector<HTMLElement>('.header')!.click();
        });
        expect(modal()).toBeNull();
      });

      it('opens the whole day with a tap on its header: the legend, the day and every time', async () => {
        await open((column) => {
          column.querySelector<HTMLElement>('.header')!.click();
        });

        expect(modal()?.hasAttribute('open')).toBe(true);
        expect(modal()?.getAttribute('aria-label')).toBe('miércoles, 8 de julio');
        expect(modal()?.querySelectorAll('.legend li')).toHaveLength(3);
        expect(modal()?.querySelector('.header')?.textContent).toContain('8');
        expect(modal()?.querySelectorAll('.block')).toHaveLength(12);
        expect(modal()?.querySelector('.fold-arrow')).toBeNull();
        expect(revealed).toEqual([]);
      });

      it('opens it at the time ﹀ would have shown', async () => {
        await open((column) => {
          arrows(column)[1]!.click();
        });

        expect(modal()).not.toBeNull();
        expect(revealed).toHaveLength(1);
        expect(revealed[0]).toMatch(/8 de julio, \d+:00: Disponible$/);
      });

      it('answers in the modal at once, on the page too', async () => {
        await open((column) => {
          column.querySelector<HTMLElement>('.header')!.click();
        });

        await act(fixture(), () => {
          modal()!.querySelector<HTMLElement>('.block')!.click();
        });

        expect(fixture().componentInstance.answers()['eighth-0']).toBe('unavailable');
        expect(columnsOf(fixture())[1]!.querySelector('.block')?.classList).toContain(
          'unavailable',
        );
      });

      it('closes with its ✓, back to the page', async () => {
        await open((column) => {
          column.querySelector<HTMLElement>('.header')!.click();
        });

        await act(fixture(), () => {
          modal()!.querySelector<HTMLElement>('button.done')!.click();
        });

        expect(modal()).toBeNull();
      });
    });

    it('adds no ︿ row to a page where no column is long', async () => {
      const fixture = await render([nine, seventh]);

      expect(element(fixture).querySelector('.fold-row')).toBeNull();
      expect(element(fixture).querySelector('.folded')).toBeNull();
    });
  });

  describe('on a phone', () => {
    // A small layout: every box starts 400 px down the page, its times 32 px tall and 8 px apart
    // inside 8 px of padding and a 1 px border, and the step's buttons end 100 px below the
    // longest box. Ten px under the buttons stay free.
    const BELOW = 100;
    let boxTop: number;
    let innerHeight: number;
    let resized: (() => void) | undefined;

    function boxHeight(box: HTMLElement): number {
      const set = Number.parseFloat(box.style.blockSize);
      return Number.isNaN(set) ? 2 + 16 + box.children.length * 40 - 8 : set;
    }

    /** The page's column boxes, not the modal's. */
    function boxes(): HTMLElement[] {
      return Array.from(document.querySelectorAll<HTMLElement>('.columns .blocks'));
    }

    beforeEach(() => {
      boxTop = 400;
      innerHeight = 600;
      resized = undefined;
      // Whatever the browser sees resize (the arrow rows, a font, the step above folding).
      window.ResizeObserver = class implements ResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resized = () => {
            callback([], this);
          };
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      };
      Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => innerHeight });
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        const lowest = Math.max(...boxes().map((box) => boxTop + boxHeight(box)));
        // The modal's column, in the dialog over the page: down to near the screen's bottom.
        if (this.classList.contains('blocks') && this.closest('dialog') !== null) {
          return { top: 50, bottom: 900 } as DOMRect;
        }
        if (this.classList.contains('blocks')) {
          return { top: boxTop, bottom: boxTop + boxHeight(this) } as DOMRect;
        }
        if (this.classList.contains('nav')) return { bottom: lowest + BELOW } as DOMRect;
        const box = this.parentElement;
        if (box?.classList.contains('blocks')) {
          const top = boxTop + 9 + Array.from(box.children).indexOf(this) * 40 - box.scrollTop;
          return { top, bottom: top + 32 } as DOMRect;
        }
        return { top: 0, bottom: 0 } as DOMRect;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      Reflect.deleteProperty(window, 'innerHeight');
      Reflect.deleteProperty(window, 'ResizeObserver');
    });

    const threeTimes = ['09:00', '10:00', '11:00'].map((at): Option => ({
      id: at,
      dates: { kind: 'single', date: '2026-07-06' },
      time: { kind: 'single', at },
    }));

    it('folds a column the screen cannot hold, so the step’s buttons stay in sight', async () => {
      const fixture = await render(threeTimes);
      await fixture.whenStable();

      // 600 − 10 − 400 − 100 leaves 90 px: two times, under their arrows.
      expect(boxes()[0]?.classList).toContain('folded');
      expect(boxes()[0]?.style.blockSize).not.toBe('');
      expect(document.querySelectorAll('.fold-arrow')).toHaveLength(2);
    });

    it('lets it grow again when the screen grows', async () => {
      const fixture = await render(threeTimes);
      await fixture.whenStable();

      innerHeight = 2000;
      window.dispatchEvent(new Event('resize'));
      await fixture.whenStable();

      expect(boxes()[0]?.classList).not.toContain('folded');
    });

    it('measures again when the page around it changes size', async () => {
      innerHeight = 650;
      const fixture = await render(threeTimes);
      await fixture.whenStable();
      expect(boxes()[0]?.classList).not.toContain('folded');

      // The rows above grow: the boxes now start 60 px lower.
      boxTop = 460;
      resized?.();
      await fixture.whenStable();

      expect(boxes()[0]?.classList).toContain('folded');
    });

    it('measures only the page’s columns, not the day open in the modal', async () => {
      HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
      const fixture = await render(threeTimes);
      await fixture.whenStable();
      await act(fixture, () => {
        document.querySelector<HTMLElement>('.header.expandable')!.click();
      });

      // The modal's column reaches far below the page's; measuring it would unfold the page's.
      resized?.();
      await fixture.whenStable();

      expect(boxes()[0]?.classList).toContain('folded');
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    });

    it('keeps the fold of 10 units on a wider screen, whatever its height', async () => {
      screen.set(WIDE, true);
      const fixture = await render(threeTimes);
      await fixture.whenStable();

      expect(boxes()[0]?.classList).not.toContain('folded');
    });
  });
});
