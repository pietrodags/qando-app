import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { DayDrag, type DayDragSpan, SIDE_HOLD_MS } from './day-drag';

@Component({
  imports: [DayDrag],
  template: `<div
      class="grid"
      appDayDrag
      (dragging)="drags.push($event)"
      (dropped)="drops.push($event)"
      (sideHeld)="sides.push($event)"
    >
      <button type="button" disabled>15</button>
      <button type="button" data-date="2026-06-16" (click)="clicks.push('16')">
        <span>16</span>
      </button>
      <button type="button" data-date="2026-06-17" (click)="clicks.push('17')">17</button>
      <button type="button" data-date="2026-06-18" (click)="clicks.push('18')">18</button>
    </div>
    <button type="button" class="outside" data-date="2026-06-30">30</button>`,
})
class Host {
  readonly drags: (DayDragSpan | null)[] = [];
  readonly drops: DayDragSpan[] = [];
  readonly sides: number[] = [];
  readonly clicks: string[] = [];
}

interface Pointer {
  x?: number;
  y?: number;
  buttons?: number;
  button?: number;
  pointerType?: string;
}

describe('DayDrag', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeEach(() => {
    vi.useFakeTimers();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    host = fixture.componentInstance;
    // The element is 300 px wide, from 100 to 400.
    find('.grid').getBoundingClientRect = () => new DOMRect(100, 0, 300, 200);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function find(selector: string): HTMLElement {
    const found = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`No ${selector}`);
    return found;
  }

  const day = (number: number): HTMLElement => find(`[data-date="2026-06-${String(number)}"]`);

  function fire(target: Element | Document, type: string, init: Pointer = {}): void {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: init.x ?? 200,
      clientY: init.y ?? 50,
      buttons: init.buttons ?? 1,
      button: init.button ?? 0,
    });
    Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'mouse' });
    target.dispatchEvent(event);
  }

  /** The mouse is pressed on the 16th, at 200 × 50. */
  function pressOn16(init: Pointer = {}): void {
    fire(day(16), 'pointerdown', init);
  }

  it('begins once the mouse has moved more than 8 px from where it was pressed', () => {
    pressOn16();
    fire(day(16), 'pointermove', { x: 208 });
    expect(host.drags).toEqual([]);

    fire(day(16), 'pointermove', { x: 200, y: 58.5 });
    expect(host.drags).toEqual([{ from: '2026-06-16', to: '2026-06-16' }]);
  });

  it('follows the mouse from day to day, telling each day once', () => {
    pressOn16();
    fire(day(17), 'pointermove', { x: 240 });
    fire(day(17), 'pointermove', { x: 245 });
    fire(day(18), 'pointermove', { x: 280 });
    fire(day(17), 'pointermove', { x: 240 });

    expect(host.drags).toEqual([
      { from: '2026-06-16', to: '2026-06-17' },
      { from: '2026-06-16', to: '2026-06-18' },
      { from: '2026-06-16', to: '2026-06-17' },
    ]);
    expect(host.drops).toEqual([]);
  });

  it('reads the day from an element inside it, where it is pressed and where it is dragged', () => {
    fire(find('span'), 'pointerdown');
    fire(day(17), 'pointermove', { x: 240 });
    fire(find('span'), 'pointermove', { x: 201 });

    expect(host.drags.at(-1)).toEqual({ from: '2026-06-16', to: '2026-06-16' });
  });

  it('stays on its last day while the mouse is off the days or on a day of another element', () => {
    pressOn16();
    fire(day(17), 'pointermove', { x: 240 });
    fire(find('button[disabled]'), 'pointermove', { x: 150 });
    fire(find('.outside'), 'pointermove', { x: 250, y: 300 });
    fire(document, 'pointermove', { x: 250, y: 300 });

    expect(host.drags).toEqual([{ from: '2026-06-16', to: '2026-06-17' }]);
  });

  it('ends on the last day when the button is released, anywhere in the page', () => {
    pressOn16();
    fire(day(18), 'pointermove', { x: 280 });
    fire(find('.outside'), 'pointerup', { buttons: 0 });

    expect(host.drops).toEqual([{ from: '2026-06-16', to: '2026-06-18' }]);
    expect(host.drags).toHaveLength(1);

    // The drag is over: the mouse moving on is not followed.
    fire(day(17), 'pointermove', { x: 240 });
    expect(host.drags).toHaveLength(1);
  });

  it('swallows the click that follows a drag, and only that one', () => {
    pressOn16();
    fire(day(17), 'pointermove', { x: 240 });
    fire(day(17), 'pointerup', { buttons: 0 });
    day(17).click();
    day(17).click();

    expect(host.clicks).toEqual(['17']);
  });

  it('swallows no later click when none follows the drag', () => {
    pressOn16();
    fire(day(17), 'pointermove', { x: 240 });
    fire(find('.outside'), 'pointerup', { buttons: 0 });
    vi.advanceTimersByTime(0);
    day(18).click();

    expect(host.clicks).toEqual(['18']);
  });

  it('leaves a press that does not move as a click', () => {
    pressOn16();
    fire(day(16), 'pointermove', { x: 203 });
    fire(day(16), 'pointerup', { buttons: 0 });
    day(16).click();

    expect(host.clicks).toEqual(['16']);
    expect([host.drags, host.drops]).toEqual([[], []]);
    // The press is over: a later move with the button down elsewhere is no drag.
    fire(day(18), 'pointermove', { x: 280 });
    expect(host.drags).toEqual([]);
  });

  it.each([
    ['a finger', { pointerType: 'touch' }],
    ['a pen', { pointerType: 'pen' }],
    ['the secondary button', { button: 2 }],
  ])('does not drag with %s', (_, init) => {
    pressOn16(init);
    fire(day(18), 'pointermove', { x: 280 });
    fire(day(18), 'pointerup', { buttons: 0 });

    expect([host.drags, host.drops]).toEqual([[], []]);
  });

  it('does not drag from a press off the days', () => {
    fire(find('button[disabled]'), 'pointerdown');
    fire(day(18), 'pointermove', { x: 280 });
    fire(find('.outside'), 'pointerdown');
    fire(day(18), 'pointermove', { x: 280 });

    expect(host.drags).toEqual([]);
  });

  it('gives the drag up when the mouse moves with no button down: the release was lost', () => {
    pressOn16();
    fire(day(17), 'pointermove', { x: 240 });
    fire(day(18), 'pointermove', { x: 280, buttons: 0 });

    expect(host.drags).toEqual([{ from: '2026-06-16', to: '2026-06-17' }, null]);

    fire(day(18), 'pointermove', { x: 280 });
    fire(day(18), 'pointerup', { buttons: 0 });
    expect(host.drops).toEqual([]);
    day(18).click();
    expect(host.clicks).toEqual(['18']);
  });

  it('follows a drag made with another button down too', () => {
    pressOn16();
    fire(day(17), 'pointermove', { x: 240, buttons: 3 });

    expect(host.drags).toEqual([{ from: '2026-06-16', to: '2026-06-17' }]);
  });

  it('gives the drag up when the browser cancels the pointer', () => {
    pressOn16();
    fire(day(17), 'pointermove', { x: 240 });
    fire(document, 'pointercancel');

    expect(host.drags.at(-1)).toBeNull();
    fire(day(18), 'pointerup', { buttons: 0 });
    expect(host.drops).toEqual([]);
  });

  it('tells nothing when a press that never moved is cancelled or loses its release', () => {
    pressOn16();
    fire(document, 'pointercancel');
    pressOn16();
    fire(day(16), 'pointermove', { x: 201, buttons: 0 });

    expect(host.drags).toEqual([]);
  });

  it('forgets a press when another one begins', () => {
    pressOn16();
    fire(day(18), 'pointerdown', { x: 280 });
    fire(day(18), 'pointermove', { x: 284 });
    expect(host.drags).toEqual([]);

    fire(day(17), 'pointermove', { x: 240 });
    expect(host.drags).toEqual([{ from: '2026-06-18', to: '2026-06-17' }]);
  });

  describe('at a side of the element', () => {
    function dragTo(x: number, target: Element | Document = document): void {
      fire(target, 'pointermove', { x });
    }

    it.each([
      ['within 10 px of the end side', 390, [1]],
      ['beyond the end side', 520, [1]],
      ['within 10 px of the start side', 110, [-1]],
      ['beyond the start side', 20, [-1]],
      ['11 px from the end side', 389, []],
      ['11 px from the start side', 111, []],
    ])('%s, tells the side after 300 ms: %s', (_, x, sides) => {
      pressOn16();
      dragTo(x);
      vi.advanceTimersByTime(SIDE_HOLD_MS - 1);
      expect(host.sides).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(host.sides).toEqual(sides);
    });

    it('tells it once while the mouse stays there, and again after it has come back in', () => {
      pressOn16();
      dragTo(395);
      vi.advanceTimersByTime(SIDE_HOLD_MS);
      dragTo(397);
      vi.advanceTimersByTime(SIDE_HOLD_MS * 3);
      expect(host.sides).toEqual([1]);

      dragTo(300);
      dragTo(395);
      vi.advanceTimersByTime(SIDE_HOLD_MS);
      expect(host.sides).toEqual([1, 1]);
    });

    it('waits from the moment the mouse gets there, not from each move', () => {
      pressOn16();
      dragTo(395);
      vi.advanceTimersByTime(SIDE_HOLD_MS - 100);
      dragTo(396);
      vi.advanceTimersByTime(100);

      expect(host.sides).toEqual([1]);
    });

    it('tells nothing when the mouse leaves the side in time, or crosses to the other', () => {
      pressOn16();
      dragTo(395);
      vi.advanceTimersByTime(SIDE_HOLD_MS - 1);
      dragTo(300);
      vi.advanceTimersByTime(SIDE_HOLD_MS);
      expect(host.sides).toEqual([]);

      dragTo(395);
      vi.advanceTimersByTime(SIDE_HOLD_MS - 1);
      dragTo(105);
      vi.advanceTimersByTime(1);
      expect(host.sides).toEqual([]);
      vi.advanceTimersByTime(SIDE_HOLD_MS);
      expect(host.sides).toEqual([-1]);
    });

    it('is not a side while the mouse is on a day', () => {
      pressOn16();
      dragTo(395, day(18));
      vi.advanceTimersByTime(SIDE_HOLD_MS);

      expect(host.sides).toEqual([]);
    });

    it('needs a drag: a press that has not moved 8 px tells no side', () => {
      pressOn16({ x: 393 });
      fire(document, 'pointermove', { x: 399 });
      vi.advanceTimersByTime(SIDE_HOLD_MS);

      expect(host.sides).toEqual([]);
    });

    it.each([
      [
        'released',
        () => {
          fire(document, 'pointerup', { buttons: 0 });
        },
      ],
      [
        'cancelled',
        () => {
          fire(document, 'pointercancel');
        },
      ],
      [
        'removed from the page',
        () => {
          fixture.destroy();
        },
      ],
    ])('tells nothing once the drag is %s', (_, stop) => {
      pressOn16();
      dragTo(395);
      stop();
      vi.advanceTimersByTime(SIDE_HOLD_MS);

      expect(host.sides).toEqual([]);
    });
  });

  it('hears nothing more once it is removed from the page', () => {
    pressOn16();
    fire(day(17), 'pointermove', { x: 240 });
    const grid = find('.grid');
    const seventeen = day(17);
    fixture.destroy();
    fire(document, 'pointermove', { x: 280 });
    fire(document, 'pointerup', { buttons: 0 });

    expect(host.drags).toHaveLength(1);
    expect(host.drops).toEqual([]);
    // Nor swallows clicks.
    let clicked = 0;
    seventeen.addEventListener('click', () => (clicked += 1));
    grid.append(seventeen);
    seventeen.click();
    expect(clicked).toBe(1);
  });
});
