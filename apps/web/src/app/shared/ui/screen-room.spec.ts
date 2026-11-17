import { Component, ElementRef, inject, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { screenRoom } from './screen-room';

@Component({
  template: `
    @if (boxes()) {
      <div class="box"></div>
      <div class="box long"></div>
    }
    @if (end()) {
      <div class="end"></div>
    }
  `,
})
class Host {
  readonly active = signal(true);
  readonly boxes = signal(true);
  readonly end = signal(true);
  readonly room = screenRoom(
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
    { boxes: '.box', end: '.end' },
    () => this.active(),
  );
}

describe('screenRoom', () => {
  // A small layout, as jsdom lays nothing out: the step starts `stepTop` px down the page and its
  // two boxes `boxesDown` px below its top, one 50 px tall and the long one 100; what ends the
  // step ends 100 px below the long box. The page is scrolled `scrolled` px down.
  const BELOW = 100;
  let stepTop: number;
  let boxesDown: number;
  let scrolled: number;
  let innerHeight: number;
  let heightReads: number;

  beforeEach(() => {
    stepTop = 0;
    boxesDown = 400;
    scrolled = 0;
    innerHeight = 600;
    heightReads = 0;
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      get: () => {
        heightReads += 1;
        return innerHeight;
      },
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const top = stepTop - scrolled;
      const boxTop = top + boxesDown;
      if (this.classList.contains('long')) return { top: boxTop, bottom: boxTop + 100 } as DOMRect;
      if (this.classList.contains('box')) return { top: boxTop, bottom: boxTop + 50 } as DOMRect;
      if (this.classList.contains('end')) return { bottom: boxTop + 100 + BELOW } as DOMRect;
      return { top, bottom: top } as DOMRect;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'innerHeight');
    Reflect.deleteProperty(window, 'ResizeObserver');
  });

  async function render(prepare?: (host: Host) => void): Promise<ComponentFixture<Host>> {
    const fixture = TestBed.createComponent(Host);
    prepare?.(fixture.componentInstance);
    await fixture.whenStable();
    return fixture;
  }

  function room(fixture: ComponentFixture<Host>): number | null {
    return fixture.componentInstance.room();
  }

  /** What the browser tells of a resize, and to whom: its observer is the test's. */
  function installResizeObserver(): {
    observed: Element[];
    disconnected: boolean;
    resized: () => void;
  } {
    const observer = { observed: [] as Element[], disconnected: false, resized: (): void => {} };
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
    return observer;
  }

  it('leaves the boxes what the screen has under their top, less what goes below the longest one and 10 px', async () => {
    const fixture = await render();

    // 600 − 10 − 400 − 100.
    expect(room(fixture)).toBe(90);
  });

  it('gives whole pixels, never one too many', async () => {
    innerHeight = 600.5;
    const fixture = await render();

    expect(room(fixture)).toBe(90);
  });

  it('counts from the top of the page, wherever the step is and however far the page is scrolled', async () => {
    // The step starts 300 px down the page: 120 px down a block that starts 180 px down.
    stepTop = 300;
    scrolled = 50;
    innerHeight = 1000;
    const fixture = TestBed.createComponent(Host);
    const host = fixture.nativeElement as HTMLElement;
    const block = host.parentElement!;
    Object.defineProperty(host, 'offsetTop', { configurable: true, value: 120 });
    Object.defineProperty(host, 'offsetParent', { configurable: true, value: block });
    Object.defineProperty(block, 'offsetTop', { configurable: true, value: 180 });
    await fixture.whenStable();

    // 1000 − 10 − (300 + 400) − 100.
    expect(room(fixture)).toBe(190);
  });

  it('gives no room while it is not active, and measures once it is', async () => {
    const fixture = await render((host) => {
      host.active.set(false);
    });
    expect(room(fixture)).toBeNull();

    fixture.componentInstance.active.set(true);
    await fixture.whenStable();
    expect(room(fixture)).toBe(90);

    fixture.componentInstance.active.set(false);
    await fixture.whenStable();
    expect(room(fixture)).toBeNull();
  });

  it('gives no room while the boxes are not on the page', async () => {
    const fixture = await render((host) => {
      host.boxes.set(false);
    });

    expect(room(fixture)).toBeNull();
  });

  it('gives no room while what ends the step is not on the page', async () => {
    const fixture = await render((host) => {
      host.end.set(false);
    });

    expect(room(fixture)).toBeNull();
  });

  it('measures again when the window changes height', async () => {
    const fixture = await render();

    innerHeight = 2000;
    window.dispatchEvent(new Event('resize'));
    await fixture.whenStable();

    expect(room(fixture)).toBe(1490);
  });

  it('measures again when the host or the page changes size', async () => {
    const observer = installResizeObserver();
    const fixture = await render();
    expect(observer.observed).toHaveLength(2);
    expect(observer.observed[0]).toBe(fixture.nativeElement);
    expect(observer.observed[1]).toBe(document.body);

    // The rows above the boxes grow: they now start 60 px lower.
    boxesDown = 460;
    observer.resized();
    await fixture.whenStable();

    expect(room(fixture)).toBe(30);
  });

  it('stops listening once its component is gone', async () => {
    const observer = installResizeObserver();
    const fixture = await render();
    const reads = heightReads;

    fixture.destroy();
    window.dispatchEvent(new Event('resize'));

    expect(heightReads).toBe(reads);
    expect(observer.disconnected).toBe(true);
  });
});
