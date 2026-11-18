import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { installTestScreen } from '../../../test/media-queries';
import { type DateSelection, NO_DATES } from './date-selection';
import type { DayTime, DayTimes } from './day-times';
import { WizardTimes } from './wizard-times';

const WIDE = '(min-width: 650px)';
const NO_MOUSE = '(hover: none), (pointer: coarse)';

const SATURDAY = '2026-06-20';
const SUNDAY = '2026-06-21';

function at(time: string): DayTime {
  return { kind: 'single', at: time };
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
  template: `<app-wizard-times [(selection)]="selection" />`,
})
class Host {
  readonly selection = signal<DateSelection>(NO_DATES);
}

describe('WizardTimes, saving times', () => {
  let fixture: ComponentFixture<Host>;

  afterEach(() => {
    (fixture.nativeElement as HTMLElement).remove();
  });

  async function render(selection: DateSelection, noMouse: boolean): Promise<void> {
    installTestScreen({ [WIDE]: true, [NO_MOUSE]: noMouse });
    TestBed.configureTestingModule({ imports: [Host], providers: [provideI18n()] });
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.selection.set(selection);
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
    it('has a button for the "+" once a day on screen has a marked time', async () => {
      await render(selectionWith({ [SUNDAY]: { saved: [at('09:00')] } }), true);
      expect(step().querySelector('.tools')).not.toBeNull();
      expect(adder()).toBeNull();

      await click(hourOf(0, '10:00'));

      expect(adder()!.getAttribute('aria-label')).toBe('Guardar una hora');
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
});
