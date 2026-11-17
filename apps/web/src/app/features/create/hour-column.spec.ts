import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { installTestScreen } from '../../../test/media-queries';
import type { DayTime } from './day-times';
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
  template: `<app-hour-column [(times)]="times" [full]="full()" [room]="room()" />`,
})
class Host {
  readonly times = signal<readonly DayTime[]>([]);
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
      if (this === list()) return { top } as DOMRect;
      const index = Array.from(list().children).indexOf(this);
      const start = top + index * (ROW + GAP) - list().scrollTop;
      return { top: start, bottom: start + ROW } as DOMRect;
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
    fixture.componentInstance.times.set(times.map(at));
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

  function saved(): readonly string[] {
    return fixture.componentInstance.times().map((time) => time.at);
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

    it('scrolls an hour up or down as ︿ or ﹀ is pressed', async () => {
      await render();
      fold('﹀').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      fold('﹀').dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
      fold('︿').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      fold('︿').dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));

      expect(scrolls.map((each) => each.top)).toEqual([10 * (ROW + GAP), 8 * (ROW + GAP)]);
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

  it('is styled only with tokens', () => {
    expect(literalValues(columnStyles)).toEqual([]);
  });
});
