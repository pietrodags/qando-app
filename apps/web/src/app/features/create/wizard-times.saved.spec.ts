import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { installTestScreen } from '../../../test/media-queries';
import { type DateSelection, NO_DATES, optionCount } from './date-selection';
import type { DayTime, DayTimes } from './day-times';
import type { ColumnEdit } from './time-columns';
import { WizardTimes } from './wizard-times';

const WIDE = '(min-width: 650px)';
const NO_MOUSE = '(hover: none), (pointer: coarse)';

const SATURDAY = '2026-06-20';
const SUNDAY = '2026-06-21';

function at(time: string): DayTime {
  return { kind: 'single', at: time };
}

function at2(first: string, second: string): DayTime[] {
  return [at(first), at(second)];
}

function selectionWith(times: Record<string, Partial<DayTimes>>): DateSelection {
  const whole = Object.entries(times).map(([date, each]) => [
    date,
    { marked: [], saved: [], ...each },
  ]);
  return {
    ...NO_DATES,
    timed: true,
    singles: [SATURDAY, SUNDAY],
    times: Object.fromEntries(whole) as Record<string, DayTimes>,
  };
}

@Component({
  imports: [WizardTimes],
  template: `<app-wizard-times [(selection)]="selection" [alone]="alone()" />`,
})
class Host {
  readonly selection = signal<DateSelection>(NO_DATES);
  readonly alone = signal<ColumnEdit | null>(null);
}

describe('WizardTimes, saving times', () => {
  let fixture: ComponentFixture<Host>;

  afterEach(() => {
    (fixture.nativeElement as HTMLElement).remove();
  });

  async function render(
    selection: DateSelection,
    noMouse: boolean,
    alone: ColumnEdit | null = null,
  ): Promise<void> {
    installTestScreen({ [WIDE]: true, [NO_MOUSE]: noMouse });
    TestBed.configureTestingModule({ imports: [Host], providers: [provideI18n()] });
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.selection.set(selection);
    fixture.componentInstance.alone.set(alone);
    // In the page: the focus is followed, and a click reaches the document.
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
  }

  function step(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function current(): DateSelection {
    return fixture.componentInstance.selection();
  }

  function adder(): HTMLButtonElement | null {
    return step().querySelector<HTMLButtonElement>('button.adder');
  }

  function pluses(): HTMLButtonElement[] {
    return [...step().querySelectorAll<HTMLButtonElement>('button.save')];
  }

  function shown(): boolean[] {
    return pluses().map((each) => each.classList.contains('offered'));
  }

  function pills(): HTMLButtonElement[] {
    return [...step().querySelectorAll<HTMLButtonElement>('app-saved-pills button.pill-view')];
  }

  function hourOf(column: number, time: string): HTMLButtonElement {
    const list = step().querySelectorAll('app-hour-column')[column]!;
    return [...list.querySelectorAll<HTMLButtonElement>('button.time')].find(
      (each) => each.textContent.trim() === time,
    )!;
  }

  async function click(target: HTMLElement): Promise<void> {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await fixture.whenStable();
  }

  const MARKED = selectionWith({
    [SATURDAY]: { marked: [at('10:00'), at('18:00')] },
    [SUNDAY]: { marked: [at('12:00')], saved: [at('09:00'), at('20:00')] },
  });

  it('shows the saved times of each day under its column', async () => {
    await render(MARKED, false);

    const columns = [...step().querySelectorAll('app-hour-column')];
    expect(columns.map((each) => each.querySelectorAll('button.pill-view').length)).toEqual([0, 2]);
  });

  describe('with a mouse', () => {
    it('has no button for the "+": the mouse finds each on its time', async () => {
      await render(MARKED, false);

      expect(step().querySelector('.tools')).toBeNull();
      expect(adder()).toBeNull();
      expect(shown()).toEqual([false, false, false]);
    });

    it('leaves the "−" on every pill', async () => {
      await render(MARKED, false);

      expect(step().querySelectorAll('button.remove')).toHaveLength(2);
    });
  });

  describe('without a mouse', () => {
    it('on a column corrected alone, has a button for its marked times, and shows only its "+"', async () => {
      await render(MARKED, true, { date: SUNDAY, first: 0 });

      await click(adder()!);

      expect(shown()).toEqual([false, false, true]);
    });

    it('on a column corrected alone, has no button for the marked times of the others', async () => {
      await render(selectionWith({ [SATURDAY]: { marked: [at('10:00')] } }), true, {
        date: SUNDAY,
        first: 0,
      });

      expect(adder()).toBeNull();
    });

    it('has a button for the "+" once a day on screen has a marked time', async () => {
      await render(selectionWith({ [SUNDAY]: { saved: [at('09:00')] } }), true);
      expect(step().querySelector('.tools')).not.toBeNull();
      expect(adder()).toBeNull();

      await click(hourOf(0, '10:00'));

      expect(adder()!.getAttribute('aria-label')).toBe('Guardar una hora');
    });

    it('has no button for a marked time on a day that is not on screen, until it is', async () => {
      const days = ['2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24'];
      const fifth = selectionWith({ '2026-06-24': { marked: [at('10:00')] } });
      await render({ ...fifth, singles: days }, true);
      expect(step().querySelector('.tools')).not.toBeNull();
      expect(adder()).toBeNull();

      await click(step().querySelector<HTMLElement>('button[aria-label="Día siguiente"]')!);

      expect(adder()).not.toBeNull();
    });

    it('counts no range of days on screen, which has no times', async () => {
      const selection = selectionWith({ [SUNDAY]: { saved: [at('09:00')] } });
      const ranges = [{ start: '2026-06-22', end: '2026-06-24' }];
      await render({ ...selection, ranges }, true);
      expect(step().querySelectorAll('.no-times')).toHaveLength(1);
      expect(adder()).toBeNull();

      await click(hourOf(0, '10:00'));

      expect(adder()).not.toBeNull();
    });

    it('shows the "+" of every marked time when it is pressed, and gives way to them', async () => {
      await render(MARKED, true);
      adder()!.focus();

      await click(adder()!);

      expect(shown()).toEqual([true, true, true]);
      expect(adder()).toBeNull();
      expect(document.activeElement).toBe(pluses()[0]);
    });

    it('saves a time with its "+", and is back with the others hidden again', async () => {
      await render(MARKED, true);
      await click(adder()!);

      await click(pluses()[1]!);

      expect(current().times[SATURDAY]).toEqual({ marked: [at('10:00')], saved: [at('18:00')] });
      expect(shown()).toEqual([false, false]);
      expect(adder()).not.toBeNull();
    });

    it('hides them again with a press anywhere else, which does what it does', async () => {
      await render(MARKED, true);
      await click(adder()!);

      await click(hourOf(1, '14:00'));

      expect(current().times[SUNDAY]!.marked).toEqual([at('12:00'), at('14:00')]);
      expect(shown()).toEqual([false, false, false, false]);
      expect(adder()).not.toBeNull();
    });

    it('hides them with a press that changes nothing', async () => {
      await render(MARKED, true);
      await click(adder()!);

      await click(step().querySelector<HTMLElement>('.instructions')!);

      expect(shown()).toEqual([false, false, false]);
    });

    it('hides them with Escape, and takes back the focus one of them may have', async () => {
      await render(MARKED, true);
      await click(adder()!);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await fixture.whenStable();

      expect(shown()).toEqual([false, false, false]);
      expect(document.activeElement).toBe(adder());
    });

    it('leaves the focus where it is when Escape finds no "+" asked for', async () => {
      await render(MARKED, true);
      hourOf(0, '10:00').focus();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await fixture.whenStable();

      expect(document.activeElement).toBe(hourOf(0, '10:00'));
    });

    it('tells the pills: the "−" is only on the one pressed', async () => {
      await render(MARKED, true);
      expect(step().querySelectorAll('button.remove')).toHaveLength(0);

      await click(pills()[0]!);

      expect(step().querySelectorAll('button.remove')).toHaveLength(1);
    });
  });
  describe('with a column out of sight', () => {
    const DAYS = ['2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24'];
    /** Five days, four on screen: the first and the second have a marked time. */
    const FIVE: DateSelection = {
      ...NO_DATES,
      timed: true,
      singles: DAYS,
      times: {
        [DAYS[0]!]: { marked: [at('10:00')], saved: [] },
        [DAYS[1]!]: { marked: [at('12:00')], saved: [] },
      },
    };

    it('shows the "+" of the columns on screen alone, the first of them taking the focus', async () => {
      await render(FIVE, true);
      await click(step().querySelector<HTMLElement>('button[aria-label="Día siguiente"]')!);

      await click(adder()!);

      expect(shown()).toEqual([false, true]);
      expect(document.activeElement).toBe(pluses()[1]);
    });
  });

  describe('while a saved time of a column is edited, with a mouse', () => {
    const SAVED = selectionWith({
      [SATURDAY]: { saved: [at('09:00')] },
      [SUNDAY]: { saved: [at('20:00')] },
    });

    function column(place: number): Element {
      return step().querySelectorAll('app-hour-column')[place]!;
    }

    it('takes the "−" from the pills of the other columns, until the edit ends', async () => {
      await render(SAVED, false);
      expect(column(1).querySelectorAll('button.remove')).toHaveLength(1);

      await click(pills()[0]!);
      expect(column(1).querySelectorAll('button.remove')).toHaveLength(0);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await fixture.whenStable();
      expect(column(1).querySelectorAll('button.remove')).toHaveLength(1);
    });

    it('frames no time of another column under the mouse', async () => {
      await render(SAVED, false);
      await click(pills()[0]!);

      pills()[1]!.parentElement!.dispatchEvent(
        new PointerEvent('pointerenter', { pointerType: 'mouse' }),
      );
      await fixture.whenStable();

      expect(column(1).querySelector('.frame')).toBeNull();
    });

    it('gives the "−" back to the first column when the pill of the second is pressed', async () => {
      await render(SAVED, false);
      await click(pills()[0]!);

      await click(pills()[1]!);

      expect(column(0).querySelectorAll('button.remove')).toHaveLength(0);
      expect(column(1).querySelectorAll('button.remove')).toHaveLength(0);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await fixture.whenStable();
      expect(step().querySelectorAll('button.remove')).toHaveLength(2);
    });
  });

  describe('while a saved time is edited, without a mouse', () => {
    it('ends the edit before the press that ends it is heard: the "+" asked for with it are shown', async () => {
      await render(
        selectionWith({ [SATURDAY]: { marked: [at('10:00')], saved: [at('09:00')] } }),
        true,
      );
      await click(pills()[0]!);
      const later = step().querySelector<HTMLElement>(
        'button[aria-label="9:00, quince minutos después"]',
      )!;
      await click(later);

      await click(adder()!);

      expect(current().times[SATURDAY]!.saved).toEqual([at('09:15')]);
      expect(shown()).toEqual([true]);
    });
  });

  describe('one option short of the most an event takes', () => {
    /** Ranges saved on the dates step, each an option, to fill the event up to `options`. */
    function filledTo(options: number, times: Record<string, Partial<DayTimes>>): DateSelection {
      const selection = selectionWith(times);
      const saved = Array.from({ length: options - optionCount(selection) }, (_, day) => ({
        start: '2026-07-01',
        end: new Date(Date.UTC(2026, 6, 2 + day)).toISOString().slice(0, 10),
      }));
      return { ...selection, saved };
    }

    function arrow(column: number, name: string): HTMLButtonElement {
      const list = step().querySelectorAll('app-hour-column')[column]!;
      return list.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
    }

    /** The saved 9:00 of Saturday, like a marked one, is edited to 9:15: an option more once it ends. */
    async function editToOneMore(times: Record<string, Partial<DayTimes>>): Promise<void> {
      await render(filledTo(59, times), false);
      await click(pills()[0]!);
      await click(arrow(0, '9:00, quince minutos después'));
      expect(optionCount(current())).toBe(59);
    }

    it('takes the edit that a press on another hour ends, and that press marks nothing', async () => {
      await editToOneMore({ [SATURDAY]: { marked: [at('09:00')], saved: [at('09:00')] } });

      await click(hourOf(0, '12:00'));

      expect(current().times[SATURDAY]).toEqual({ marked: [at('09:00')], saved: [at('09:15')] });
      expect(optionCount(current())).toBe(60);
    });

    it('takes the edit that the arrow of a marked time ends, and that time stays', async () => {
      await editToOneMore({
        [SATURDAY]: { marked: at2('09:00', '10:00'), saved: at2('09:00', '10:00') },
      });

      await click(arrow(0, '10:00, quince minutos después'));

      expect(current().times[SATURDAY]).toEqual({
        marked: at2('09:00', '10:00'),
        saved: at2('09:15', '10:00'),
      });
      expect(optionCount(current())).toBe(60);
    });

    it('takes the edit before the press that ends it is heard on another day, where it marks nothing', async () => {
      const saturday = { marked: [at('09:00')], saved: [at('09:00')] };
      await editToOneMore({ [SATURDAY]: saturday, [SUNDAY]: { marked: [at('10:00')] } });

      await click(hourOf(1, '12:00'));

      expect(current().times[SATURDAY]).toEqual({ marked: [at('09:00')], saved: [at('09:15')] });
      expect(current().times[SUNDAY]).toEqual({ marked: [at('10:00')], saved: [] });
      expect(optionCount(current())).toBe(60);
    });

    it('undoes the edit when the event has taken its last option meanwhile', async () => {
      const saturday = { marked: [at('09:00')], saved: [at('09:00')] };
      await editToOneMore({ [SATURDAY]: saturday });
      fixture.componentInstance.selection.update((selection) => ({
        ...selection,
        saved: [...selection.saved, { start: '2026-09-01', end: '2026-09-02' }],
      }));
      await fixture.whenStable();

      await click(step());

      expect(current().times[SATURDAY]).toEqual(saturday);
      expect(optionCount(current())).toBe(60);
      expect(step().querySelectorAll('.edited')).toHaveLength(0);
    });
  });
});
