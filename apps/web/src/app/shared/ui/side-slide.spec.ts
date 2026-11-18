import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { SideSlide } from './side-slide';

@Component({
  imports: [SideSlide],
  template: `<div
    class="window"
    appSideSlide
    (sliding)="moves.push($event)"
    (slid)="ends.push($event)"
  >
    <div class="list"><button type="button">9</button></div>
  </div>`,
})
class Host {
  readonly moves: number[] = [];
  readonly ends: number[] = [];
}

interface Finger {
  readonly x: number;
  readonly y: number;
  readonly id?: number;
}

/** Where the finger is put down in every test. */
const DOWN: Finger = { x: 200, y: 300 };

describe('SideSlide', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let button: HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    host = fixture.componentInstance;
    button = find('button');
  });

  function find(selector: string): HTMLElement {
    const found = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`No ${selector}`);
    return found;
  }

  /** A touch event on the button, with the fingers on the screen after it; the event, as it ends. */
  function touch(type: string, ...fingers: Finger[]): Event {
    const touches = fingers.map(({ x, y, id = 1 }) => ({ identifier: id, clientX: x, clientY: y }));
    const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), { touches });
    button.dispatchEvent(event);
    return event;
  }

  const putDown = (): Event => touch('touchstart', DOWN);
  /** The finger moves to a place given from where it was put down. */
  const moveBy = (x: number, y = 0): Event => touch('touchmove', { x: DOWN.x + x, y: DOWN.y + y });
  const lift = (): Event => touch('touchend');

  it('begins once the finger has moved more than 10 px, sideways', () => {
    putDown();
    moveBy(10);
    expect(host.moves).toEqual([]);

    moveBy(11);

    expect(host.moves).toEqual([11]);
  });

  it('follows the finger: how far it is from where it was put down, less than nothing to the left', () => {
    putDown();
    moveBy(-20);
    moveBy(-64);
    moveBy(-30);
    moveBy(5);

    expect(host.moves).toEqual([-20, -64, -30, 5]);
    expect(host.ends).toEqual([]);
  });

  it('ends when the finger lifts, where it was', () => {
    putDown();
    moveBy(-20);
    moveBy(-64);
    lift();

    expect(host.ends).toEqual([-64]);

    moveBy(-90);
    lift();

    expect(host.moves).toEqual([-20, -64]);
    expect(host.ends).toEqual([-64]);
  });

  it('takes a finger that moves more sideways than up or down', () => {
    putDown();
    moveBy(9, -8);

    expect(host.moves).toEqual([9]);
  });

  it('leaves alone a finger that moves up or down first, wherever it goes later', () => {
    putDown();
    moveBy(8, 8);
    moveBy(40, 9);
    lift();

    expect(host.moves).toEqual([]);
    expect(host.ends).toEqual([]);
  });

  it('waits while the finger has not moved 10 px: it may still go either way', () => {
    putDown();
    moveBy(2, 7);
    moveBy(20, 7);

    expect(host.moves).toEqual([20]);
  });

  it('goes on once begun, however far up or down the finger goes', () => {
    putDown();
    moveBy(20);
    moveBy(25, 80);

    expect(host.moves).toEqual([20, 25]);
  });

  it('leaves alone a touch that something inside has taken for its own', () => {
    find('.list').addEventListener('touchmove', (event) => {
      event.preventDefault();
    });
    putDown();
    moveBy(40);
    lift();

    expect(host.moves).toEqual([]);
    expect(host.ends).toEqual([]);
  });

  it('leaves that touch alone until it ends, even if no more of its moves are taken', () => {
    const taken = (event: Event): void => {
      event.preventDefault();
    };
    find('.list').addEventListener('touchmove', taken);
    putDown();
    moveBy(4);
    find('.list').removeEventListener('touchmove', taken);
    moveBy(40);

    expect(host.moves).toEqual([]);
  });

  it('keeps the page from moving with the finger while it slides, and not before', () => {
    putDown();
    expect(moveBy(6).defaultPrevented).toBe(false);
    expect(moveBy(30).defaultPrevented).toBe(true);
    expect(moveBy(31, 50).defaultPrevented).toBe(true);
  });

  it('lets a finger that goes up or down move the page', () => {
    putDown();

    expect(moveBy(0, 30).defaultPrevented).toBe(false);
    expect(moveBy(40, 30).defaultPrevented).toBe(false);
  });

  it('says nothing of a finger that lifts without sliding', () => {
    putDown();
    moveBy(4);
    lift();

    expect(host.moves).toEqual([]);
    expect(host.ends).toEqual([]);
  });

  it('ends back where it began when the browser takes the touch away', () => {
    putDown();
    moveBy(-50);
    touch('touchcancel');

    expect(host.ends).toEqual([0]);

    moveBy(-80);
    lift();

    expect(host.moves).toEqual([-50]);
    expect(host.ends).toEqual([0]);
  });

  it('says nothing when the browser takes away a touch that was not sliding', () => {
    putDown();
    touch('touchcancel');

    expect(host.ends).toEqual([]);
  });

  it('ends back where it began when a second finger comes', () => {
    putDown();
    moveBy(-50);
    touch('touchstart', { x: 150, y: 300 }, { x: 60, y: 500, id: 2 });

    expect(host.ends).toEqual([0]);

    touch('touchmove', { x: 100, y: 300 }, { x: 60, y: 500, id: 2 });

    expect(host.moves).toEqual([-50]);
  });

  it('does not follow two fingers put down together', () => {
    touch('touchstart', DOWN, { x: 60, y: 500, id: 2 });
    touch('touchmove', { x: DOWN.x + 40, y: DOWN.y }, { x: 100, y: 500, id: 2 });

    expect(host.moves).toEqual([]);
    expect(host.ends).toEqual([]);
  });

  it('measures each slide from where its own finger was put down', () => {
    putDown();
    moveBy(-40);
    lift();
    touch('touchstart', { x: 100, y: 300 });
    touch('touchmove', { x: 130, y: 300 });

    expect(host.moves).toEqual([-40, 30]);
  });

  it('leaves to the browser a finger that goes up or down, and the pinch of two', () => {
    expect(find('.window').style.touchAction).toBe('pan-y pinch-zoom');
  });
});
