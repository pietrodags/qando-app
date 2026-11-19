import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ScrollFold } from './scroll-fold';
import { installTestScreen, type TestScreen } from '../../../test/media-queries';

// Blocks of 32 px, 8 px apart, inside 8 px of padding and a 1 px border: the second block
// starts 40 px below the first.
const BLOCK = 32;
const GAP = 8;
const PADDING = 8;
const BORDER = 1;
const COUNT = 6;

@Component({
  imports: [ScrollFold],
  template: `<div
    [appScrollFold]="fold()"
    [foldHeight]="maxHeight()"
    [foldStart]="start()"
    [foldLeast]="least()"
    #scroller="appScrollFold"
    style="padding: 8px; border: 1px solid"
  >
    @for (block of blocks(); track block) {
      <span>{{ block }}</span>
    }
  </div>`,
})
class Host {
  readonly fold = signal<number | null>(2);
  readonly maxHeight = signal<number | null>(null);
  readonly start = signal(0);
  readonly least = signal(1);
  readonly blocks = signal(Array.from({ length: COUNT }, (_, index) => index));
}

describe('ScrollFold', () => {
  let fixture: ComponentFixture<Host>;
  let box: HTMLElement;
  let scrolls: ScrollToOptions[];
  let screen: TestScreen;

  /** The box lays its blocks out as a browser would, scrolled `box.scrollTop` down. */
  function layOut(): void {
    const top = 100;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this === box) return { top } as DOMRect;
      const index = Array.from(box.children).indexOf(this);
      const start = top + BORDER + PADDING + index * (BLOCK + GAP) - box.scrollTop;
      return { top: start, bottom: start + BLOCK } as DOMRect;
    });
    Object.defineProperty(box, 'scrollHeight', {
      configurable: true,
      get: () => PADDING * 2 + box.children.length * (BLOCK + GAP) - GAP,
    });
    Object.defineProperty(box, 'clientHeight', {
      configurable: true,
      // Without a height of its own the box shows all it holds.
      get: () =>
        box.style.blockSize === ''
          ? box.scrollHeight
          : Number.parseFloat(box.style.blockSize) - BORDER * 2,
    });
  }

  function scroller(): ScrollFold {
    return fixture.debugElement.children[0]!.references['scroller'] as ScrollFold;
  }

  /** The box is scrolled to `top` and comes to rest there. */
  async function scrollTo(top: number): Promise<void> {
    passBy(top);
    box.dispatchEvent(new Event('scrollend'));
    await fixture.whenStable();
  }

  /** The box is at `top` on its way somewhere else. */
  function passBy(top: number): void {
    box.scrollTop = top;
    box.dispatchEvent(new Event('scroll'));
  }

  function asked(): (number | undefined)[] {
    return scrolls.map((scroll) => scroll.top);
  }

  /** Draws the box for the first time, with what `prepare` sets on its page beforehand. */
  async function draw(prepare: (host: Host) => void = () => undefined): Promise<void> {
    fixture = TestBed.createComponent(Host);
    prepare(fixture.componentInstance);
    box = (fixture.nativeElement as HTMLElement).querySelector('div')!;
    layOut();
    scrolls = [];
    // As a stylesheet may have it, the box scrolls only while it is marked folded: until then a
    // browser leaves it at its top, whatever is asked of it.
    const scrollable = (): boolean => box.classList.contains('folded');
    let scrolled = 0;
    Object.defineProperty(box, 'scrollTop', {
      configurable: true,
      get: () => scrolled,
      set: (top: number) => {
        if (scrollable()) scrolled = top;
      },
    });
    box.scrollTo = ((options: ScrollToOptions) => {
      if (scrollable()) scrolls.push(options);
    }) as typeof box.scrollTo;
    await fixture.whenStable();
  }

  beforeEach(async () => {
    screen = installTestScreen();
    await draw();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves nothing to spare without a height it must not pass', () => {
    expect(scroller().spare()).toBeNull();
  });

  it('is as tall as the blocks that show, with its padding and border, and marks itself folded', () => {
    expect(box.style.blockSize).toBe(
      `${String(BORDER + PADDING + BLOCK + GAP + BLOCK + PADDING + BORDER)}px`,
    );
    expect(box.classList).toContain('folded');
  });

  it('grows to fit everything when nothing is folded', async () => {
    fixture.componentInstance.fold.set(null);
    await fixture.whenStable();

    expect(box.style.blockSize).toBe('');
    expect(box.classList).not.toContain('folded');
    expect(scroller().atStart()).toBe(true);
    expect(scroller().atEnd()).toBe(true);
  });

  it('starts at the top: it can go forward, not back', () => {
    expect(scroller().atStart()).toBe(true);
    expect(scroller().atEnd()).toBe(false);
  });

  it('goes forward one block at a time, smoothly', () => {
    scroller().forward();

    expect(scrolls).toEqual([{ top: BLOCK + GAP, behavior: 'smooth' }]);
  });

  it('goes back one block, and first realigns a block cut at the top', async () => {
    await scrollTo(2 * (BLOCK + GAP));
    scroller().back();
    await scrollTo(BLOCK + GAP + 10);
    scroller().back();

    expect(scrolls).toEqual([
      { top: BLOCK + GAP, behavior: 'smooth' },
      { top: BLOCK + GAP, behavior: 'smooth' },
    ]);
  });

  it('goes a block further at each press while it still moves', () => {
    scroller().forward();
    passBy(10);
    scroller().forward();
    scroller().forward();

    expect(asked()).toEqual([BLOCK + GAP, 2 * (BLOCK + GAP), 3 * (BLOCK + GAP)]);
  });

  it('goes back a block further at each press while it still moves', async () => {
    await scrollTo(4 * (BLOCK + GAP));
    scroller().back();
    passBy(4 * (BLOCK + GAP) - 10);
    scroller().back();
    scroller().back();

    expect(asked()).toEqual([3 * (BLOCK + GAP), 2 * (BLOCK + GAP), BLOCK + GAP]);
  });

  it('counts from where it rests once the reader has taken it elsewhere', async () => {
    scroller().forward();
    scroller().forward();
    await scrollTo(10);
    scroller().forward();

    expect(asked()).toEqual([BLOCK + GAP, 2 * (BLOCK + GAP), BLOCK + GAP]);
  });

  it('counts from where it is in a browser that never tells when a scroll ends', () => {
    const told = Object.getOwnPropertyDescriptor(window, 'onscrollend')!;
    Reflect.deleteProperty(window, 'onscrollend');
    try {
      scroller().forward();
      scroller().forward();

      expect(asked()).toEqual([BLOCK + GAP, BLOCK + GAP]);
    } finally {
      Object.defineProperty(window, 'onscrollend', told);
    }
  });

  it('stops at the end: the last step goes only as far as the box can scroll', async () => {
    const end = box.scrollHeight - box.clientHeight;
    await scrollTo(end - 5);
    scroller().forward();
    await scrollTo(end);

    expect(scrolls).toEqual([{ top: end, behavior: 'smooth' }]);
    expect(scroller().atStart()).toBe(false);
    expect(scroller().atEnd()).toBe(true);
  });

  it('names the block forward or back would bring into sight, without moving', async () => {
    // Blocks 0 and 1 show; then the box is scrolled half a block down.
    expect(scroller().nextHidden('forward')).toBe(2);

    await scrollTo(BLOCK + GAP + 10);

    expect(scroller().nextHidden('forward')).toBe(3);
    expect(scroller().nextHidden('back')).toBe(1);
    expect(scrolls).toEqual([]);
  });

  it('counts a block aligned at the top as shown, and one cut under the padding as hidden', async () => {
    await scrollTo(BLOCK + GAP);
    expect(scroller().nextHidden('back')).toBe(0);

    // Ten px down, the third block reaches under the bottom padding: it is not in sight yet.
    await scrollTo(10);
    expect(scroller().nextHidden('forward')).toBe(2);
  });

  it('names the first block back from the top and the last forward from the end', async () => {
    expect(scroller().nextHidden('back')).toBe(0);

    await scrollTo(box.scrollHeight - box.clientHeight);

    expect(scroller().nextHidden('forward')).toBe(COUNT - 1);
  });

  it('jumps without motion when the reader asks for less motion', () => {
    screen.set('(prefers-reduced-motion: reduce)', true);
    scroller().forward();

    expect(scrolls).toEqual([{ top: BLOCK + GAP, behavior: 'instant' }]);
  });

  describe('asked to bring some blocks into sight', () => {
    // Two blocks show, in 72 px between the paddings: 32 + 8 + 32.
    const STEP = BLOCK + GAP;
    const SIGHT = 2 * BLOCK + GAP;

    it('stays where it is when they are whole in sight', async () => {
      scroller().reveal(0, 1);
      await scrollTo(2 * STEP);
      scroller().reveal(2, 3);
      scroller().reveal(3, 3);

      expect(scrolls).toEqual([]);
    });

    it('puts the last one at the bottom when they are below, smoothly', () => {
      scroller().reveal(3, 3);

      expect(scrolls).toEqual([{ top: 3 * STEP + BLOCK - SIGHT, behavior: 'smooth' }]);
    });

    it('puts the last one at the bottom when the bottom cuts it', async () => {
      // Ten px down, the third block reaches under the bottom padding.
      await scrollTo(10);
      scroller().reveal(2, 2);

      expect(asked()).toEqual([STEP]);
    });

    it('puts the first one at the top when they start above it', async () => {
      await scrollTo(3 * STEP);
      scroller().reveal(1, 1);
      await scrollTo(STEP + 10);
      scroller().reveal(1, 2);

      expect(asked()).toEqual([STEP, STEP]);
    });

    it('puts the first one at the top when they do not all fit', () => {
      scroller().reveal(2, 4);

      expect(asked()).toEqual([2 * STEP]);
    });

    it('stays where it is with the first one at the top already, though they do not all fit', async () => {
      await scrollTo(2 * STEP);
      scroller().reveal(2, 4);

      expect(scrolls).toEqual([]);
    });

    it('takes a block before the first for the first, and one after the last for the last', async () => {
      scroller().reveal(4, 9);
      await scrollTo(4 * STEP);
      scroller().reveal(-3, 0);

      expect(asked()).toEqual([5 * STEP + BLOCK - SIGHT, 0]);
    });

    it('never asks for more than the box scrolls', () => {
      // The box scrolls 100 px, less than its blocks would need.
      Object.defineProperty(box, 'scrollHeight', {
        configurable: true,
        value: box.clientHeight + 100,
      });
      scroller().reveal(5, 5);

      expect(asked()).toEqual([100]);
    });

    it('counts from where the move under way will leave it, as the next move does from there', () => {
      scroller().forward();
      scroller().forward();
      // On its way to the third and fourth blocks.
      scroller().reveal(2, 3);
      scroller().reveal(5, 5);
      scroller().back();

      expect(asked()).toEqual([STEP, 2 * STEP, 5 * STEP + BLOCK - SIGHT, 3 * STEP]);
    });

    it('jumps without motion when the reader asks for less motion', () => {
      screen.set('(prefers-reduced-motion: reduce)', true);
      scroller().reveal(2, 2);

      expect(scrolls).toEqual([{ top: STEP, behavior: 'instant' }]);
    });

    it('does nothing in a box that shows everything, or that holds nothing', async () => {
      fixture.componentInstance.fold.set(null);
      await fixture.whenStable();
      scroller().reveal(5, 5);
      box.replaceChildren();
      scroller().reveal(0, 0);

      expect(scrolls).toEqual([]);
    });
  });

  describe('when its blocks change', () => {
    const FOLDED = `${String(BORDER + PADDING + BLOCK + GAP + BLOCK + PADDING + BORDER)}px`;

    async function hold(count: number): Promise<void> {
      fixture.componentInstance.blocks.set(Array.from({ length: count }, (_, index) => index));
      await fixture.whenStable();
    }

    it('folds once a block more than the fold joins, and grows back when it leaves', async () => {
      await hold(2);
      expect(box.style.blockSize).toBe('');
      expect(scroller().folded()).toBe(false);

      await hold(3);
      expect(box.style.blockSize).toBe(FOLDED);
      expect(scroller().folded()).toBe(true);
      expect(scroller().atEnd()).toBe(false);

      await hold(2);
      expect(box.style.blockSize).toBe('');
      expect(scroller().folded()).toBe(false);
      expect(scroller().atEnd()).toBe(true);
    });

    it('knows it is no longer at the end once a block joins below', async () => {
      await scrollTo(box.scrollHeight - box.clientHeight);
      expect(scroller().atEnd()).toBe(true);

      await hold(COUNT + 1);

      expect(scroller().atEnd()).toBe(false);
    });

    it('knows it is at the end once the last block below leaves', async () => {
      await scrollTo(3 * (BLOCK + GAP));
      expect(scroller().atEnd()).toBe(false);

      await hold(COUNT - 1);

      expect(scroller().atEnd()).toBe(true);
    });

    it('stays where the reader scrolled it', async () => {
      await scrollTo(BLOCK + GAP);
      await hold(COUNT + 1);

      expect(box.scrollTop).toBe(BLOCK + GAP);
      expect(scrolls).toEqual([]);
    });
  });

  describe('asked to open at a block', () => {
    beforeEach(() => {
      fixture.destroy();
    });

    it('is first drawn with that block at the top, and knows at once it can go back', async () => {
      await draw((host) => {
        host.start.set(3);
      });

      expect(box.scrollTop).toBe(3 * (BLOCK + GAP));
      expect(scroller().atStart()).toBe(false);
      expect(scroller().atEnd()).toBe(false);
      expect(scrolls).toEqual([]);
    });

    it('stays where the reader scrolled it when its height changes later', async () => {
      await draw((host) => {
        host.start.set(3);
      });
      await scrollTo(BLOCK + GAP);
      fixture.componentInstance.maxHeight.set(1000);
      await fixture.whenStable();

      expect(box.scrollTop).toBe(BLOCK + GAP);
    });

    it('waits until it scrolls: a box that shows everything opens at that block once folded', async () => {
      await draw((host) => {
        host.start.set(3);
        host.fold.set(null);
      });
      expect(box.scrollTop).toBe(0);

      fixture.componentInstance.fold.set(2);
      await fixture.whenStable();

      expect(box.scrollTop).toBe(3 * (BLOCK + GAP));
      expect(scroller().atStart()).toBe(false);
    });
  });

  describe('with a height it must not pass', () => {
    // Border, padding and three blocks: 1 + 8 + 32 + 8 + 32 + 8 + 32 + 8 + 1.
    const THREE = 130;

    it('shows the blocks that fit in it, even fewer than the fold', async () => {
      fixture.componentInstance.fold.set(null);
      fixture.componentInstance.maxHeight.set(THREE + 39);
      await fixture.whenStable();

      expect(box.style.blockSize).toBe(`${String(THREE)}px`);
      expect(box.classList).toContain('folded');
      expect(scroller().folded()).toBe(true);
    });

    it('keeps the fold when it is shorter', async () => {
      fixture.componentInstance.maxHeight.set(THREE);
      await fixture.whenStable();

      expect(box.style.blockSize).toBe(`${String(THREE - BLOCK - GAP)}px`);
    });

    it('shows one block at least, however little room there is', async () => {
      fixture.componentInstance.maxHeight.set(10);
      await fixture.whenStable();

      expect(box.style.blockSize).toBe(`${String(BORDER + PADDING + BLOCK + PADDING + BORDER)}px`);
    });

    it('shows the least blocks asked for when the room is shorter', async () => {
      fixture.componentInstance.fold.set(null);
      fixture.componentInstance.least.set(3);
      fixture.componentInstance.maxHeight.set(10);
      await fixture.whenStable();

      expect(box.style.blockSize).toBe(`${String(THREE)}px`);
    });

    it('says how much of it is left under the box, once the box shows its fold', async () => {
      fixture.componentInstance.maxHeight.set(THREE);
      await fixture.whenStable();

      expect(scroller().spare()).toBe(BLOCK + GAP);
    });

    it('says how much the box passes it, when even its fewest blocks do not fit', async () => {
      fixture.componentInstance.maxHeight.set(10);
      await fixture.whenStable();

      expect(scroller().spare()).toBe(10 - (BORDER + PADDING + BLOCK + PADDING + BORDER));
    });

    it('does not fold when everything fits', async () => {
      fixture.componentInstance.fold.set(null);
      fixture.componentInstance.maxHeight.set(1000);
      await fixture.whenStable();

      expect(box.style.blockSize).toBe('');
      expect(scroller().folded()).toBe(false);
    });
  });
});
