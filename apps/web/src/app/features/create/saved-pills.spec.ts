import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { literalValues } from '../../../styles/token-usage';
import { installTestScreen } from '../../../test/media-queries';
import { type SavedPill, SavedPills } from './saved-pills';
import pillsStyles from './saved-pills.scss' with { loader: 'text' };

/** A pill as a page gives it: what the list needs, and a label for the page's own template. */
interface Named extends SavedPill<string> {
  readonly label: string;
}

function named(item: string): Named {
  return {
    item,
    label: `The ${item} one`,
    removeTitle: `Remove ${item}`,
    removeName: `Remove the ${item} one`,
  };
}

// A stacked pill is 28 px tall, 8 px from the next.
const PILL = 28;
const GAP = 8;

@Component({
  imports: [SavedPills],
  template: `<app-saved-pills
    [pills]="pills()"
    [touch]="touch()"
    [stacked]="stacked()"
    [(pinned)]="pinned"
    (previewed)="previewed.push($event)"
    (removed)="remove($event)"
  >
    <ng-template let-pill
      ><b class="label">{{ pill.label }}</b></ng-template
    >
  </app-saved-pills>`,
})
class Host {
  readonly pills = signal<readonly Named[]>([]);
  readonly touch = signal(false);
  readonly stacked = signal(false);
  readonly pinned = signal<string | null>(null);
  readonly previewed: (string | null)[] = [];
  readonly removed: string[] = [];
  /** The page deletes the item of every "−" pressed. */
  deleting = false;

  remove(item: string): void {
    this.removed.push(item);
    if (this.deleting) this.pills.update((pills) => pills.filter((each) => each.item !== item));
  }
}

describe('SavedPills', () => {
  let fixture: ComponentFixture<Host>;
  let page: Host;
  let scrolls: ScrollToOptions[];

  /** The list lays its pills out as a browser would, one under another. */
  function layOut(): void {
    const top = 100;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this === list()) return { top, bottom: top + list().clientHeight } as DOMRect;
      const index = Array.from(list().children).indexOf(this);
      if (index === -1) return { top: 0, bottom: 0 } as DOMRect;
      const start = top + index * (PILL + GAP) - list().scrollTop;
      return { top: start, bottom: start + PILL } as DOMRect;
    });
    Object.defineProperty(list(), 'scrollHeight', {
      get: () => list().children.length * (PILL + GAP) - GAP,
    });
    Object.defineProperty(list(), 'clientHeight', {
      // Without a height of its own the list shows all it holds.
      get: () =>
        list().style.blockSize === ''
          ? list().scrollHeight
          : Number.parseFloat(list().style.blockSize),
    });
    list().scrollTo = ((options: ScrollToOptions) => {
      scrolls.push(options);
    }) as HTMLElement['scrollTo'];
  }

  async function render(
    items: readonly string[],
    prepare: (host: Host) => void = () => undefined,
  ): Promise<void> {
    fixture = TestBed.createComponent(Host);
    page = fixture.componentInstance;
    page.pills.set(items.map(named));
    // A computer with a mouse, and the pills side by side, unless the page says otherwise.
    prepare(page);
    scrolls = [];
    layOut();
    await fixture.whenStable();
  }

  async function show(items: readonly string[]): Promise<void> {
    page.pills.set(items.map(named));
    await fixture.whenStable();
  }

  function host(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('app-saved-pills')!;
  }

  function list(): HTMLElement {
    return host().querySelector<HTMLElement>('ul.pills')!;
  }

  function all(selector: string): HTMLElement[] {
    return [...host().querySelectorAll<HTMLElement>(selector)];
  }

  /** A pill, by its place: the pill itself, what shows its label, and its "−" if it has one. */
  function pill(place: number): {
    item: HTMLElement;
    view: HTMLElement;
    remove: HTMLElement | null;
  } {
    const item = all('.pill')[place];
    const view = item?.querySelector<HTMLElement>('.pill-view');
    if (!item || !view) throw new Error(`No pill ${String(place)}`);
    return { item, view, remove: item.querySelector<HTMLElement>('.remove') };
  }

  function pressed(): (string | null)[] {
    return all('.pill-view').map((each) => each.getAttribute('aria-pressed'));
  }

  async function click(target: HTMLElement | null): Promise<void> {
    if (!target) throw new Error('Nothing to press');
    target.click();
    await fixture.whenStable();
  }

  /** A pointer event as jsdom has them: a mouse event that says which pointer made it. */
  async function point(target: Element, type: string, pointerType = 'mouse'): Promise<void> {
    const event = new MouseEvent(type);
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    target.dispatchEvent(event);
    await fixture.whenStable();
  }

  beforeEach(() => {
    installTestScreen();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has a pill for each item, in order, each reading what the page’s template gives it', async () => {
    await render(['first', 'second']);

    expect(all('ul > li')).toHaveLength(2);
    expect(all('.pill-view').map((each) => each.textContent.trim())).toEqual([
      'The first one',
      'The second one',
    ]);
    expect(pill(0).view.querySelector('b.label')?.textContent).toBe('The first one');
    expect(pill(0).view.hasAttribute('aria-label')).toBe(false);
    expect(all('button').every((each) => each.getAttribute('type') === 'button')).toBe(true);
  });

  it('keeps its pills when the page gives new ones for the same items', async () => {
    await render(['first', 'second']);
    const before = all('.pill-view');

    await show(['first', 'second']);

    expect(all('.pill-view')).toEqual(before);
    expect(all('.pill-view')[0]).toBe(before[0]);
  });

  it('pins the item of the pill pressed, another one after it, and lets go on a second press', async () => {
    await render(['first', 'second']);
    expect(pressed()).toEqual(['false', 'false']);

    await click(pill(1).view);
    expect(page.pinned()).toBe('second');
    expect(pressed()).toEqual(['false', 'true']);
    expect(all('.pill').map((each) => each.classList.contains('pinned'))).toEqual([false, true]);

    await click(pill(0).view);
    expect(page.pinned()).toBe('first');
    expect(pressed()).toEqual(['true', 'false']);

    await click(pill(0).view);
    expect(page.pinned()).toBeNull();
    expect(pressed()).toEqual(['false', 'false']);
  });

  it('shows as pinned the item the page pins', async () => {
    await render(['first', 'second']);

    page.pinned.set('first');
    await fixture.whenStable();

    expect(pressed()).toEqual(['true', 'false']);
  });

  it('tells which item the mouse is over, and when it leaves', async () => {
    await render(['first', 'second']);

    await point(pill(1).item, 'pointerenter');
    expect(page.previewed).toEqual(['second']);

    await point(pill(1).item, 'pointerleave');
    expect(page.previewed).toEqual(['second', null]);
  });

  it('does not take a finger’s touch for a mouse resting', async () => {
    await render(['first', 'second'], (made) => {
      made.touch.set(true);
    });

    await point(pill(0).item, 'pointerenter', 'touch');

    expect(page.previewed).toEqual([]);
  });

  describe('the "−" of a pill', () => {
    it('is on every pill while none is pinned, with the tip and the name its pill gives', async () => {
      await render(['first', 'second']);

      expect(host().classList.contains('touch')).toBe(false);
      expect(all('.remove').map((each) => each.getAttribute('aria-label'))).toEqual([
        'Remove the first one',
        'Remove the second one',
      ]);
      expect(all('.remove').map((each) => each.title)).toEqual(['Remove first', 'Remove second']);
      expect(pill(0).remove?.textContent.trim()).toBe('−');

      await click(pill(0).view);
      expect(all('.remove')).toEqual([]);

      await click(pill(0).view);
      expect(all('.remove')).toHaveLength(2);
    });

    it('is only on the pinned pill without a mouse', async () => {
      await render(['first', 'second'], (made) => {
        made.touch.set(true);
      });
      expect(host().classList.contains('touch')).toBe(true);
      expect(all('.remove')).toEqual([]);

      await click(pill(1).view);

      expect(pill(0).remove).toBeNull();
      expect(pill(1).remove?.getAttribute('aria-label')).toBe('Remove the second one');
    });

    it('tells the page which item to delete', async () => {
      await render(['first', 'second']);

      await click(pill(1).remove);

      expect(page.removed).toEqual(['second']);
    });

    it('gives the focus to the pill that takes the place of the deleted one', async () => {
      await render(['first', 'second', 'third'], (made) => {
        made.deleting = true;
      });

      await click(pill(1).remove);

      expect(document.activeElement).toBe(pill(1).view);
      expect(pill(1).view.textContent).toContain('The third one');
    });

    it('gives the focus to the last pill when the last one is deleted', async () => {
      await render(['first', 'second', 'third'], (made) => {
        made.deleting = true;
      });

      await click(pill(2).remove);

      expect(document.activeElement).toBe(pill(1).view);
    });

    it('leaves the focus where it is while the page keeps the item', async () => {
      await render(['first', 'second']);
      pill(0).remove?.focus();

      await click(pill(0).remove);

      expect(document.activeElement).toBe(pill(0).remove);
    });
  });

  describe('stacked', () => {
    const FIVE = ['first', 'second', 'third', 'fourth', 'fifth'];
    const FOUR = FIVE.slice(0, 4);
    const stacked = (made: Host): void => {
      made.stacked.set(true);
    };

    function folds(): HTMLElement[] {
      return all('button.fold');
    }

    function asked(): (number | undefined)[] {
      return scrolls.map((scroll) => scroll.top);
    }

    it('says so to its stylesheet, and only then', async () => {
      await render(FOUR);
      expect(host().classList.contains('stacked')).toBe(false);

      page.stacked.set(true);
      await fixture.whenStable();

      expect(host().classList.contains('stacked')).toBe(true);
    });

    it('shows four pills at most, the rest under ︿ ﹀, which are not for the keyboard', async () => {
      await render(FIVE, stacked);

      expect(list().style.blockSize).toBe(`${String(4 * PILL + 3 * GAP)}px`);
      expect(list().classList).toContain('folded');
      expect(folds().map((each) => each.textContent.trim())).toEqual(['︿', '﹀']);
      expect(folds()[0]?.nextElementSibling).toBe(list());
      expect(folds()[1]?.previousElementSibling).toBe(list());
      for (const each of folds()) {
        expect(each.getAttribute('type')).toBe('button');
        expect(each.getAttribute('aria-hidden')).toBe('true');
        expect(each.tabIndex).toBe(-1);
      }
      expect(folds().map((each) => each.classList.contains('spent'))).toEqual([true, false]);
    });

    it('moves a pill down with ﹀ and back up with ︿, each greyed where it has nothing to show', async () => {
      await render(FIVE, stacked);

      folds()[1]?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      folds()[1]?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
      expect(asked()).toEqual([PILL + GAP]);

      list().scrollTop = PILL + GAP;
      list().dispatchEvent(new Event('scroll'));
      list().dispatchEvent(new Event('scrollend'));
      await fixture.whenStable();
      expect(folds().map((each) => each.classList.contains('spent'))).toEqual([false, true]);

      folds()[0]?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      folds()[0]?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
      expect(asked()).toEqual([PILL + GAP, 0]);
    });

    it('has no ︿ ﹀ while its pills are four or fewer', async () => {
      await render(FOUR, stacked);

      expect(list().style.blockSize).toBe('');
      expect(list().classList).not.toContain('folded');
      expect(folds()).toEqual([]);
    });

    it('never folds side by side, however many pills', async () => {
      await render(FIVE);

      expect(list().style.blockSize).toBe('');
      expect(list().classList).not.toContain('folded');
      expect(folds()).toEqual([]);
    });

    it('brings into sight a pill that joins below the ones shown', async () => {
      await render(FIVE, stacked);
      expect(asked()).toEqual([]);

      await show([...FIVE, 'sixth']);

      // The sixth at the bottom: two pills down.
      expect(scrolls).toEqual([{ top: 2 * (PILL + GAP), behavior: 'smooth' }]);
    });

    it('brings into sight a pill that joins above the ones shown', async () => {
      await render(FIVE, stacked);
      list().scrollTop = PILL + GAP;
      list().dispatchEvent(new Event('scroll'));
      list().dispatchEvent(new Event('scrollend'));

      await show(['zeroth', ...FIVE]);

      expect(asked()).toEqual([0]);
    });

    it('folds with the fifth pill and brings it into sight, and unfolds without it', async () => {
      await render(FOUR, stacked);

      await show(FIVE);
      expect(list().classList).toContain('folded');
      expect(folds()).toHaveLength(2);
      expect(asked()).toEqual([PILL + GAP]);

      await show(FOUR);
      expect(list().style.blockSize).toBe('');
      expect(folds()).toEqual([]);
    });

    it('stays where it is when the pill that joins is in sight, or when one leaves', async () => {
      await render(FIVE, stacked);

      await show(['first', 'new', ...FIVE.slice(1)]);
      await show(FIVE);
      // New pills for the same items are no new item.
      await show(FIVE);

      expect(scrolls).toEqual([]);
    });
  });

  it('is styled only with tokens', () => {
    expect(literalValues(pillsStyles)).toEqual([]);
  });
});
