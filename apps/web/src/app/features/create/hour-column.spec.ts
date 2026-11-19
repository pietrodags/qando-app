import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { installTestScreen } from '../../../test/media-queries';
import { type DayTime, type DayTimes, NO_TIMES } from './day-times';
import { HourColumn } from './hour-column';
import columnStyles from './hour-column.scss' with { loader: 'text' };

// As the stylesheet lays them out: rows of 35 px, 6 px apart.
const ROW = 35;
const GAP = 6;

function at(time: string): DayTime {
  return { kind: 'single', at: time };
}

@Component({
  imports: [HourColumn],
  template: `<app-hour-column [(times)]="times" [full]="full" [room]="room()" />`,
})
class Host {
  readonly times = signal<DayTimes>(NO_TIMES);
  readonly full = signal(false);
  readonly room = signal<number | null>(null);
}

describe('HourColumn', () => {
  let fixture: ComponentFixture<Host>;
  let scrolls: ScrollToOptions[];

  beforeEach(() => {
    installTestScreen();
    TestBed.configureTestingModule({ imports: [Host], providers: [provideI18n()] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (fixture.nativeElement as HTMLElement).remove();
  });

  /** The list lays its rows out as a browser would, scrolled `scrollTop` down. */
  function layOut(): void {
    const top = 100;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this === list()) return { top, bottom: top + list().clientHeight } as DOMRect;
      const index = Array.from(list().children).indexOf(this);
      // The column itself, and what is not a row: 60 px above the list and 10 px before its rows.
      if (index === -1) return { top: top - 60, bottom: top - 60, left: 100 } as DOMRect;
      const start = top + index * (ROW + GAP) - list().scrollTop;
      return { top: start, bottom: start + ROW, left: 110, width: 70, height: ROW } as DOMRect;
    });
    Object.defineProperty(list(), 'scrollHeight', { value: 24 * ROW + 23 * GAP });
    Object.defineProperty(list(), 'clientHeight', {
      get: () => Number.parseFloat(list().style.blockSize),
    });
    scrolls = [];
    list().scrollTo = ((options: ScrollToOptions) => {
      scrolls.push(options);
    }) as HTMLElement['scrollTo'];
  }

  async function render(times: readonly string[] = [], room: number | null = null): Promise<void> {
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.times.set({ marked: times.map(at), saved: [] });
    fixture.componentInstance.room.set(room);
    // In the page: the focus is followed.
    document.body.append(fixture.nativeElement as HTMLElement);
    layOut();
    await fixture.whenStable();
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function list(): HTMLElement {
    return host().querySelector<HTMLElement>('.hours')!;
  }

  function hours(): HTMLButtonElement[] {
    return [...host().querySelectorAll<HTMLButtonElement>('button.time')];
  }

  /** The hour that shows a time, as "18:00". */
  function hour(time: string): HTMLButtonElement {
    const found = hours().find((each) => each.textContent.trim() === time);
    if (!found) throw new Error(`No hour shows ${time}`);
    return found;
  }

  function marked(): string[] {
    return hours()
      .filter((each) => each.getAttribute('aria-pressed') === 'true')
      .map((each) => each.textContent.trim());
  }

  function arrows(): HTMLButtonElement[] {
    return [...host().querySelectorAll<HTMLButtonElement>('button.quarter')];
  }

  function arrow(name: string): HTMLButtonElement {
    const found = arrows().find((each) => each.getAttribute('aria-label') === name);
    if (!found) throw new Error(`No arrow is named ${name}`);
    return found;
  }

  function fold(sign: '︿' | '﹀'): HTMLButtonElement {
    return [...host().querySelectorAll<HTMLButtonElement>('button.fold')].find(
      (each) => each.textContent.trim() === sign,
    )!;
  }

  async function click(button: HTMLButtonElement): Promise<void> {
    button.click();
    await fixture.whenStable();
  }

  /** A key pressed on what has the focus; answers whether the browser was kept from acting on it. */
  async function key(name: string): Promise<boolean> {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    document.activeElement?.dispatchEvent(event);
    await fixture.whenStable();
    return event.defaultPrevented;
  }

  /** The times the column leaves its day, a range as "10:00→13:00". */
  function saved(): readonly string[] {
    const times = fixture.componentInstance.times();
    expect(times.saved).toEqual([]);
    return times.marked.map((time) =>
      time.kind === 'single' ? time.at : `${time.start}→${time.end}`,
    );
  }

  it('shows the 24 hours of the day, none marked, and is grey while the day has no time', async () => {
    await render();

    expect(hours().map((each) => each.textContent.trim())).toEqual(
      Array.from({ length: 24 }, (_, index) => `${String(index)}:00`),
    );
    expect(hours().map((each) => each.getAttribute('aria-pressed'))).toEqual(
      Array.from({ length: 24 }, () => 'false'),
    );
    expect(arrows()).toEqual([]);
    expect(list().classList).toContain('empty');
  });

  it('names each hour by the time it shows, whatever the browser makes of its two parts', async () => {
    await render(['18:15']);

    expect(hour('9:00').getAttribute('aria-label')).toBe('9:00');
    expect(hour('18:15').getAttribute('aria-label')).toBe('18:15');
  });

  it('marks a time on the hour with a press, and the column is no longer grey', async () => {
    await render();
    await click(hour('18:00'));
    await click(hour('9:00'));

    expect(saved()).toEqual(['09:00', '18:00']);
    expect(marked()).toEqual(['9:00', '18:00']);
    expect(list().classList).not.toContain('empty');
  });

  it('unmarks a marked time with a press, whatever its quarter', async () => {
    await render(['09:00', '18:15']);
    await click(hour('18:15'));

    expect(saved()).toEqual(['09:00']);
    expect(marked()).toEqual(['9:00']);
  });

  it('gives a marked time its two arrows, named after it and out of the Tab order', async () => {
    await render(['18:15']);

    expect(arrows().map((each) => each.getAttribute('aria-label'))).toEqual([
      '18:15, quince minutos antes',
      '18:15, quince minutos después',
    ]);
    expect(arrows().map((each) => each.tabIndex)).toEqual([-1, -1]);
    expect(arrows().map((each) => each.type)).toEqual(['button', 'button']);
    expect(hour('18:15').closest('.row')!.classList).toContain('marked');
    expect(hour('17:00').closest('.row')!.classList).not.toContain('marked');
  });

  it('moves a time a quarter later or earlier with its arrows', async () => {
    await render(['18:15']);
    await click(arrow('18:15, quince minutos después'));
    expect(saved()).toEqual(['18:30']);

    await click(arrow('18:30, quince minutos antes'));
    await click(arrow('18:15, quince minutos antes'));
    expect(saved()).toEqual(['18:00']);
  });

  it('turns an arrow off where the hour ends, and its press leaves the time', async () => {
    await render(['10:00', '18:45']);

    expect(arrow('10:00, quince minutos antes').getAttribute('aria-disabled')).toBe('true');
    expect(arrow('10:00, quince minutos después').getAttribute('aria-disabled')).toBe('false');
    expect(arrow('18:45, quince minutos antes').getAttribute('aria-disabled')).toBe('false');
    expect(arrow('18:45, quince minutos después').getAttribute('aria-disabled')).toBe('true');

    await click(arrow('10:00, quince minutos antes'));
    await click(arrow('18:45, quince minutos después'));
    expect(saved()).toEqual(['10:00', '18:45']);
  });

  it('marks no further time when the day takes no more, and still unmarks', async () => {
    await render(['10:00']);
    fixture.componentInstance.full.set(true);
    await fixture.whenStable();
    await click(hour('11:00'));
    expect(saved()).toEqual(['10:00']);

    await click(hour('10:00'));
    expect(saved()).toEqual([]);
  });

  describe('with the keyboard', () => {
    function tabStops(): string[] {
      return hours()
        .filter((each) => each.tabIndex === 0)
        .map((each) => each.textContent.trim());
    }

    it('is one Tab stop, at 9:00 until the focus moves to another hour', async () => {
      await render();
      expect(tabStops()).toEqual(['9:00']);

      hour('14:00').focus();
      await fixture.whenStable();

      expect(tabStops()).toEqual(['14:00']);
    });

    it('takes the focus an hour down with ↓ and up with ↑, without scrolling the page', async () => {
      await render();
      hour('9:00').focus();

      expect(await key('ArrowDown')).toBe(true);
      expect(await key('ArrowDown')).toBe(true);
      expect(document.activeElement).toBe(hour('11:00'));

      expect(await key('ArrowUp')).toBe(true);
      expect(document.activeElement).toBe(hour('10:00'));
    });

    it('stops at the first and the last hour of the day', async () => {
      await render();
      hour('0:00').focus();
      await key('ArrowUp');
      expect(document.activeElement).toBe(hour('0:00'));

      hour('23:00').focus();
      await key('ArrowDown');
      expect(document.activeElement).toBe(hour('23:00'));
    });

    it('moves the time with the focus a quarter with → and ←, the focus staying on it', async () => {
      await render(['11:00']);
      hour('11:00').focus();

      expect(await key('ArrowRight')).toBe(true);
      expect(await key('ArrowRight')).toBe(true);
      expect(saved()).toEqual(['11:30']);

      expect(await key('ArrowLeft')).toBe(true);
      expect(saved()).toEqual(['11:15']);
      expect(document.activeElement).toBe(hour('11:15'));
    });

    it('leaves other keys to the browser', async () => {
      await render(['11:00']);
      hour('11:00').focus();

      expect(await key('Tab')).toBe(false);
      expect(saved()).toEqual(['11:00']);
    });
  });

  describe('its list', () => {
    const rows = (count: number): string => `${String(count * ROW + (count - 1) * GAP)}px`;

    it('shows 9 hours and opens at 9:00', async () => {
      await render();

      expect(list().style.blockSize).toBe(rows(9));
      expect(list().scrollTop).toBe(9 * (ROW + GAP));
    });

    it('shows the hours that fit in the room it is given', async () => {
      await render([], 5 * (ROW + GAP));

      expect(list().style.blockSize).toBe(rows(5));
    });

    it('shows 4 hours at least, however little room there is', async () => {
      await render([], 10);

      expect(list().style.blockSize).toBe(rows(4));
    });

    it('has ︿ and ﹀ for the pointer only: screen readers and the Tab key pass them by', async () => {
      await render();

      for (const each of [fold('︿'), fold('﹀')]) {
        expect(each.getAttribute('aria-hidden')).toBe('true');
        expect(each.tabIndex).toBe(-1);
        expect(each.type).toBe('button');
      }
    });

    it('scrolls an hour down as ﹀ is pressed and back up as ︿ is, also before it rests', async () => {
      await render();
      fold('﹀').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      fold('﹀').dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
      fold('︿').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      fold('︿').dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));

      expect(scrolls.map((each) => each.top)).toEqual([10 * (ROW + GAP), 9 * (ROW + GAP)]);
    });

    it('greys ︿ at midnight and ﹀ at the last hours', async () => {
      await render();
      expect(fold('︿').classList).not.toContain('spent');
      expect(fold('﹀').classList).not.toContain('spent');

      list().scrollTop = 0;
      list().dispatchEvent(new Event('scroll'));
      await fixture.whenStable();
      expect(fold('︿').classList).toContain('spent');
      expect(fold('﹀').classList).not.toContain('spent');

      list().scrollTop = list().scrollHeight - list().clientHeight;
      list().dispatchEvent(new Event('scroll'));
      await fixture.whenStable();
      expect(fold('︿').classList).not.toContain('spent');
      expect(fold('﹀').classList).toContain('spent');
    });
  });

  describe('a time range', () => {
    const range = (start: string, end: string): DayTime => ({ kind: 'range', start, end });
    const END_TIP = 'Elige la última hora del rango.';

    async function renderTimes(...times: DayTime[]): Promise<void> {
      await render();
      fixture.componentInstance.times.set({ marked: times, saved: [] });
      await fixture.whenStable();
    }

    function rowOf(time: string): HTMLElement {
      return hour(time).parentElement!;
    }

    /** The hours of the time or range being drawn, as they show. */
    function live(): string[] {
      return hours()
        .filter((each) => each.parentElement?.classList.contains('live'))
        .map((each) => each.textContent.trim());
    }

    function tip(): string | null {
      return host().querySelector('app-tooltip')?.textContent.trim() ?? null;
    }

    function heard(): string {
      return host().querySelector('[role="status"]')?.textContent.trim() ?? '';
    }

    /** The height of the middle of an hour's row on the screen, where the list is scrolled. */
    function middleOf(hourOfDay: number): number {
      return 100 + hourOfDay * (ROW + GAP) - list().scrollTop + ROW / 2;
    }

    function pointer(target: EventTarget, type: string, y: number, pointerType = 'mouse'): void {
      const event = new MouseEvent(type, {
        bubbles: true,
        clientX: 140,
        clientY: y,
        buttons: type === 'pointerup' ? 0 : 1,
      });
      Object.defineProperty(event, 'pointerType', { value: pointerType });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      target.dispatchEvent(event);
    }

    /** The mouse is pressed on an hour and taken to another, still down. */
    async function dragTo(from: string, to: number): Promise<void> {
      pointer(hour(from), 'pointerdown', middleOf(Number(from.split(':')[0])));
      pointer(document, 'pointermove', middleOf(to));
      await fixture.whenStable();
    }

    async function release(): Promise<void> {
      pointer(document, 'pointerup', 0);
      await fixture.whenStable();
    }

    async function shiftEnter(): Promise<boolean> {
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.activeElement?.dispatchEvent(event);
      await fixture.whenStable();
      return event.defaultPrevented;
    }

    /** Enter on the hour with the focus: the browser clicks it. */
    async function enter(): Promise<void> {
      await click(document.activeElement as HTMLButtonElement);
    }

    it('marks all its hours: the two ends with their minutes, the hours between without', async () => {
      await renderTimes(at('09:15'), range('10:30', '13:45'));

      expect(marked()).toEqual(['9:15', '10:30', '11', '12', '13:45']);
      expect(rowOf('9:15').classList.contains('single')).toBe(true);
      expect(rowOf('10:30').classList.contains('start')).toBe(true);
      expect(rowOf('11').classList.contains('between')).toBe(true);
      expect(rowOf('12').classList.contains('between')).toBe(true);
      expect(rowOf('13:45').classList.contains('end')).toBe(true);
      expect(rowOf('14:00').className).toBe('row');
    });

    it('names each of its hours after the hour and the range', async () => {
      await renderTimes(range('10:30', '13:45'));

      expect(hour('10:30').getAttribute('aria-label')).toBe('10:30, rango de 10:30 a 13:45');
      expect(hour('11').getAttribute('aria-label')).toBe('11:00, rango de 10:30 a 13:45');
      expect(hour('13:45').getAttribute('aria-label')).toBe('13:45, rango de 10:30 a 13:45');
    });

    it('gives each end its two arrows, named after its time, and none to the hours between', async () => {
      await renderTimes(range('10:30', '13:45'));

      expect(arrows().map((each) => each.getAttribute('aria-label'))).toEqual([
        '10:30, quince minutos antes',
        '10:30, quince minutos después',
        '13:45, quince minutos antes',
        '13:45, quince minutos después',
      ]);
      expect(arrows().map((each) => each.getAttribute('aria-disabled'))).toEqual([
        'false',
        'false',
        'false',
        'true',
      ]);
    });

    it('moves an end a quarter with its arrows, or with → and ← on it', async () => {
      await renderTimes(range('10:30', '13:30'));

      await click(arrow('10:30, quince minutos antes'));
      await click(arrow('13:30, quince minutos después'));
      expect(saved()).toEqual(['10:15→13:45']);

      hour('13:45').focus();
      await key('ArrowLeft');
      hour('11').focus();
      await key('ArrowRight');
      expect(saved()).toEqual(['10:15→13:30']);
    });

    it('is removed by a press on any of its hours', async () => {
      await renderTimes(at('09:00'), range('10:30', '13:45'));

      await click(hour('12'));

      expect(saved()).toEqual(['09:00']);
    });

    it('is drawn while the mouse is dragged over the hours, and made when it is released', async () => {
      await render(['12:15']);

      await dragTo('10:00', 13);
      expect(marked()).toEqual(['10:00', '11', '12', '13:00']);
      expect(live()).toEqual(['10:00', '11', '12', '13:00']);
      expect(saved()).toEqual(['12:15']);

      await release();
      expect(saved()).toEqual(['10:00→13:00']);
      expect(marked()).toEqual(['10:00', '11', '12', '13:00']);
      expect(live()).toEqual([]);
    });

    it('takes the click that follows the release as the drag’s own', async () => {
      await render();
      await dragTo('10:00', 13);

      // The click comes with the release, before anything else.
      pointer(document, 'pointerup', 0);
      await click(hour('13:00'));

      expect(saved()).toEqual(['10:00→13:00']);
    });

    it('is no longer grey from the first hour drawn', async () => {
      await render();
      expect(list().classList.contains('empty')).toBe(true);

      // Far enough for a drag to begin, and still on the hour pressed.
      pointer(hour('10:00'), 'pointerdown', middleOf(10));
      pointer(document, 'pointermove', middleOf(10) + 9);
      await fixture.whenStable();

      expect(live()).toEqual(['10:00']);
      expect(list().classList.contains('empty')).toBe(false);
    });

    it('draws only the range of a drag among the other times', async () => {
      await renderTimes(at('09:30'), range('15:00', '16:00'));

      await dragTo('11:00', 12);

      expect(marked()).toEqual(['9:30', '11:00', '12:00', '15:00', '16:00']);
      expect(live()).toEqual(['11:00', '12:00']);
    });

    it('draws nothing dragged from between its ends, and stays as it was', async () => {
      await renderTimes(range('10:00', '13:00'));

      await dragTo('11', 15);
      expect(live()).toEqual([]);
      expect(marked()).toEqual(['10:00', '11', '12', '13:00']);

      await release();
      expect(saved()).toEqual(['10:00→13:00']);
    });

    it('is not drawn when the day takes no more times', async () => {
      await render(['09:00']);
      fixture.componentInstance.full.set(true);

      await dragTo('10:00', 12);
      expect(marked()).toEqual(['9:00']);

      await release();
      expect(saved()).toEqual(['09:00']);
    });

    it('is forgotten when its drag is given up', async () => {
      await render(['09:00']);
      await dragTo('10:00', 12);

      pointer(document, 'pointercancel', 0);
      await fixture.whenStable();

      expect(marked()).toEqual(['9:00']);
      expect(saved()).toEqual(['09:00']);
    });

    it('presses, holds and moves nothing while a drag is going on', async () => {
      await renderTimes(range('10:00', '13:00'));
      await dragTo('13:00', 15);

      // Enter on an hour of the range, Shift+Enter and an arrow, with the mouse still down.
      await click(hour('11'));
      hour('11').focus();
      await shiftEnter();
      await key('ArrowRight');
      await click(arrow('10:00, quince minutos después'));
      expect(tip()).toBeNull();
      expect(arrows().map((each) => each.getAttribute('aria-disabled'))).toEqual([
        'true',
        'true',
        'true',
        'true',
      ]);

      await release();
      expect(saved()).toEqual(['10:00→15:00']);
    });

    it('moves no minutes while an hour is held, of the range drawn or of the times under it', async () => {
      await render(['12:00']);
      hour('10:00').focus();
      await shiftEnter();
      await key('ArrowDown');
      await key('ArrowDown');

      await key('ArrowRight');
      await click(arrow('12:00, quince minutos después'));
      expect(arrows().map((each) => each.getAttribute('aria-disabled'))).toEqual([
        'true',
        'true',
        'true',
        'true',
      ]);

      await key('Escape');
      expect(saved()).toEqual(['12:00']);
      expect(arrow('12:00, quince minutos después').getAttribute('aria-disabled')).toBe('false');
    });

    describe('with a finger', () => {
      beforeEach(async () => {
        await render(['14:15']);
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
        Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
      });

      /** The finger is put on an hour and stays there for a while. */
      function restOn(time: string, ms: number): void {
        pointer(hour(time), 'pointerdown', middleOf(Number(time.split(':')[0])), 'touch');
        fixture.detectChanges();
        vi.advanceTimersByTime(ms);
        fixture.detectChanges();
      }

      function lift(from: string): void {
        pointer(hour(from), 'pointerup', 0, 'touch');
        fixture.detectChanges();
      }

      it('begins once the finger has rested half a second on an hour, which says it is held', () => {
        restOn('10:00', 499);
        expect(rowOf('10:00').classList.contains('holding')).toBe(true);
        expect(live()).toEqual([]);

        vi.advanceTimersByTime(1);
        fixture.detectChanges();
        expect(rowOf('10:00').classList.contains('holding')).toBe(false);
        expect(live()).toEqual(['10:00']);
      });

      it('draws a ring over the row the finger rests on, until it is held', () => {
        const raised: Element[] = [];
        // jsdom has no popovers: the browser's part, standing in.
        HTMLElement.prototype.showPopover = function (this: HTMLElement) {
          raised.push(this);
        };
        restOn('10:00', 499);
        const ring = host().querySelector<HTMLElement>('app-hold-ring');

        expect(ring?.getAttribute('aria-hidden')).toBe('true');
        expect(ring?.style.getPropertyValue('--hold-duration')).toBe('500ms');
        // Drawn over the whole page, where the window on the columns does not cut it.
        expect(raised).toEqual([ring]);
        // As large as the row, and placed where it is on screen: the list, 100 px down, opens at
        // 9:00, so 10:00 is its second row, a row and a gap further down.
        expect(ring?.style.insetBlockStart).toBe(`${String(100 + ROW + GAP)}px`);
        expect(ring?.style.insetInlineStart).toBe('110px');
        expect(ring?.style.inlineSize).toBe('70px');
        expect(ring?.style.blockSize).toBe(`${String(ROW)}px`);

        vi.advanceTimersByTime(1);
        fixture.detectChanges();
        expect(host().querySelector('app-hold-ring')).toBeNull();
      });

      it('draws no ring between the ends of a range, where nothing is held', () => {
        fixture.componentInstance.times.set({ marked: [range('10:00', '12:00')], saved: [] });
        fixture.detectChanges();

        restOn('11', 200);
        expect(host().querySelector('app-hold-ring')).toBeNull();

        vi.advanceTimersByTime(300);
        pointer(document, 'pointermove', middleOf(15), 'touch');
        fixture.detectChanges();
        expect(live()).toEqual([]);
      });

      it('follows the finger that slides after its rest, and is made where it lifts', () => {
        restOn('10:00', 500);
        pointer(document, 'pointermove', middleOf(12), 'touch');
        fixture.detectChanges();
        expect(live()).toEqual(['10:00', '11', '12:00']);

        lift('10:00');
        expect(saved()).toEqual(['10:00→12:00', '14:15']);
      });

      it('leaves a time on the hour where a finger rested and lifted without sliding', () => {
        restOn('10:00', 500);
        lift('10:00');
        hour('10:00').click();
        fixture.detectChanges();

        expect(saved()).toEqual(['10:00', '14:15']);
      });

      it('leaves a marked time as it was when the finger that rested on it lifts', () => {
        restOn('14:15', 500);
        lift('14:15');
        hour('14:15').click();
        fixture.detectChanges();

        expect(saved()).toEqual(['14:15']);
      });

      it('marks a time with a tap, as a press does', () => {
        restOn('10:00', 200);
        lift('10:00');
        hour('10:00').click();
        fixture.detectChanges();

        expect(saved()).toEqual(['10:00', '14:15']);
      });
    });

    describe('with the keyboard', () => {
      it('holds an hour with Shift+Enter: a tip over it, the same words for screen readers', async () => {
        await render();
        expect(heard()).toBe('');
        hour('10:00').focus();

        expect(await shiftEnter()).toBe(true);

        expect(tip()).toBe(END_TIP);
        expect(host().querySelector('app-tooltip')?.getAttribute('aria-hidden')).toBe('true');
        expect(heard()).toBe(END_TIP);
        expect(live()).toEqual(['10:00']);
        expect(saved()).toEqual([]);
      });

      it('draws the range to the hour the focus goes to, the tip out of the way', async () => {
        await render();
        hour('10:00').focus();
        await shiftEnter();

        await key('ArrowDown');
        await key('ArrowDown');

        expect(live()).toEqual(['10:00', '11', '12:00']);
        expect(tip()).toBeNull();
        expect(heard()).toBe(END_TIP);
        expect(saved()).toEqual([]);
      });

      it('makes the range with Enter on its last hour, and holds no more', async () => {
        await render();
        hour('10:00').focus();
        await shiftEnter();
        await key('ArrowUp');

        await enter();

        expect(saved()).toEqual(['09:00→10:00']);
        expect(live()).toEqual([]);
        expect(heard()).toBe('');
        expect(document.activeElement).toBe(hour('9:00'));
      });

      it('leaves a time on the hour held when Enter is pressed on it', async () => {
        await render();
        hour('10:00').focus();
        await shiftEnter();

        await enter();

        expect(saved()).toEqual(['10:00']);
        expect(tip()).toBeNull();
      });

      it('lets go with Escape, and the next press is a press again', async () => {
        await render();
        hour('10:00').focus();
        await shiftEnter();
        await key('ArrowDown');

        await key('Escape');
        expect(marked()).toEqual([]);
        expect(heard()).toBe('');

        await enter();
        expect(saved()).toEqual(['11:00']);
      });

      it('holds the end of a range, to move it', async () => {
        await renderTimes(range('10:00', '13:15'));
        hour('13:15').focus();
        await shiftEnter();
        await key('ArrowDown');

        await enter();

        expect(saved()).toEqual(['10:00→14:15']);
      });

      it('holds nothing between the ends of a range', async () => {
        await renderTimes(range('10:00', '13:00'));
        hour('11').focus();

        await shiftEnter();
        expect(tip()).toBeNull();
        expect(heard()).toBe('');

        await key('ArrowDown');
        await enter();
        expect(saved()).toEqual([]);
      });

      it('takes the tip away when the list scrolls under it', async () => {
        await render();
        hour('10:00').focus();
        await shiftEnter();

        list().dispatchEvent(new Event('scroll'));
        await fixture.whenStable();

        expect(tip()).toBeNull();
        expect(heard()).toBe(END_TIP);
      });

      it('shows the tip again for the next hour held', async () => {
        await render();
        hour('10:00').focus();
        await shiftEnter();
        list().dispatchEvent(new Event('scroll'));
        await key('Escape');

        await shiftEnter();

        expect(tip()).toBe(END_TIP);
      });

      it('makes what is drawn when the focus leaves the column', async () => {
        await render();
        hour('10:00').focus();
        await shiftEnter();
        await key('ArrowDown');

        hour('11:00').dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        await fixture.whenStable();

        expect(saved()).toEqual(['10:00→11:00']);
        expect(heard()).toBe('');
      });

      it('goes on holding while the focus moves within the column', async () => {
        await render();
        hour('10:00').focus();
        await shiftEnter();

        hour('10:00').dispatchEvent(
          new FocusEvent('focusout', { bubbles: true, relatedTarget: hour('11:00') }),
        );
        await fixture.whenStable();

        expect(heard()).toBe(END_TIP);
        expect(saved()).toEqual([]);
      });

      it('gives way to a drag of the mouse', async () => {
        await render();
        hour('10:00').focus();
        await shiftEnter();

        await dragTo('14:00', 15);
        expect(live()).toEqual(['14:00', '15:00']);
        expect(heard()).toBe('');

        await release();
        expect(saved()).toEqual(['14:00→15:00']);
      });
    });
  });

  it('is styled only with tokens', () => {
    expect(literalValues(columnStyles)).toEqual([]);
  });
});
