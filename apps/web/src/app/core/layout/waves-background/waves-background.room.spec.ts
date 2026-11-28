import { ApplicationRef } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { installTestScreen, type TestScreen } from '../../../../test/media-queries';
import { TOUCH_QUERY } from '../../../shared/ui/screen-matches';
import { provideI18n } from '../../i18n/provide-i18n';
import { WavesBackground } from './waves-background';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

// The button's box on the screen: 32 px square, its lower left corner 20 px from the screen's.
const BUTTON = { left: 8, top: 860, right: 40, bottom: 892 };

/** A part of the screen, as a test lays a card over it. */
type Region = (x: number, y: number) => boolean;

describe('WavesBackground, the button’s room', () => {
  let screen: TestScreen;
  let fixture: ComponentFixture<WavesBackground>;
  let card: HTMLElement;
  // Where a card is drawn on the screen.
  let cardAt: Region;
  // The points of the screen the page looked at, as `document.elementsFromPoint` was asked.
  let looked: [number, number][];
  let observer: { observed: Element[]; disconnected: boolean; resized: () => void };

  async function start(matching: Record<string, boolean> = {}): Promise<void> {
    screen = installTestScreen(matching);
    TestBed.configureTestingModule({ imports: [WavesBackground], providers: [provideI18n()] });
    fixture = TestBed.createComponent(WavesBackground);
    await fixture.whenStable();
    placeButton();
  }

  function toggle(): HTMLButtonElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('button');
  }

  function placeButton(): void {
    const button = toggle();
    if (button) button.getBoundingClientRect = () => DOMRect.fromRect(boxOf(BUTTON));
  }

  function boxOf({ left, top, right, bottom }: typeof BUTTON): DOMRectInit {
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  /** The frame after a change comes, and what it changed is drawn. */
  async function nextFrame(): Promise<void> {
    vi.advanceTimersToNextFrame();
    await fixture.whenStable();
  }

  function shown(): boolean {
    const button = toggle();
    if (!button) throw new Error('No button');
    return button.style.visibility !== 'hidden';
  }

  function resize(): void {
    window.dispatchEvent(new Event('resize'));
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    localStorage.clear();
    card = document.createElement('div');
    card.style.backgroundColor = 'white';
    document.body.append(card);
    cardAt = () => false;
    looked = [];
    // What the screen shows at a point, top first: the button, a card where one is drawn, the
    // page (jsdom has no layout).
    Object.defineProperty(Document.prototype, 'elementsFromPoint', {
      configurable: true,
      value: (x: number, y: number): Element[] => {
        looked.push([x, y]);
        const button = toggle();
        return [
          ...(button ? [button] : []),
          ...(cardAt(x, y) ? [card] : []),
          document.body,
          document.documentElement,
        ];
      },
    });
    observer = { observed: [], disconnected: false, resized: () => {} };
    window.ResizeObserver = class implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        observer.resized = () => {
          callback([], this);
        };
      }
      observe(target: Element): void {
        observer.observed.push(target);
      }
      unobserve(): void {}
      disconnect(): void {
        observer.disconnected = true;
      }
    };
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
    card.remove();
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');
    localStorage.clear();
    Reflect.deleteProperty(Document.prototype, 'elementsFromPoint');
    Reflect.deleteProperty(window, 'ResizeObserver');
  });

  it('is shown once drawn where it touches no card', async () => {
    await start();
    await nextFrame();

    expect(looked).not.toEqual([]);
    expect(shown()).toBe(true);
  });

  it('is not shown, once drawn, where it touches a card', async () => {
    await start();
    cardAt = (x) => x > 30;
    await nextFrame();

    expect(shown()).toBe(false);
  });

  it('goes the moment the window narrows until it touches a card, and is back once it has room', async () => {
    await start();
    await nextFrame();

    cardAt = (x) => x > 30;
    resize();
    await nextFrame();
    expect(shown()).toBe(false);

    cardAt = () => false;
    resize();
    await nextFrame();
    expect(shown()).toBe(true);
  });

  it('counts a card over its far corner alone', async () => {
    await start();
    cardAt = (x, y) => x > BUTTON.right - 1 && y > BUTTON.bottom - 1;
    await nextFrame();

    expect(shown()).toBe(false);
  });

  it('counts a card over the middle of its left edge alone', async () => {
    await start();
    cardAt = (x, y) => x < BUTTON.left + 1 && y > BUTTON.top + 8 && y < BUTTON.top + 12;
    await nextFrame();

    expect(shown()).toBe(false);
  });

  it('counts a card over the middle of its bottom edge alone', async () => {
    await start();
    cardAt = (x, y) => y > BUTTON.bottom - 1 && x > BUTTON.left + 12 && x < BUTTON.left + 16;
    await nextFrame();

    expect(shown()).toBe(false);
  });

  it('does not count a card that only meets its edge from outside', async () => {
    await start();
    cardAt = (x, y) =>
      x >= BUTTON.right || y >= BUTTON.bottom || x <= BUTTON.left || y <= BUTTON.top;
    await nextFrame();

    expect(shown()).toBe(true);
  });

  it('does not count what paints nothing around the cards, nor the page itself, coloured or not', async () => {
    await start();
    card.style.removeProperty('background-color');
    document.body.style.backgroundColor = 'white';
    document.documentElement.style.backgroundColor = 'white';
    cardAt = () => true;
    await nextFrame();

    expect(shown()).toBe(true);
  });

  it('does not count itself, nor what is inside it, even where they paint', async () => {
    await start();
    const button = toggle()!;
    const icon = button.querySelector('svg')!;
    button.style.backgroundColor = 'white';
    icon.style.backgroundColor = 'white';
    Object.defineProperty(Document.prototype, 'elementsFromPoint', {
      configurable: true,
      value: (): Element[] => [icon, button, document.body, document.documentElement],
    });
    await nextFrame();

    expect(shown()).toBe(true);
  });

  it('looks again when anything scrolls, even inside the page', async () => {
    await start();
    await nextFrame();

    cardAt = () => true;
    card.dispatchEvent(new Event('scroll'));
    await nextFrame();

    expect(shown()).toBe(false);
  });

  it('looks again when a transition on the page ends', async () => {
    await start();
    await nextFrame();

    cardAt = () => true;
    card.dispatchEvent(new Event('transitionend', { bubbles: true }));
    await nextFrame();

    expect(shown()).toBe(false);
  });

  it('looks again when an animation on the page ends', async () => {
    await start();
    await nextFrame();

    cardAt = () => true;
    card.dispatchEvent(new Event('animationend', { bubbles: true }));
    await nextFrame();

    expect(shown()).toBe(false);
  });

  it('looks again when the page changes size', async () => {
    await start();
    await nextFrame();
    expect(observer.observed).toContain(document.body);

    cardAt = () => true;
    observer.resized();
    await nextFrame();

    expect(shown()).toBe(false);
  });

  it('looks again once the page is drawn again, as when a toast over it goes', async () => {
    await start();
    cardAt = () => true;
    await nextFrame();
    expect(shown()).toBe(false);

    // The toast goes by its own timer: nothing scrolls, resizes or ends a transition.
    cardAt = () => false;
    TestBed.inject(ApplicationRef).tick();
    await nextFrame();

    expect(shown()).toBe(true);
  });

  it('looks once a frame, however many changes come in it', async () => {
    await start();
    await nextFrame();
    looked = [];
    resize();
    await nextFrame();
    const once = looked.length;

    looked = [];
    resize();
    resize();
    card.dispatchEvent(new Event('transitionend', { bubbles: true }));
    await nextFrame();

    expect(once).toBeGreaterThan(0);
    expect(looked).toHaveLength(once);
  });

  it('looks along its whole edge, a point at most every 4 px', async () => {
    await start();
    await nextFrame();

    const near = (a: number, b: number): boolean => Math.abs(a - b) < 1;
    /** The lengths between the points looked at along an edge, from its start to its end. */
    const gaps = (
      onEdge: (point: [number, number]) => boolean,
      place: (point: [number, number]) => number,
      from: number,
      to: number,
    ): number[] => {
      const places = [
        from,
        ...looked
          .filter(onEdge)
          .map(place)
          .sort((a, b) => a - b),
        to,
      ];
      return places.slice(1).map((at, index) => at - (places[index] ?? at));
    };
    const all = [
      ...gaps(
        ([, y]) => near(y, BUTTON.top),
        ([x]) => x,
        BUTTON.left,
        BUTTON.right,
      ),
      ...gaps(
        ([, y]) => near(y, BUTTON.bottom),
        ([x]) => x,
        BUTTON.left,
        BUTTON.right,
      ),
      ...gaps(
        ([x]) => near(x, BUTTON.left),
        ([, y]) => y,
        BUTTON.top,
        BUTTON.bottom,
      ),
      ...gaps(
        ([x]) => near(x, BUTTON.right),
        ([, y]) => y,
        BUTTON.top,
        BUTTON.bottom,
      ),
    ];

    expect(Math.max(...all)).toBeLessThanOrEqual(4);
    // Only inside its box.
    for (const [x, y] of looked) {
      expect(x > BUTTON.left && x < BUTTON.right && y > BUTTON.top && y < BUTTON.bottom).toBe(true);
    }
  });

  it('looks at each point of its edge once, its corners too', async () => {
    await start();
    // 33 px: the runs along each edge end right on a corner.
    toggle()!.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 8, y: 860, width: 33, height: 33 });
    await nextFrame();

    const points = looked.map(([x, y]) => `${String(x)},${String(y)}`);
    expect(new Set(points).size).toBe(points.length);
    for (const corner of ['8.5,860.5', '40.5,860.5', '40.5,892.5', '8.5,892.5']) {
      expect(points).toContain(corner);
    }
  });

  it('looks for its room as soon as it comes, when the device stops asking for reduced motion', async () => {
    await start({ [REDUCED_MOTION]: true });
    await nextFrame();
    expect(toggle()).toBeNull();
    expect(looked).toEqual([]);

    cardAt = () => true;
    screen.set(REDUCED_MOTION, false);
    await fixture.whenStable();
    placeButton();
    await nextFrame();

    expect(shown()).toBe(false);
  });

  it('looks nowhere on a touch screen, which has no button, nor asks a frame to', async () => {
    await start({ [TOUCH_QUERY]: true });
    TestBed.inject(ApplicationRef).tick();
    expect(vi.getTimerCount()).toBe(0);

    resize();
    await nextFrame();

    expect(toggle()).toBeNull();
    expect(looked).toEqual([]);
  });

  it('once gone, looks no more, not even for a change that came just before', async () => {
    await start();
    await nextFrame();

    resize();
    fixture.destroy();
    looked = [];
    vi.advanceTimersToNextFrame();
    resize();
    card.dispatchEvent(new Event('transitionend', { bubbles: true }));
    vi.advanceTimersToNextFrame();

    expect(looked).toEqual([]);
    expect(observer.disconnected).toBe(true);
  });
});
