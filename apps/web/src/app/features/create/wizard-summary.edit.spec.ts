import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { installTestScreen } from '../../../test/media-queries';
import { type DateSelection, NO_DATES } from './date-selection';
import type { DayTime, DayTimes } from './day-times';
import { WizardSummary } from './wizard-summary';
import offerStyles from './save-offer.scss' with { loader: 'text' };

const WIDE = '(min-width: 650px)';
const NO_MOUSE = '(hover: none), (pointer: coarse)';

const SATURDAY = '2026-06-20';
const SUNDAY = '2026-06-21';

// A column starts 120 px after the one before it.
const STRIDE = 120;

function at(time: string): DayTime {
  return { kind: 'single', at: time };
}

/** Saturday and Sunday, each a date of its own, and a range of days after them. */
function withTimes(times: Record<string, Partial<DayTimes>> = {}): DateSelection {
  const whole = Object.entries(times).map(([date, each]) => [
    date,
    { marked: [], saved: [], ...each },
  ]);
  return {
    ...NO_DATES,
    timed: true,
    singles: [SATURDAY, SUNDAY],
    saved: [{ start: '2026-06-24', end: '2026-06-26' }],
    times: Object.fromEntries(whole) as Record<string, DayTimes>,
  };
}

/** The days from the 20th of June on, `count` of them, each a date of its own without times. */
function days(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `2026-06-${String(20 + index)}`);
}

@Component({
  imports: [WizardSummary],
  template: `
    <p class="elsewhere">Fuera del paso</p>
    <app-wizard-summary [(selection)]="selection" />
  `,
})
class Host {
  readonly selection = signal<DateSelection>(NO_DATES);
}

describe('SaveOffer', () => {
  it('styles the row of the "+" button only with design tokens', () => {
    expect(literalValues(offerStyles)).toEqual([]);
  });
});

describe('WizardSummary, correcting a column', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(() => {
    // jsdom lays nothing out: the columns are placed as a browser would.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('column')) {
        const place = [...(this.parentElement?.children ?? [])].indexOf(this);
        return { left: 16 + place * STRIDE } as DOMRect;
      }
      return { left: 0, top: 0, bottom: 0, height: 0 } as DOMRect;
    });
  });

  afterEach(() => {
    (fixture.nativeElement as HTMLElement).remove();
    vi.restoreAllMocks();
  });

  async function render(selection: DateSelection, noMouse = false): Promise<void> {
    installTestScreen({ [WIDE]: true, [NO_MOUSE]: noMouse });
    TestBed.configureTestingModule({ imports: [Host], providers: [provideI18n()] });
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.selection.set(selection);
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
  }

  function step(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('app-wizard-summary')!;
  }

  function current(): DateSelection {
    return fixture.componentInstance.selection();
  }

  /** The list of options of a closed column, by the name of its day or days. */
  function list(name: string): HTMLElement | null {
    return step().querySelector<HTMLElement>(`ul[role="list"][aria-label="${name}"]`);
  }

  /** The columns open to correct: the times step's, each a group named after its day. */
  function open(): (string | null)[] {
    return [...step().querySelectorAll('app-hour-column')].map((column) =>
      column.getAttribute('aria-label'),
    );
  }

  function edits(): (string | null)[] {
    return [...step().querySelectorAll<HTMLButtonElement>('button.edit')].map((button) =>
      button.getAttribute('aria-label'),
    );
  }

  function edit(name: string): HTMLButtonElement {
    return step().querySelector<HTMLButtonElement>(`button.edit[aria-label="Editar ${name}"]`)!;
  }

  function check(): HTMLButtonElement | null {
    return step().querySelector<HTMLButtonElement>('app-hour-column button[aria-label="Listo"]');
  }

  function hour(time: string): HTMLButtonElement {
    const found = [...step().querySelectorAll<HTMLButtonElement>('button.time')].find(
      (each) => each.textContent.trim() === time,
    );
    if (!found) throw new Error(`No hour shows ${time}`);
    return found;
  }

  function arrow(name: string): HTMLButtonElement {
    return step().querySelector<HTMLButtonElement>(`app-step-pager button[aria-label="${name}"]`)!;
  }

  /** What screen readers hear of each option of a closed column. */
  function heard(name: string): string[] {
    return [...(list(name)?.querySelectorAll('li') ?? [])].map((item) => {
      const hidden = item.querySelector('.visually-hidden') ?? item;
      return hidden.textContent.trim();
    });
  }

  async function click(target: Element): Promise<void> {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await fixture.whenStable();
  }

  async function escape(): Promise<void> {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
  }

  /** The focus once the page has drawn what it moves it to. */
  async function focused(): Promise<Element | null> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    return document.activeElement;
  }

  it('asks to click on the column to correct with a mouse, and to touch it without one', async () => {
    await render(withTimes());
    expect(step().querySelector('.instructions')?.textContent.trim()).toBe(
      'Haz clic sobre la columna que quieras corregir.',
    );

    fixture.destroy();
    TestBed.resetTestingModule();
    await render(withTimes(), true);

    expect(step().querySelector('.instructions')?.textContent.trim()).toBe(
      'Toca la columna que quieras corregir.',
    );
  });

  it('has an "Editar" for each column of a date of its own, heard with its day, and none for a range of days', async () => {
    await render(withTimes());

    expect(edits()).toEqual(['Editar sábado, 20 de junio', 'Editar domingo, 21 de junio']);
    expect(edit('sábado, 20 de junio').textContent.trim()).toBe('Editar');
    expect(open()).toEqual([]);
  });

  it('opens a column of a date pressed anywhere on it, in place: the times step’s column of its day, the others as they were', async () => {
    await render(withTimes({ [SATURDAY]: { marked: [at('18:00')] } }));

    await click(list('sábado, 20 de junio')!.querySelector('li')!);

    expect(open()).toEqual(['sábado, 20 de junio']);
    expect(list('sábado, 20 de junio')).toBeNull();
    expect(list('domingo, 21 de junio')).not.toBeNull();
    expect(list('miércoles, 24 de junio a viernes, 26 de junio')).not.toBeNull();
    expect(hour('18:00').closest('.row')?.classList.contains('marked')).toBe(true);
  });

  it('does not open a range of days, which has nothing to correct', async () => {
    await render(withTimes());

    await click(list('miércoles, 24 de junio a viernes, 26 de junio')!.querySelector('li')!);

    expect(open()).toEqual([]);
  });

  it('does not open a long column with its "︿" or "﹀", which only scroll it', async () => {
    // jsdom lays nothing out: a folded box holds more than it shows, as in a browser.
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.style.blockSize === '' ? 0 : 500;
      },
    });
    const twelve = Array.from({ length: 12 }, (_, hour) =>
      at(`${String(hour + 8).padStart(2, '0')}:00`),
    );
    // Nor does it scroll: the arrow's scroll is stood in.
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: () => undefined,
    });
    await render(withTimes({ [SATURDAY]: { marked: twelve } }));
    const fold = step().querySelector<HTMLButtonElement>('.fold-arrow:not([disabled])');

    expect(fold?.textContent.trim()).toBe('﹀');
    await click(fold!);
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');

    expect(open()).toEqual([]);
  });

  it('opens with its "Editar", as the keyboard’s Enter presses it, and the focus goes to the open column', async () => {
    await render(withTimes());

    edit('domingo, 21 de junio').focus();
    await click(edit('domingo, 21 de junio'));

    expect(open()).toEqual(['domingo, 21 de junio']);
    expect((await focused())?.getAttribute('aria-label')).toBe('domingo, 21 de junio');
  });

  it('gives the dates what is corrected in the open column, and shows it once closed', async () => {
    await render(withTimes({ [SATURDAY]: { marked: [at('18:00')] } }));
    await click(edit('sábado, 20 de junio'));

    await click(hour('18:00'));
    await click(hour('10:00'));

    expect(current().times[SATURDAY]?.marked).toEqual([at('10:00')]);

    await click(check()!);

    expect(open()).toEqual([]);
    expect(heard('sábado, 20 de junio')).toEqual(['10:00']);
  });

  it('closes with its check, "Listo", there from the moment it opens, and the focus is back on its "Editar"', async () => {
    await render(withTimes());
    await click(edit('sábado, 20 de junio'));

    expect(check()).not.toBeNull();
    expect(check()?.closest('.clear-place')).not.toBeNull();
    await click(check()!);

    expect(open()).toEqual([]);
    expect(await focused()).toBe(edit('sábado, 20 de junio'));
  });

  it('opens another column pressed instead', async () => {
    await render(withTimes());
    await click(edit('sábado, 20 de junio'));

    await click(list('domingo, 21 de junio')!.querySelector('li')!);

    expect(open()).toEqual(['domingo, 21 de junio']);
    expect(list('sábado, 20 de junio')).not.toBeNull();
  });

  it('stays open with a press inside it, and closes with a press anywhere outside it, keeping what was corrected', async () => {
    await render(withTimes());
    await click(edit('sábado, 20 de junio'));

    await click(hour('11:00'));
    expect(open()).toEqual(['sábado, 20 de junio']);

    await click(list('miércoles, 24 de junio a viernes, 26 de junio')!);
    expect(open()).toEqual([]);

    await click(edit('sábado, 20 de junio'));
    await click(step().querySelector('.instructions')!);
    expect(open()).toEqual([]);

    await click(edit('sábado, 20 de junio'));
    await click((fixture.nativeElement as HTMLElement).querySelector('.elsewhere')!);
    expect(open()).toEqual([]);
    expect(current().times[SATURDAY]?.marked).toEqual([at('11:00')]);
  });

  it('closes with Escape, keeping what was corrected, and the focus is back on its "Editar"', async () => {
    await render(withTimes());
    await click(edit('domingo, 21 de junio'));
    await click(hour('12:00'));

    await escape();

    expect(open()).toEqual([]);
    expect(current().times[SUNDAY]?.marked).toEqual([at('12:00')]);
    expect(await focused()).toBe(edit('domingo, 21 de junio'));
  });

  it('closes when the step’s arrows move the columns', async () => {
    await render({ ...NO_DATES, timed: true, singles: days(6) });
    await click(edit('sábado, 20 de junio'));

    await click(arrow('Día siguiente'));

    expect(open()).toEqual([]);
  });

  it('closes when a finger slides the columns sideways', async () => {
    await render({ ...NO_DATES, timed: true, singles: days(6) }, true);
    await click(edit('domingo, 21 de junio'));
    const column = step().querySelector<HTMLElement>('.column');
    const touch = (type: string, x?: number): void => {
      const touches = x === undefined ? [] : [{ identifier: 1, clientX: x, clientY: 300 }];
      const event = new Event(type, { bubbles: true, cancelable: true });
      column?.dispatchEvent(Object.assign(event, { touches }));
    };

    touch('touchstart', 300);
    touch('touchmove', 180);
    touch('touchend');
    await fixture.whenStable();

    expect(open()).toEqual([]);
  });

  describe('without a mouse', () => {
    function adder(): HTMLButtonElement | null {
      return step().querySelector<HTMLButtonElement>('button.adder');
    }

    it('has the row of the "+" button only while a column is open', async () => {
      await render(withTimes({ [SATURDAY]: { marked: [at('18:00')] } }), true);
      expect(step().querySelector('.tools')).toBeNull();

      await click(edit('sábado, 20 de junio'));

      expect(step().querySelector('.tools')).not.toBeNull();
      expect(adder()).not.toBeNull();
    });

    it('shows the "+" of the open column with the button, which leaves it open, and a "+" saves its time', async () => {
      await render(withTimes({ [SATURDAY]: { marked: [at('18:00')] } }), true);
      await click(edit('sábado, 20 de junio'));

      await click(adder()!);

      expect(open()).toEqual(['sábado, 20 de junio']);
      const plus = step().querySelector<HTMLButtonElement>('button.save.offered');
      expect(plus).not.toBeNull();

      await click(plus!);

      expect(current().times[SATURDAY]).toEqual({ marked: [], saved: [at('18:00')] });
      expect(open()).toEqual(['sábado, 20 de junio']);
    });
  });
});
