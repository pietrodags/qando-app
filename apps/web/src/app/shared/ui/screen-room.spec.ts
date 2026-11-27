import { Component, ElementRef, inject, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { screenRoom } from './screen-room';
import { Step, StepStack } from './step-stack';

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

/** A step whose end is around it: the card it is in. */
@Component({ template: `<div class="box long"></div>` })
class HostInCard {
  readonly room = screenRoom(
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
    { boxes: '.box', end: '.card' },
    () => true,
  );
}

/** A step with boxes under its boxes that are left out of the room: two, 40 and 25 px tall. */
@Component({
  template: `
    <div class="box long"></div>
    <div class="aside" data-height="40"></div>
    <div class="aside" data-height="25"></div>
    <div class="end"></div>
  `,
})
class HostWithAside {
  readonly room = screenRoom(
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
    { boxes: '.box', end: '.end', aside: '.aside' },
    () => true,
  );
}

/** A step whose boxes are in the card of a stack, at its second step. */
@Component({
  selector: 'app-boxes',
  template: `<div class="box long"></div>
    <div class="end"></div>`,
})
class StackedBoxes {
  readonly room = screenRoom(
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
    { boxes: '.box', end: '.end' },
    () => true,
  );
}

@Component({
  imports: [Step, StepStack, StackedBoxes],
  template: `
    <app-step-stack [current]="2">
      <ng-template appStep="paso 1"><p>Your name</p></ng-template>
      <ng-template appStep="paso 2"><app-boxes /></ng-template>
    </app-step-stack>
  `,
})
class Stack {}

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
      if (this.classList.contains('aside'))
        return { height: Number(this.dataset['height']) } as DOMRect;
      // A card around the step ends 30 px below what ends it.
      if (this.classList.contains('card')) return { bottom: boxTop + 100 + BELOW + 30 } as DOMRect;
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

  it('leaves out of what goes below the boxes the tallest of the boxes set aside', async () => {
    const fixture = TestBed.createComponent(HostWithAside);
    await fixture.whenStable();

    // 600 − 10 − 400 − (100 − 40).
    expect(fixture.componentInstance.room()).toBe(130);
  });

  it('gives whole pixels, never one too many', async () => {
    innerHeight = 600.5;
    const fixture = await render();

    expect(room(fixture)).toBe(90);
  });

  it('takes a hair under a whole pixel, as the browser reports a box that moves, for that pixel', async () => {
    innerHeight = 599.99997;
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

  it('measures the boxes of a step in a stack where they will be once the steps above have folded', async () => {
    // The first step is a tab still folding: the card starts 150 px down, and will start 52 px
    // down once that tab takes only its room (76 px tall, 24 px under the card).
    const fixture = TestBed.createComponent(Stack);
    const steps = (): Element[] =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('section.step'));
    const tops = [0, 150];
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return tops[steps().indexOf(this)] ?? 0;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('folded') ? 76 : 0;
    });
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) =>
      element.classList.contains('folded')
        ? ({ marginBottom: '-24px' } as CSSStyleDeclaration)
        : computed(element, pseudo),
    );
    await fixture.whenStable();
    const boxes = fixture.debugElement.query(By.directive(StackedBoxes))
      .componentInstance as StackedBoxes;

    // 600 − 10 − (400 − (150 − 52)) − 100.
    expect(boxes.room()).toBe(188);
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

  it('gives no room once the boxes or what ends the step have left the page', async () => {
    const observer = installResizeObserver();
    const fixture = await render();
    expect(room(fixture)).toBe(90);

    // The step changes size as they go.
    fixture.componentInstance.boxes.set(false);
    await fixture.whenStable();
    observer.resized();
    await fixture.whenStable();
    expect(room(fixture)).toBeNull();

    fixture.componentInstance.boxes.set(true);
    await fixture.whenStable();
    observer.resized();
    await fixture.whenStable();
    expect(room(fixture)).toBe(90);

    fixture.componentInstance.end.set(false);
    await fixture.whenStable();
    observer.resized();
    await fixture.whenStable();
    expect(room(fixture)).toBeNull();
  });

  it('measures down to what the step is in, when that is what ends it', async () => {
    const card = document.createElement('div');
    card.className = 'card';
    const fixture = TestBed.createComponent(HostInCard);
    card.append(fixture.nativeElement as HTMLElement);
    document.body.append(card);
    await fixture.whenStable();

    // 600 − 10 − 400 − 130.
    expect(fixture.componentInstance.room()).toBe(60);
    card.remove();
  });

  it('measures again when the window changes height', async () => {
    const fixture = await render();

    innerHeight = 2000;
    window.dispatchEvent(new Event('resize'));
    await fixture.whenStable();

    expect(room(fixture)).toBe(1490);
  });

  it('measures again when the host, anything it is in or the page changes size', async () => {
    const observer = installResizeObserver();
    // The step is one of several in a stack, whose other steps fold and grow above it.
    const stack = document.createElement('div');
    document.body.append(stack);
    const fixture = TestBed.createComponent(Host);
    stack.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
    expect(observer.observed).toEqual([
      fixture.nativeElement,
      stack,
      document.body,
      document.documentElement,
    ]);

    // A step above grows: the boxes now start 30 px lower, then 60.
    boxesDown = 430;
    observer.resized();
    await fixture.whenStable();
    expect(room(fixture)).toBe(60);

    boxesDown = 460;
    observer.resized();
    await fixture.whenStable();
    expect(room(fixture)).toBe(30);
    stack.remove();
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
