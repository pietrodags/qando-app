import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { type DateRange } from './date-selection';
import { SavedRanges } from './saved-ranges';
import rangesStyles from './saved-ranges.scss' with { loader: 'text' };

describe('SavedRanges', () => {
  const first: DateRange = { start: '2026-06-17', end: '2026-06-19' };
  const second: DateRange = { start: '2026-06-29', end: '2026-07-02' };
  const third: DateRange = { start: '2026-07-06', end: '2026-07-08' };

  let fixture: ComponentFixture<SavedRanges>;
  let previewed: (DateRange | null)[];
  let removed: DateRange[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SavedRanges], providers: [provideI18n()] });
  });

  async function render(ranges: readonly DateRange[], touch = false): Promise<void> {
    fixture = TestBed.createComponent(SavedRanges);
    fixture.componentRef.setInput('ranges', ranges);
    fixture.componentRef.setInput('touch', touch);
    previewed = [];
    removed = [];
    fixture.componentInstance.previewed.subscribe((range) => previewed.push(range));
    fixture.componentInstance.removed.subscribe((range) => removed.push(range));
    await fixture.whenStable();
  }

  /** As `render`, with a page that deletes the range of every "−" pressed. */
  async function renderDeleting(ranges: readonly DateRange[]): Promise<void> {
    await render(ranges);
    fixture.componentInstance.removed.subscribe((range) => {
      fixture.componentRef.setInput(
        'ranges',
        fixture.componentInstance.ranges().filter((each) => each !== range),
      );
    });
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function all(selector: string): HTMLElement[] {
    return [...host().querySelectorAll<HTMLElement>(selector)];
  }

  /** A pill, by its place: the pill itself, what shows its range, and its "−" if it has one. */
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

  it('has a pill for each range, in order, heard with "a" in place of the arrow', async () => {
    await render([first, second]);

    expect(all('ul > li')).toHaveLength(2);
    expect(all('.pill-view').map((each) => each.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'Mié 17 ➔a Vie 19',
      'Lun 29 ➔a Jue 2',
    ]);
    expect(pill(0).view.querySelector('[aria-hidden="true"]')?.textContent).toBe('➔');
    expect(pill(0).view.querySelector('.visually-hidden')?.textContent).toBe('a');
    expect(pill(0).view.hasAttribute('aria-label')).toBe(false);
    expect(all('button').every((each) => each.getAttribute('type') === 'button')).toBe(true);
  });

  it('pins the range of the pill pressed, another one after it, and lets go on a second press', async () => {
    await render([first, second]);
    expect(pressed()).toEqual(['false', 'false']);

    await click(pill(1).view);
    expect(fixture.componentInstance.pinned()).toBe(second);
    expect(pressed()).toEqual(['false', 'true']);
    expect(all('.pill').map((each) => each.classList.contains('pinned'))).toEqual([false, true]);

    await click(pill(0).view);
    expect(fixture.componentInstance.pinned()).toBe(first);
    expect(pressed()).toEqual(['true', 'false']);

    await click(pill(0).view);
    expect(fixture.componentInstance.pinned()).toBeNull();
    expect(pressed()).toEqual(['false', 'false']);
  });

  it('shows as pinned the range the page pins', async () => {
    await render([first, second]);

    fixture.componentRef.setInput('pinned', first);
    await fixture.whenStable();

    expect(pressed()).toEqual(['true', 'false']);
  });

  it('tells which range the mouse is over, and when it leaves', async () => {
    await render([first, second]);

    await point(pill(1).item, 'pointerenter');
    expect(previewed).toEqual([second]);

    await point(pill(1).item, 'pointerleave');
    expect(previewed).toEqual([second, null]);
  });

  it('does not take a finger’s touch for a mouse resting', async () => {
    await render([first, second], true);

    await point(pill(0).item, 'pointerenter', 'touch');

    expect(previewed).toEqual([]);
  });

  describe('the "−" of a pill', () => {
    it('is on every pill while none is pinned, named by its range', async () => {
      await render([first, second]);

      expect(host().classList.contains('touch')).toBe(false);
      expect(all('.remove').map((each) => each.getAttribute('aria-label'))).toEqual([
        'Eliminar el rango del 17 de junio al 19 de junio',
        'Eliminar el rango del 29 de junio al 2 de julio',
      ]);
      expect(pill(0).remove?.title).toBe('Eliminar este rango de fechas');
      expect(pill(0).remove?.textContent.trim()).toBe('−');

      await click(pill(0).view);
      expect(all('.remove')).toEqual([]);

      await click(pill(0).view);
      expect(all('.remove')).toHaveLength(2);
    });

    it('is only on the pinned pill without a mouse', async () => {
      await render([first, second], true);
      expect(host().classList.contains('touch')).toBe(true);
      expect(all('.remove')).toEqual([]);

      await click(pill(1).view);

      expect(pill(0).remove).toBeNull();
      expect(pill(1).remove?.getAttribute('aria-label')).toBe(
        'Eliminar el rango del 29 de junio al 2 de julio',
      );
    });

    it('tells the page which range to delete', async () => {
      await render([first, second]);

      await click(pill(1).remove);

      expect(removed).toEqual([second]);
    });

    it('gives the focus to the pill that takes the place of the deleted one', async () => {
      await renderDeleting([first, second, third]);

      await click(pill(1).remove);

      expect(document.activeElement).toBe(pill(1).view);
      expect(pill(1).view.textContent).toContain('Lun 6');
    });

    it('gives the focus to the last pill when the last one is deleted', async () => {
      await renderDeleting([first, second, third]);

      await click(pill(2).remove);

      expect(document.activeElement).toBe(pill(1).view);
    });

    it('leaves the focus where it is while the page keeps the range', async () => {
      await render([first, second]);
      pill(0).remove?.focus();

      await click(pill(0).remove);

      expect(document.activeElement).toBe(pill(0).remove);
    });
  });

  it('is styled only with tokens', () => {
    expect(literalValues(rangesStyles)).toEqual([]);
  });
});
