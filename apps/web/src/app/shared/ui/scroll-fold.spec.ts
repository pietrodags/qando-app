import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ScrollFold } from './scroll-fold';

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
    #scroller="appScrollFold"
    style="padding: 8px; border: 1px solid"
  >
    @for (block of blocks; track block) {
      <span>{{ block }}</span>
    }
  </div>`,
})
class Host {
  readonly fold = signal<number | null>(2);
  readonly blocks = Array.from({ length: COUNT }, (_, index) => index);
}

describe('ScrollFold', () => {
  let fixture: ComponentFixture<Host>;
  let box: HTMLElement;
  let scrolls: ScrollToOptions[];
  let reducedMotion: boolean;

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
      value: PADDING * 2 + COUNT * BLOCK + (COUNT - 1) * GAP,
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

  async function scrollTo(top: number): Promise<void> {
    box.scrollTop = top;
    box.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    reducedMotion = false;
    window.matchMedia = (query: string) =>
      ({
        matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion,
        media: query,
      }) as MediaQueryList;
    fixture = TestBed.createComponent(Host);
    box = (fixture.nativeElement as HTMLElement).querySelector('div')!;
    layOut();
    scrolls = [];
    box.scrollTo = ((options: ScrollToOptions) => {
      scrolls.push(options);
    }) as typeof box.scrollTo;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('stops at the end: the last step goes only as far as the box can scroll', async () => {
    const end = box.scrollHeight - box.clientHeight;
    await scrollTo(end - 5);
    scroller().forward();
    await scrollTo(end);

    expect(scrolls).toEqual([{ top: end, behavior: 'smooth' }]);
    expect(scroller().atStart()).toBe(false);
    expect(scroller().atEnd()).toBe(true);
  });

  it('jumps without motion when the reader asks for less motion', () => {
    reducedMotion = true;
    scroller().forward();

    expect(scrolls).toEqual([{ top: BLOCK + GAP, behavior: 'instant' }]);
  });
});
