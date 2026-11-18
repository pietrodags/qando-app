import { Component, viewChild } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FOLLOW_MS, RowDrag, type RowDragSpan } from './row-drag';

@Component({
  imports: [RowDrag],
  template: `<div
    class="list"
    appRowDrag
    (dragging)="drags.push($event)"
    (dropped)="drops.push($event)"
  >
    @for (row of rows; track row) {
      <div class="row">
        <button type="button" (click)="clicks.push(row)">
          <span>{{ row }}</span>
        </button>
      </div>
    }
  </div>`,
})
class Host {
  readonly directive = viewChild.required(RowDrag);
  readonly rows = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  readonly drags: (RowDragSpan | null)[] = [];
  readonly drops: RowDragSpan[] = [];
  readonly clicks: number[] = [];
}

interface Pointer {
  x?: number;
  y?: number;
  buttons?: number;
  button?: number;
  pointerType?: string;
  pointerId?: number;
}

/** The list is 200 px tall, from 100 to 300, and shows 5 of its 10 rows: one every 40 px, 34 tall. */
const TOP = 100;
const PITCH = 40;

describe('RowDrag', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let list: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    host = fixture.componentInstance;
    list = find('.list');
    // jsdom lays nothing out: the list and its rows are where its scroll puts them.
    Object.defineProperty(list, 'scrollTop', { value: 0, writable: true });
    list.getBoundingClientRect = () => new DOMRect(100, TOP, 80, 200);
    Array.from(list.children).forEach((row, place) => {
      row.getBoundingClientRect = () =>
        new DOMRect(100, TOP + place * PITCH - list.scrollTop, 80, 34);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function find(selector: string): HTMLElement {
    const found = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`No ${selector}`);
    return found;
  }

  const row = (place: number): HTMLElement => list.children[place] as HTMLElement;
  const button = (place: number): HTMLElement => row(place).querySelector('button') as HTMLElement;
  /** The height of the middle of a row while the list has not scrolled. */
  const middle = (place: number): number => TOP + place * PITCH + 17;

  function fire(target: Element | Document, type: string, init: Pointer = {}): void {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: init.x ?? 140,
      clientY: init.y ?? middle(1),
      buttons: init.buttons ?? 1,
      button: init.button ?? 0,
    });
    Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'mouse' });
    Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1 });
    target.dispatchEvent(event);
  }

  /** The pointer moves to a height, wherever it is: the document hears it. */
  function moveTo(y: number, init: Pointer = {}): void {
    fire(document, 'pointermove', { ...init, y });
  }

  /** A touch moves on `target`: whether the list may scroll with it. */
  function scrolls(target: Element): boolean {
    const event = new Event('touchmove', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  /** The pointer is pressed on the second row (place 1), at its middle. */
  function pressRow1(init: Pointer = {}): void {
    fire(button(1), 'pointerdown', init);
  }

  it('begins once the mouse has moved more than 8 px from where it was pressed', () => {
    pressRow1();
    moveTo(middle(1) + 8);
    expect(host.drags).toEqual([]);

    fire(document, 'pointermove', { x: 148.5 });
    expect(host.drags).toEqual([{ from: 1, to: 1 }]);
  });

  it('follows the mouse from row to row, telling each row once', () => {
    pressRow1();
    moveTo(middle(2));
    moveTo(middle(2) + 5);
    moveTo(middle(4));
    moveTo(middle(0));

    expect(host.drags).toEqual([
      { from: 1, to: 2 },
      { from: 1, to: 4 },
      { from: 1, to: 0 },
    ]);
    expect(host.drops).toEqual([]);
  });

  it('reads the row pressed from whatever is inside it', () => {
    fire(find('span'), 'pointerdown', { y: middle(0) });
    moveTo(middle(3));

    expect(host.drags).toEqual([{ from: 0, to: 3 }]);
  });

  it('takes a row from the bottom of the one above down to its own', () => {
    pressRow1();
    // The third row ends at 214, and the fourth at 254.
    moveTo(213.5);
    moveTo(214);
    moveTo(253.5);
    moveTo(254);

    expect(host.drags).toEqual([
      { from: 1, to: 2 },
      { from: 1, to: 3 },
      { from: 1, to: 4 },
    ]);
  });

  it('is at the row of the pointer’s height, wherever the pointer is sideways', () => {
    pressRow1();
    fire(document, 'pointermove', { x: 900, y: middle(3) });

    expect(host.drags).toEqual([{ from: 1, to: 3 }]);
  });

  it('is at the row at the top of the list above it, and at the one at its bottom below it', () => {
    // The third row is cut by the top of the list, and the eighth by its bottom.
    list.scrollTop = 2 * PITCH + 10;
    fire(button(3), 'pointerdown', { y: middle(1) });
    moveTo(-500);
    expect(host.drags.at(-1)).toEqual({ from: 3, to: 2 });

    moveTo(5000);
    expect(host.drags.at(-1)).toEqual({ from: 3, to: 7 });
  });

  it('is at the last row when the pointer is past them all', () => {
    list.getBoundingClientRect = () => new DOMRect(100, TOP, 80, 800);
    pressRow1();
    moveTo(TOP + 700);

    expect(host.drags).toEqual([{ from: 1, to: 9 }]);
  });

  it('begins from no press off the rows, nor from another button of the mouse', () => {
    fire(list, 'pointerdown');
    moveTo(middle(3));
    fire(button(1), 'pointerdown', { button: 2 });
    moveTo(middle(3));

    expect(host.drags).toEqual([]);
  });

  it('ends where the pointer is released, and swallows the click that follows', () => {
    pressRow1();
    moveTo(middle(3));
    fire(document, 'pointerup', { y: middle(3), buttons: 0 });
    button(3).click();

    expect(host.drops).toEqual([{ from: 1, to: 3 }]);
    expect(host.clicks).toEqual([]);
    expect(host.drags).toEqual([{ from: 1, to: 3 }]);
  });

  it('swallows only the click of its own release', () => {
    pressRow1();
    moveTo(middle(3));
    fire(document, 'pointerup', { buttons: 0 });
    vi.advanceTimersByTime(0);
    button(3).click();

    expect(host.clicks).toEqual([3]);
  });

  it('leaves a press that never moved as a click', () => {
    pressRow1();
    fire(document, 'pointerup', { buttons: 0 });
    button(1).click();
    moveTo(middle(3), { buttons: 0 });

    expect(host.clicks).toEqual([1]);
    expect(host.drags).toEqual([]);
    expect(host.drops).toEqual([]);
  });

  it('does not begin under a finger that moves, which scrolls the list', () => {
    pressRow1({ pointerType: 'touch' });
    moveTo(middle(3), { pointerType: 'touch' });

    expect(host.drags).toEqual([]);
    expect(scrolls(button(1))).toBe(true);
  });

  it('begins under a finger once it has rested on the row pressed, and keeps the list still', () => {
    pressRow1({ pointerType: 'touch' });
    host.directive().rested(1);
    expect(host.drags).toEqual([{ from: 1, to: 1 }]);
    expect(scrolls(button(1))).toBe(false);

    moveTo(middle(1) + 2, { pointerType: 'touch' });
    moveTo(middle(2), { pointerType: 'touch' });
    fire(document, 'pointerup', { pointerType: 'touch', buttons: 0 });

    expect(host.drags).toEqual([
      { from: 1, to: 1 },
      { from: 1, to: 2 },
    ]);
    expect(host.drops).toEqual([{ from: 1, to: 2 }]);
    expect(scrolls(button(1))).toBe(true);
  });

  it('begins from no rest on another row, with no press, nor during a drag', () => {
    host.directive().rested(1);
    pressRow1({ pointerType: 'touch' });
    host.directive().rested(2);
    expect(host.drags).toEqual([]);

    host.directive().rested(1);
    host.directive().rested(1);
    expect(host.drags).toEqual([{ from: 1, to: 1 }]);
  });

  it('is given up when the release was lost on the way', () => {
    pressRow1();
    moveTo(middle(3));
    moveTo(middle(4), { buttons: 0 });
    moveTo(middle(5));

    expect(host.drags).toEqual([{ from: 1, to: 3 }, null]);
    expect(host.drops).toEqual([]);
  });

  it('is given up when the browser takes the pointer away', () => {
    pressRow1({ pointerType: 'touch' });
    host.directive().rested(1);
    fire(document, 'pointercancel', { pointerType: 'touch' });
    fire(document, 'pointerup', { pointerType: 'touch', buttons: 0 });

    expect(host.drags).toEqual([{ from: 1, to: 1 }, null]);
    expect(host.drops).toEqual([]);
  });

  it('tells nothing when a press that was no drag yet is taken away', () => {
    pressRow1({ pointerType: 'touch' });
    fire(document, 'pointercancel', { pointerType: 'touch' });
    host.directive().rested(1);

    expect(host.drags).toEqual([]);
  });

  it('follows only the pointer that pressed', () => {
    pressRow1();
    moveTo(middle(3), { pointerId: 2 });
    fire(document, 'pointerup', { pointerId: 2, buttons: 0 });
    fire(document, 'pointercancel', { pointerId: 2 });
    moveTo(middle(4));

    expect(host.drags).toEqual([{ from: 1, to: 4 }]);
  });

  it('goes on under its finger when another one presses the rows', () => {
    pressRow1({ pointerType: 'touch' });
    host.directive().rested(1);
    fire(button(4), 'pointerdown', { pointerType: 'touch', pointerId: 2, y: middle(4) });
    moveTo(middle(2), { pointerType: 'touch' });

    expect(host.drags).toEqual([
      { from: 1, to: 1 },
      { from: 1, to: 2 },
    ]);
  });

  it('starts again from a new press when the one before was never released', () => {
    pressRow1();
    moveTo(middle(3));
    fire(button(4), 'pointerdown', { y: middle(4) });
    moveTo(middle(5));

    expect(host.drags).toEqual([{ from: 1, to: 3 }, null, { from: 4, to: 5 }]);
  });

  describe('with the pointer near an end of the list', () => {
    /** The list scrolls as far as its rows go: 10 rows, 5 in sight. */
    const frames = (count: number): void => {
      vi.advanceTimersByTime(count * FOLLOW_MS);
    };

    it('scrolls the list under the pointer, and the drag gets to the rows that come', () => {
      pressRow1();
      // 2 px into the last 34 px of the list: 2 / 4 + 1 px each time.
      moveTo(268);
      expect(host.drags).toEqual([{ from: 1, to: 4 }]);

      frames(1);
      expect(list.scrollTop).toBe(1.5);
      frames(17);
      expect(list.scrollTop).toBe(27);
      expect(host.drags).toEqual([
        { from: 1, to: 4 },
        { from: 1, to: 5 },
      ]);
    });

    it('scrolls faster the further the pointer goes, 9 px each time at most', () => {
      pressRow1();
      moveTo(286);
      frames(1);
      expect(list.scrollTop).toBe(6);

      moveTo(298);
      frames(1);
      expect(list.scrollTop).toBe(15);

      moveTo(2000);
      frames(2);
      expect(list.scrollTop).toBe(33);
    });

    it('scrolls back near the top, and above it', () => {
      list.scrollTop = 200;
      fire(button(7), 'pointerdown', { y: 197 });
      moveTo(132);
      frames(1);
      expect(list.scrollTop).toBe(198.5);

      moveTo(-50);
      frames(2);
      expect(list.scrollTop).toBe(180.5);
      expect(host.drags.at(-1)).toEqual({ from: 7, to: 4 });
    });

    it('leaves the list where it is with the pointer between its two ends', () => {
      pressRow1();
      moveTo(134);
      frames(10);
      expect(list.scrollTop).toBe(0);

      moveTo(266);
      frames(10);
      expect(list.scrollTop).toBe(0);
    });

    it('leaves the list where it is under a row pressed near its bottom, until the pointer moves down', () => {
      // The fifth row, in the last 34 px of the list.
      fire(button(4), 'pointerdown', { y: 280, pointerType: 'touch' });
      host.directive().rested(4);
      frames(10);
      expect(list.scrollTop).toBe(0);

      moveTo(270, { pointerType: 'touch' });
      moveTo(280, { pointerType: 'touch' });
      frames(10);
      expect(list.scrollTop).toBe(0);

      // 15 px into the last 34: 15 / 4 + 1 px each time.
      moveTo(281, { pointerType: 'touch' });
      frames(1);
      expect(list.scrollTop).toBe(4.75);
    });

    it('leaves the list where it is under a row pressed near its top, until the pointer moves up', () => {
      list.scrollTop = 200;
      fire(button(5), 'pointerdown', { y: 120, pointerType: 'touch' });
      host.directive().rested(5);
      frames(10);
      expect(list.scrollTop).toBe(200);

      moveTo(130, { pointerType: 'touch' });
      moveTo(120, { pointerType: 'touch' });
      frames(10);
      expect(list.scrollTop).toBe(200);

      moveTo(119, { pointerType: 'touch' });
      frames(1);
      expect(list.scrollTop).toBe(195.25);
    });

    it('leaves the list where it is before the drag begins', () => {
      pressRow1({ pointerType: 'touch' });
      moveTo(290, { pointerType: 'touch' });
      frames(10);

      expect(list.scrollTop).toBe(0);
    });

    it('scrolls no more once the pointer is released, or the drag given up', () => {
      pressRow1();
      moveTo(290);
      fire(document, 'pointerup', { y: 290, buttons: 0 });
      frames(10);
      expect(list.scrollTop).toBe(0);

      pressRow1();
      moveTo(290);
      fire(document, 'pointercancel');
      frames(10);
      expect(list.scrollTop).toBe(0);
    });
  });

  it('follows nothing once it has left the page', () => {
    pressRow1();
    moveTo(290);
    fixture.destroy();
    vi.advanceTimersByTime(10 * FOLLOW_MS);
    moveTo(middle(0));

    expect(list.scrollTop).toBe(0);
    expect(host.drags).toEqual([{ from: 1, to: 4 }]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
