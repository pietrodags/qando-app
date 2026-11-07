import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { Option } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { HOLD_MS } from '../../shared/ui/long-press';
import { literalValues } from '../../../styles/token-usage';
import { type Answers, allAvailable } from './answers';
import { VoteDays } from './vote-days';
import daysStyles from './vote-days.scss' with { loader: 'text' };
import { installTestScreen, type TestScreen } from '../../../test/media-queries';

const WIDE = '(min-width: 650px)';
const TOUCH = '(pointer: coarse)';

const sixth: Option = { id: 'sixth', dates: { kind: 'single', date: '2026-07-06' }, time: null };
const tenth: Option = { id: 'tenth', dates: { kind: 'single', date: '2026-07-10' }, time: null };
const eleventh: Option = {
  id: 'eleventh',
  dates: { kind: 'single', date: '2026-07-11' },
  time: null,
};
const weekend: Option = {
  id: 'weekend',
  dates: { kind: 'range', start: '2026-07-18', end: '2026-07-19' },
  time: null,
};
const september: Option = {
  id: 'september',
  dates: { kind: 'single', date: '2026-09-01' },
  time: null,
};

describe('VoteDays', () => {
  let screen: TestScreen;

  beforeEach(() => {
    // jsdom has neither pointer nor width: both are the test's choice.
    screen = installTestScreen({ [WIDE]: true });
    TestBed.configureTestingModule({ imports: [VoteDays], providers: [provideI18n()] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function render(
    options: readonly Option[],
    answers: Answers = allAvailable(options.map(({ id }) => id)),
  ): Promise<ComponentFixture<VoteDays>> {
    const fixture = TestBed.createComponent(VoteDays);
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('answers', answers);
    await fixture.whenStable();
    return fixture;
  }

  function element(fixture: ComponentFixture<VoteDays>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(fixture: ComponentFixture<VoteDays>): string {
    return element(fixture).textContent.replace(/\s+/g, ' ').trim();
  }

  function button(fixture: ComponentFixture<VoteDays>, name: RegExp): HTMLButtonElement {
    const found = Array.from(element(fixture).querySelectorAll('button')).find((candidate) =>
      name.test(candidate.getAttribute('aria-label') ?? candidate.textContent),
    );
    if (found === undefined) throw new Error(`No button named ${String(name)}`);
    return found;
  }

  function dayNames(fixture: ComponentFixture<VoteDays>): string[] {
    return Array.from(element(fixture).querySelectorAll('.day[aria-label]')).map(
      (day) => day.getAttribute('aria-label') ?? '',
    );
  }

  async function act(fixture: ComponentFixture<VoteDays>, action: () => void): Promise<void> {
    action();
    await fixture.whenStable();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(daysStyles)).toEqual([]);
  });

  it('explains the mouse gestures on a screen with a mouse', async () => {
    const fixture = await render([sixth]);

    expect(text(fixture)).toContain(
      'Haz clic para indicar si puedes o no. Doble clic para marcar tu día preferido (máximo uno).',
    );
  });

  it('explains the touch gestures on a touch screen', async () => {
    screen.set(TOUCH, true);
    const fixture = await render([sixth]);

    expect(text(fixture)).toContain(
      'Toca un día para indicar si puedes o no. Mantén pulsado para elegir tu preferido (máximo uno).',
    );
  });

  it('shows the legend of the three answers', async () => {
    const fixture = await render([sixth]);
    const legend = Array.from(element(fixture).querySelectorAll('.legend li'), (item) =>
      item.textContent.trim(),
    );

    expect(legend).toEqual(['Disponible', 'Preferido', 'No puedo']);
  });

  it('draws the month with its name, the weekdays from Monday and every day', async () => {
    const fixture = await render([sixth]);

    expect(element(fixture).querySelector('h2')?.textContent.trim()).toBe('Julio 2026');
    expect(
      Array.from(element(fixture).querySelectorAll('.weekday')).map((day) =>
        day.textContent.trim(),
      ),
    ).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D']);
    expect(element(fixture).querySelectorAll('.day')).toHaveLength(31);
    expect(element(fixture).querySelectorAll('.blank')).toHaveLength(2);
  });

  it('makes only the proposed days pressable, each named with its date and answer', async () => {
    const fixture = await render([sixth, tenth], { sixth: 'available', tenth: 'preferred' });

    expect(dayNames(fixture)).toEqual([
      'lunes, 6 de julio: Disponible',
      'viernes, 10 de julio: Preferido',
    ]);
    expect(element(fixture).querySelectorAll('button.day')).toHaveLength(2);
  });

  it('tells keyboard users how to answer', async () => {
    const fixture = await render([sixth]);
    const day = button(fixture, /6 de julio/);
    const hint = document.getElementById(day.getAttribute('aria-describedby') ?? '');

    expect(hint?.textContent.trim()).toBe(
      'Intro: puedes o no puedes. Mayúsculas+Intro: tu preferido.',
    );
  });

  it('toggles a day between available and unavailable when it is pressed', async () => {
    const fixture = await render([sixth, tenth]);

    await act(fixture, () => {
      button(fixture, /6 de julio/).click();
    });
    expect(fixture.componentInstance.answers()).toEqual({
      sixth: 'unavailable',
      tenth: 'available',
    });
    expect(dayNames(fixture)[0]).toBe('lunes, 6 de julio: No puedo');

    await act(fixture, () => {
      button(fixture, /6 de julio/).click();
    });
    expect(fixture.componentInstance.answers()).toEqual({ sixth: 'available', tenth: 'available' });
  });

  it('makes a day the preferred one on double-click, and the previous one available', async () => {
    const fixture = await render([sixth, tenth, eleventh], {
      sixth: 'preferred',
      tenth: 'available',
      eleventh: 'unavailable',
    });

    await act(fixture, () =>
      button(fixture, /10 de julio/).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
    );

    expect(fixture.componentInstance.answers()).toEqual({
      sixth: 'available',
      tenth: 'preferred',
      eleventh: 'unavailable',
    });
  });

  it('ignores a double tap: a quick second tap only corrects the first', async () => {
    const fixture = await render([sixth]);
    const day = button(fixture, /6 de julio/);
    const touch = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });

    await act(fixture, () => {
      day.dispatchEvent(touch);
      day.click();
      day.click();
      day.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    expect(fixture.componentInstance.answers()).toEqual({ sixth: 'available' });
  });

  it('makes a day the preferred one when a finger rests on it', async () => {
    const fixture = await render([sixth]);
    vi.useFakeTimers();
    const touch = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });

    button(fixture, /6 de julio/).dispatchEvent(touch);
    vi.advanceTimersByTime(HOLD_MS);

    expect(fixture.componentInstance.answers()).toEqual({ sixth: 'preferred' });
  });

  it('makes the focused day the preferred one with Shift+Enter, without toggling it', async () => {
    const fixture = await render([sixth]);
    const shiftEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });

    await act(fixture, () => button(fixture, /6 de julio/).dispatchEvent(shiftEnter));

    expect(fixture.componentInstance.answers()).toEqual({ sixth: 'preferred' });
    expect(shiftEnter.defaultPrevented).toBe(true);
  });

  it('answers a whole range from any of its days, drawn joined', async () => {
    const fixture = await render([weekend]);

    await act(fixture, () => {
      button(fixture, /19 de julio/).click();
    });

    expect(fixture.componentInstance.answers()).toEqual({ weekend: 'unavailable' });
    expect(dayNames(fixture)).toEqual([
      'sábado, 18 de julio: No puedo',
      'domingo, 19 de julio: No puedo',
    ]);
    expect(button(fixture, /18 de julio/).classList).toContain('joins-next');
    expect(button(fixture, /19 de julio/).classList).toContain('joins-previous');
  });

  it('lifts every day of a range while the mouse is over any of them', async () => {
    const fixture = await render([sixth, weekend]);
    const lifted = () =>
      Array.from(element(fixture).querySelectorAll('button.lifted')).map((day) =>
        day.textContent.trim(),
      );

    await act(fixture, () => {
      button(fixture, /19 de julio/).dispatchEvent(new MouseEvent('mouseenter'));
    });
    expect(lifted()).toEqual(['18', '19']);

    await act(fixture, () => {
      button(fixture, /19 de julio/).dispatchEvent(new MouseEvent('mouseleave'));
    });
    expect(lifted()).toEqual([]);
  });

  it('draws the middle days of a range apart from its ends', async () => {
    const fixture = await render([
      { id: 'long', dates: { kind: 'range', start: '2026-07-14', end: '2026-07-16' }, time: null },
    ]);

    expect(button(fixture, /15 de julio/).classList).toContain('middle');
    expect(button(fixture, /14 de julio/).classList).not.toContain('middle');
    expect(button(fixture, /16 de julio/).classList).not.toContain('middle');
  });

  it('marks a range cut where it wraps to the next row', async () => {
    const fixture = await render([
      { id: 'cross', dates: { kind: 'range', start: '2026-07-12', end: '2026-07-13' }, time: null },
    ]);

    expect(button(fixture, /12 de julio/).classList).toContain('cut-after');
    expect(button(fixture, /13 de julio/).classList).toContain('cut-before');
  });

  it('colours each day with its answer', async () => {
    const fixture = await render([sixth, tenth, eleventh], {
      sixth: 'available',
      tenth: 'preferred',
      eleventh: 'unavailable',
    });

    expect(button(fixture, /6 de julio/).classList).toContain('available');
    expect(button(fixture, /10 de julio/).classList).toContain('preferred');
    expect(button(fixture, /11 de julio/).classList).toContain('unavailable');
  });

  describe('with one month', () => {
    it('shows no page indicator, goes back to step 1 and confirms the days', async () => {
      const fixture = await render([sixth]);
      let back = 0;
      let done = 0;
      fixture.componentInstance.back.subscribe(() => (back += 1));
      fixture.componentInstance.done.subscribe(() => (done += 1));

      expect(element(fixture).querySelector('.page-indicator')).toBeNull();
      button(fixture, /Volver al paso 1/).click();
      button(fixture, /Confirmar mis días/).click();

      expect([back, done]).toEqual([1, 1]);
    });
  });

  describe('with several months', () => {
    it('pages one month at a time, and only the last one confirms', async () => {
      const fixture = await render([sixth, september]);
      let done = 0;
      fixture.componentInstance.done.subscribe(() => (done += 1));

      expect(element(fixture).querySelector('.page-indicator')?.textContent.trim()).toBe('1 / 2');
      expect(element(fixture).querySelector('h2')?.textContent.trim()).toBe('Julio 2026');

      await act(fixture, () => {
        button(fixture, /Mes siguiente/).click();
      });

      expect(element(fixture).querySelector('h2')?.textContent.trim()).toBe('Septiembre 2026');
      const indicator = element(fixture).querySelector('.page-indicator');
      expect(indicator?.textContent.trim()).toBe('2 / 2');
      expect(indicator?.classList).toContain('last');
      expect(done).toBe(0);

      await act(fixture, () => {
        button(fixture, /Confirmar mis días/).click();
      });
      expect(done).toBe(1);
    });

    it('goes back a month before going back to step 1', async () => {
      const fixture = await render([sixth, september]);
      let back = 0;
      fixture.componentInstance.back.subscribe(() => (back += 1));
      await act(fixture, () => {
        button(fixture, /Mes siguiente/).click();
      });

      await act(fixture, () => {
        button(fixture, /Mes anterior/).click();
      });
      expect(element(fixture).querySelector('h2')?.textContent.trim()).toBe('Julio 2026');
      expect(back).toBe(0);

      await act(fixture, () => {
        button(fixture, /Volver al paso 1/).click();
      });
      expect(back).toBe(1);
    });
  });

  it('says so when there is no date to answer', async () => {
    const fixture = await render([]);

    expect(text(fixture)).toContain('No hay fechas disponibles para este evento.');
  });
  it('gives each calendar its own keyboard hint, so two never share an id', async () => {
    const first = await render([sixth]);
    const second = await render([sixth]);
    const idOf = (fixture: ComponentFixture<VoteDays>) =>
      button(fixture, /6 de julio/).getAttribute('aria-describedby');

    expect(idOf(first)).not.toBe(idOf(second));
  });

  describe('of an event with times', () => {
    const morning: Option = {
      id: 'morning',
      dates: { kind: 'single', date: '2026-07-06' },
      time: { kind: 'single', at: '09:00' },
    };
    const evening: Option = {
      id: 'evening',
      dates: { kind: 'single', date: '2026-07-06' },
      time: { kind: 'range', start: '18:00', end: '20:00' },
    };
    const seventh: Option = {
      id: 'seventh',
      dates: { kind: 'single', date: '2026-07-07' },
      time: { kind: 'single', at: '10:00' },
    };
    const withTimes = [morning, evening, seventh];

    it('says the times come in the next step, with a mouse and on a touch screen', async () => {
      const mouse = await render(withTimes);
      screen.set(TOUCH, true);
      const touch = await render(withTimes);

      expect(text(mouse)).toContain(
        'Haz clic para indicar qué días puedes y qué no. En el siguiente paso, elige las horas.',
      );
      expect(text(touch)).toContain(
        'Toca un día para indicar si puedes o no. En el siguiente paso, elige las horas.',
      );
    });

    it('shows a legend without the preferred answer, chosen among the times', async () => {
      // Whole days next to times: the event still has times.
      const fixture = await render([sixth, ...withTimes]);
      const legend = Array.from(element(fixture).querySelectorAll('.legend li'), (item) =>
        item.textContent.trim(),
      );

      expect(legend).toEqual(['Disponible', 'No puedo']);
    });

    it('tells keyboard users only how to say whether they can', async () => {
      const fixture = await render(withTimes);

      expect(text(fixture)).toContain('Intro: puedes o no puedes.');
      expect(text(fixture)).not.toContain('Mayúsculas+Intro');
    });

    it('shows a day available while one of its times is, and unavailable once none is', async () => {
      const fixture = await render(withTimes, {
        morning: 'unavailable',
        evening: 'preferred',
        seventh: 'unavailable',
      });

      expect(dayNames(fixture)).toEqual([
        'lunes, 6 de julio: Disponible',
        'martes, 7 de julio: No puedo',
      ]);
      expect(button(fixture, /6 de julio/).classList).toContain('available');
      expect(button(fixture, /7 de julio/).classList).toContain('unavailable');
    });

    it('turns every time of a day unavailable when it is pressed, and available again', async () => {
      const fixture = await render(withTimes, {
        morning: 'available',
        evening: 'preferred',
        seventh: 'available',
      });

      await act(fixture, () => {
        button(fixture, /6 de julio/).click();
      });
      expect(fixture.componentInstance.answers()).toEqual({
        morning: 'unavailable',
        evening: 'unavailable',
        seventh: 'available',
      });

      await act(fixture, () => {
        button(fixture, /6 de julio/).click();
      });
      expect(fixture.componentInstance.answers()).toEqual({
        morning: 'available',
        evening: 'available',
        seventh: 'available',
      });
    });

    it('never makes a day the preferred one', async () => {
      const fixture = await render(withTimes);
      const day = button(fixture, /6 de julio/);
      const shiftEnter = new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      const touch = new MouseEvent('pointerdown', { bubbles: true });
      Object.defineProperty(touch, 'pointerType', { value: 'touch' });

      await act(fixture, () => {
        day.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        day.dispatchEvent(shiftEnter);
      });
      vi.useFakeTimers();
      day.dispatchEvent(touch);
      vi.advanceTimersByTime(HOLD_MS);

      expect(fixture.componentInstance.answers()).toEqual(
        allAvailable(['morning', 'evening', 'seventh']),
      );
    });

    it('goes on to the times from the last month', async () => {
      const fixture = await render(withTimes);
      let toTimes = 0;
      let done = 0;
      fixture.componentInstance.toTimes.subscribe(() => (toTimes += 1));
      fixture.componentInstance.done.subscribe(() => (done += 1));

      button(fixture, /Elegir las horas/).click();

      expect([toTimes, done]).toEqual([1, 0]);
    });

    it('confirms straight away when no day is possible: there are no times to choose', async () => {
      const fixture = await render(withTimes, {
        morning: 'unavailable',
        evening: 'unavailable',
        seventh: 'unavailable',
      });
      let toTimes = 0;
      let done = 0;
      fixture.componentInstance.toTimes.subscribe(() => (toTimes += 1));
      fixture.componentInstance.done.subscribe(() => (done += 1));

      button(fixture, /Confirmar mis días/).click();

      expect([toTimes, done]).toEqual([0, 1]);
    });

    describe('previews the times of a day', () => {
      function pointer(
        type: string,
        pointerType: string,
        relatedTarget: Element | null = null,
      ): MouseEvent {
        const event = new MouseEvent(type, { bubbles: true, relatedTarget });
        Object.defineProperty(event, 'pointerType', { value: pointerType });
        return event;
      }

      function preview(fixture: ComponentFixture<VoteDays>): HTMLElement | null {
        return element(fixture).querySelector('[role="tooltip"]');
      }

      function previewText(fixture: ComponentFixture<VoteDays>): string | undefined {
        return preview(fixture)?.textContent.replace(/\s+/g, ' ').trim();
      }

      it('while the mouse is over it, above the day and named as its description', async () => {
        const fixture = await render(withTimes);
        const day = button(fixture, /6 de julio/);

        await act(fixture, () => day.dispatchEvent(pointer('pointerenter', 'mouse')));

        expect(previewText(fixture)).toBe('09:00 • 18:00 → 20:00');
        expect(day.getAttribute('aria-describedby')?.split(' ')).toContain(preview(fixture)?.id);

        await act(fixture, () => day.dispatchEvent(pointer('pointerleave', 'mouse')));

        expect(preview(fixture)).toBeNull();
        expect(day.getAttribute('aria-describedby')?.split(' ')).toHaveLength(1);
      });

      it('names a day without times and counts the times that do not fit', async () => {
        const hours = ['08:00', '09:00', '10:00', '11:00', '12:00'].map((at): Option => ({
          id: at,
          dates: { kind: 'single', date: '2026-07-08' },
          time: { kind: 'single', at },
        }));
        const fixture = await render([sixth, ...hours]);

        await act(fixture, () =>
          button(fixture, /6 de julio/).dispatchEvent(pointer('pointerenter', 'mouse')),
        );
        expect(previewText(fixture)).toBe('Sin horario');

        await act(fixture, () =>
          button(fixture, /8 de julio/).dispatchEvent(pointer('pointerenter', 'mouse')),
        );
        expect(previewText(fixture)).toBe('08:00 • 09:00 • 10:00 • 11:00 ... +1');
      });

      it('breaks a long preview between its times, never inside one', async () => {
        const fixture = await render(withTimes);

        await act(fixture, () =>
          button(fixture, /6 de julio/).dispatchEvent(pointer('pointerenter', 'mouse')),
        );

        const items = Array.from(
          preview(fixture)?.querySelectorAll('.preview-item') ?? [],
          (item) => item.textContent.trim(),
        );
        expect(items).toEqual(['09:00', '• 18:00 → 20:00']);
      });

      it('hides when the day is pressed, and never shows over an unavailable day', async () => {
        const fixture = await render(withTimes, {
          morning: 'available',
          evening: 'available',
          seventh: 'unavailable',
        });
        const sixthDay = button(fixture, /6 de julio/);

        await act(fixture, () => {
          sixthDay.dispatchEvent(pointer('pointerenter', 'mouse'));
          sixthDay.click();
        });
        expect(preview(fixture)).toBeNull();

        await act(fixture, () =>
          button(fixture, /7 de julio/).dispatchEvent(pointer('pointerenter', 'mouse')),
        );
        expect(preview(fixture)).toBeNull();
      });

      it('stays while the mouse moves from the day onto it, and hides with Escape', async () => {
        const fixture = await render(withTimes);
        const day = button(fixture, /6 de julio/);
        await act(fixture, () => day.dispatchEvent(pointer('pointerenter', 'mouse')));

        await act(fixture, () =>
          day.dispatchEvent(pointer('pointerleave', 'mouse', preview(fixture))),
        );
        expect(preview(fixture)).not.toBeNull();

        await act(fixture, () =>
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
        );
        expect(preview(fixture)).toBeNull();
      });

      it('when a finger rests on it, without answering, until the next touch', async () => {
        const fixture = await render(withTimes);
        const day = button(fixture, /6 de julio/);
        vi.useFakeTimers();

        day.dispatchEvent(pointer('pointerdown', 'touch'));
        vi.advanceTimersByTime(HOLD_MS);
        vi.useRealTimers();
        // A lifted finger leaves the day too: the preview stays to be read.
        await act(fixture, () => {
          day.dispatchEvent(pointer('pointerup', 'touch'));
          day.dispatchEvent(pointer('pointerleave', 'touch'));
        });

        expect(previewText(fixture)).toBe('09:00 • 18:00 → 20:00');
        expect(fixture.componentInstance.answers()).toEqual(
          allAvailable(['morning', 'evening', 'seventh']),
        );

        await act(fixture, () => document.body.dispatchEvent(pointer('pointerdown', 'touch')));
        expect(preview(fixture)).toBeNull();
      });

      it('not when a tap passes over the day: only a mouse hovers', async () => {
        const fixture = await render(withTimes);

        await act(fixture, () =>
          button(fixture, /6 de julio/).dispatchEvent(pointer('pointerenter', 'touch')),
        );

        expect(preview(fixture)).toBeNull();
      });
    });
  });

  describe('with options that overlap', () => {
    // Tuesday 7 → Friday 10 and Wednesday 8 → Saturday 11 July 2026 share 8, 9 and 10.
    const first: Option = {
      id: 'first',
      dates: { kind: 'range', start: '2026-07-07', end: '2026-07-10' },
      time: null,
    };
    const second: Option = {
      id: 'second',
      dates: { kind: 'range', start: '2026-07-08', end: '2026-07-11' },
      time: null,
    };
    const overlapping = [first, second, weekend];

    function pointer(type: string, pointerType: string): MouseEvent {
      const event = new MouseEvent(type, { bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: pointerType });
      return event;
    }

    function chips(fixture: ComponentFixture<VoteDays>): HTMLButtonElement[] {
      return Array.from(element(fixture).querySelectorAll<HTMLButtonElement>('button.chip'));
    }

    function chip(fixture: ComponentFixture<VoteDays>, index: number): HTMLButtonElement {
      const found = chips(fixture)[index];
      if (found === undefined) throw new Error(`No chip ${String(index)}`);
      return found;
    }

    function outlined(fixture: ComponentFixture<VoteDays>, date: number): HTMLElement {
      const found = Array.from(
        element(fixture).querySelectorAll<HTMLElement>('.day.outlined'),
      ).find((day) => day.textContent.trim() === String(date));
      if (found === undefined) throw new Error(`No outlined day ${String(date)}`);
      return found;
    }

    function classesOf(fixture: ComponentFixture<VoteDays>, className: string): string[] {
      return Array.from(element(fixture).querySelectorAll(`.${className}`), (item) =>
        item.textContent.replace(/\s+/g, ' ').trim(),
      );
    }

    it('outlines the days they share with no way to press them, and keeps the others', async () => {
      const fixture = await render(overlapping);

      expect(classesOf(fixture, 'day.outlined')).toEqual(['7', '8', '9', '10', '11']);
      expect(element(fixture).querySelectorAll('button.day.outlined')).toHaveLength(0);
      expect(dayNames(fixture)).toEqual([
        'sábado, 18 de julio: Disponible',
        'domingo, 19 de julio: Disponible',
      ]);
      expect(outlined(fixture, 7).classList).toContain('joins-next');
      expect(outlined(fixture, 11).classList).toContain('joins-previous');
      // The days between the overlap's ends are dimmed, as a range's.
      expect(classesOf(fixture, 'day.outlined.middle')).toEqual(['8', '9', '10']);
    });

    it('answers each of them by a chip below, named with its dates and answer', async () => {
      const fixture = await render(overlapping, {
        first: 'preferred',
        second: 'available',
        weekend: 'available',
      });

      expect(text(fixture)).toContain('Haz clic aquí en las fechas que se solapan.');
      expect(chips(fixture).map((item) => item.textContent.replace(/\s+/g, ' ').trim())).toEqual([
        'Mar 7➔Vie 10',
        'Mié 8➔Sáb 11',
      ]);
      expect(chips(fixture).map((item) => item.getAttribute('aria-label'))).toEqual([
        'martes, 7 de julio – viernes, 10 de julio: Preferido',
        'miércoles, 8 de julio – sábado, 11 de julio: Disponible',
      ]);
      expect(chip(fixture, 0).querySelector('app-date-chip')?.classList).toContain('preferred');
      expect(chip(fixture, 0).getAttribute('aria-describedby')).toBe(
        button(fixture, /18 de julio/).getAttribute('aria-describedby'),
      );
    });

    it('asks for a tap on the chips on a touch screen', async () => {
      screen.set(TOUCH, true);
      const fixture = await render(overlapping);

      expect(text(fixture)).toContain('Toca aquí las fechas que se solapan.');
    });

    it('offers no chip when no options overlap', async () => {
      const fixture = await render([sixth, weekend]);

      expect(chips(fixture)).toEqual([]);
      expect(text(fixture)).not.toContain('se solapan');
    });

    it('toggles a chip with a tap or click, and makes it the preferred one as a day', async () => {
      const fixture = await render(overlapping);
      vi.useFakeTimers();

      chip(fixture, 1).click();
      expect(fixture.componentInstance.answers()).toMatchObject({ second: 'unavailable' });

      chip(fixture, 0).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(fixture.componentInstance.answers()).toMatchObject({ first: 'preferred' });

      chip(fixture, 1).dispatchEvent(pointer('pointerdown', 'touch'));
      vi.advanceTimersByTime(HOLD_MS);
      expect(fixture.componentInstance.answers()).toMatchObject({
        first: 'available',
        second: 'preferred',
      });

      chip(fixture, 0).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
      );
      expect(fixture.componentInstance.answers()).toMatchObject({
        first: 'preferred',
        second: 'available',
      });
    });

    it('ignores a double tap on a chip', async () => {
      const fixture = await render(overlapping);

      await act(fixture, () => {
        chip(fixture, 0).dispatchEvent(pointer('pointerdown', 'touch'));
        chip(fixture, 0).click();
        chip(fixture, 0).click();
        chip(fixture, 0).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });

      expect(fixture.componentInstance.answers()).toMatchObject({ first: 'available' });
    });

    it('colours an outlined day preferred when one of its options is, unavailable when all are', async () => {
      const fixture = await render(overlapping, {
        first: 'preferred',
        second: 'unavailable',
        weekend: 'available',
      });

      expect(outlined(fixture, 7).classList).toContain('preferred');
      expect(outlined(fixture, 9).classList).toContain('preferred');
      expect(outlined(fixture, 11).classList).toContain('unavailable');

      await act(fixture, () => {
        chip(fixture, 0).click();
      });
      expect(outlined(fixture, 9).classList).toContain('available');
      expect(outlined(fixture, 9).classList).not.toContain('preferred');
    });

    it('paints the days of a chip in its answer while the mouse is over it', async () => {
      const fixture = await render(overlapping, {
        first: 'available',
        second: 'unavailable',
        weekend: 'available',
      });

      await act(fixture, () => chip(fixture, 1).dispatchEvent(pointer('pointerenter', 'mouse')));
      expect(classesOf(fixture, 'painted')).toEqual(['8', '9', '10', '11']);
      expect(outlined(fixture, 8).classList).toContain('unavailable');
      // Painted, 8 starts the shape though the outline starts on 7; the days between its ends
      // are dimmed by the chip's span.
      expect(outlined(fixture, 8).classList).not.toContain('joins-previous');
      expect(classesOf(fixture, 'day.outlined.middle')).toEqual(['9', '10']);
      // 7 keeps its outline, still joined to the painted days.
      expect(outlined(fixture, 7).classList).toContain('joins-next');
      expect(outlined(fixture, 7).classList).not.toContain('painted');

      await act(fixture, () => chip(fixture, 1).dispatchEvent(pointer('pointerleave', 'mouse')));
      expect(classesOf(fixture, 'painted')).toEqual([]);
      expect(outlined(fixture, 8).classList).toContain('joins-previous');
      expect(outlined(fixture, 7).classList).toContain('joins-next');
    });

    it('paints them while the keyboard focus is on the chip', async () => {
      const fixture = await render(overlapping);
      // Only an element in the document takes the focus.
      document.body.append(element(fixture));

      await act(fixture, () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
        chip(fixture, 0).focus();
      });
      expect(classesOf(fixture, 'painted')).toEqual(['7', '8', '9', '10']);

      await act(fixture, () => {
        chip(fixture, 0).blur();
      });
      expect(classesOf(fixture, 'painted')).toEqual([]);
    });

    it('lifts the chips of an outlined day while the mouse is over it', async () => {
      const fixture = await render(overlapping);

      await act(fixture, () =>
        outlined(fixture, 11).dispatchEvent(pointer('pointerenter', 'mouse')),
      );
      expect(chips(fixture).map((item) => item.classList.contains('lifted'))).toEqual([
        false,
        true,
      ]);

      await act(fixture, () =>
        outlined(fixture, 11).dispatchEvent(pointer('pointerleave', 'mouse')),
      );
      expect(classesOf(fixture, 'lifted')).toEqual([]);

      await act(fixture, () =>
        outlined(fixture, 9).dispatchEvent(pointer('pointerenter', 'touch')),
      );
      expect(classesOf(fixture, 'lifted')).toEqual([]);
    });

    describe('on a phone, in a modal', () => {
      // jsdom has no modal dialogs: these stand for the browser's.
      beforeEach(() => {
        screen.set(WIDE, false);
        HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
          this.setAttribute('open', '');
        };
        HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
          this.removeAttribute('open');
          this.dispatchEvent(new Event('close'));
        };
      });

      afterEach(() => {
        Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
        Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
      });

      function modal(fixture: ComponentFixture<VoteDays>): HTMLDialogElement | null {
        return element(fixture).querySelector('dialog');
      }

      function inModal(fixture: ComponentFixture<VoteDays>, selector: string): HTMLElement[] {
        return Array.from(modal(fixture)?.querySelectorAll<HTMLElement>(selector) ?? []);
      }

      function stripClasses(fixture: ComponentFixture<VoteDays>, className: string): string[] {
        return inModal(fixture, `.strip .day.${className}`).map((day) => day.textContent.trim());
      }

      async function opened(answers?: Answers, date = 9): Promise<ComponentFixture<VoteDays>> {
        const fixture = await render(overlapping, answers);
        await act(fixture, () => {
          outlined(fixture, date).click();
        });
        return fixture;
      }

      it('leaves no chips below the calendar, and makes each outlined day a button', async () => {
        const fixture = await render(overlapping);

        expect(chips(fixture)).toEqual([]);
        expect(element(fixture).querySelector('.chips-header')).toBeNull();
        expect(outlined(fixture, 7).tagName).toBe('BUTTON');
        expect(outlined(fixture, 7).getAttribute('aria-label')).toBe(
          'martes, 7 de julio: Fechas que se solapan',
        );
        expect(modal(fixture)).toBeNull();
      });

      it('opens the overlap with a tap on any of its days: the legend, its days and one chip per option', async () => {
        const fixture = await opened(undefined, 11);

        expect(modal(fixture)?.hasAttribute('open')).toBe(true);
        expect(modal(fixture)?.getAttribute('aria-label')).toBe('Fechas que se solapan');
        expect(inModal(fixture, '.legend li')).toHaveLength(3);
        expect(stripClasses(fixture, 'outlined')).toEqual(['7', '8', '9', '10', '11']);
        expect(stripClasses(fixture, 'middle')).toEqual(['8', '9', '10']);
        expect(
          inModal(fixture, 'button.chip').map((item) => item.getAttribute('aria-label')),
        ).toEqual([
          'martes, 7 de julio – viernes, 10 de julio: Disponible',
          'miércoles, 8 de julio – sábado, 11 de julio: Disponible',
        ]);
        expect(stripClasses(fixture, 'painted')).toEqual([]);
      });

      it('answers a chip with a tap or a long-press, and paints its days in the strip', async () => {
        const fixture = await opened();
        vi.useFakeTimers();
        const [firstChip, secondChip] = inModal(fixture, 'button.chip');

        secondChip?.click();
        fixture.detectChanges();
        expect(fixture.componentInstance.answers()).toMatchObject({ second: 'unavailable' });
        expect(stripClasses(fixture, 'painted')).toEqual(['8', '9', '10', '11']);
        expect(stripClasses(fixture, 'painted.unavailable')).toHaveLength(4);
        expect(stripClasses(fixture, 'painted.middle')).toEqual(['9', '10']);
        expect(stripClasses(fixture, 'outlined:not(.painted)')).toEqual(['7']);

        firstChip?.dispatchEvent(pointer('pointerdown', 'touch'));
        vi.advanceTimersByTime(HOLD_MS);
        fixture.detectChanges();
        expect(fixture.componentInstance.answers()).toMatchObject({ first: 'preferred' });
        expect(stripClasses(fixture, 'painted.preferred')).toEqual(['7', '8', '9', '10']);
      });

      it('closes with ✓ and shows the answers in the outline', async () => {
        const fixture = await opened({
          first: 'unavailable',
          second: 'available',
          weekend: 'available',
        });

        await act(fixture, () => {
          inModal(fixture, 'button.chip')[1]?.click();
        });
        await act(fixture, () => {
          button(fixture, /Listo/).click();
        });

        expect(modal(fixture)).toBeNull();
        expect(outlined(fixture, 9).classList).toContain('unavailable');
        expect(classesOf(fixture, 'painted')).toEqual([]);

        await act(fixture, () => {
          outlined(fixture, 7).click();
        });
        expect(stripClasses(fixture, 'painted')).toEqual([]);
      });

      it('previews the times of a chip inside the modal, and hides them when it closes', async () => {
        const morning: Option = {
          id: 'morning',
          dates: { kind: 'single', date: '2026-07-08' },
          time: { kind: 'single', at: '09:00' },
        };
        const fixture = await render([first, morning]);
        await act(fixture, () => {
          outlined(fixture, 8).click();
        });
        vi.useFakeTimers();

        inModal(fixture, 'button.chip')[1]?.dispatchEvent(pointer('pointerdown', 'touch'));
        vi.advanceTimersByTime(HOLD_MS);
        fixture.detectChanges();
        expect(inModal(fixture, '[role="tooltip"]').map((tip) => tip.textContent.trim())).toEqual([
          '09:00',
        ]);
        expect(element(fixture).querySelectorAll('[role="tooltip"]')).toHaveLength(1);

        button(fixture, /Listo/).click();
        fixture.detectChanges();
        expect(element(fixture).querySelector('[role="tooltip"]')).toBeNull();
      });

      it('closes when the screen turns wide, where the chips are below the calendar', async () => {
        const fixture = await opened();

        await act(fixture, () => {
          screen.set(WIDE, true);
        });

        expect(modal(fixture)).toBeNull();
        expect(chips(fixture)).toHaveLength(2);
        expect(outlined(fixture, 7).tagName).toBe('SPAN');
      });
    });

    it('answers a day with times inside a range by one chip for all of its times', async () => {
      const morning: Option = {
        id: 'morning',
        dates: { kind: 'single', date: '2026-07-08' },
        time: { kind: 'single', at: '09:00' },
      };
      const evening: Option = { ...morning, id: 'evening', time: { kind: 'single', at: '20:00' } };
      const fixture = await render([first, morning, evening]);
      const preview = () => element(fixture).querySelector('[role="tooltip"]');

      expect(chips(fixture).map((item) => item.getAttribute('aria-label'))).toEqual([
        'martes, 7 de julio – viernes, 10 de julio: Disponible',
        'miércoles, 8 de julio: Disponible',
      ]);

      await act(fixture, () => chip(fixture, 1).dispatchEvent(pointer('pointerenter', 'mouse')));
      expect(preview()?.textContent.replace(/\s+/g, ' ').trim()).toBe('09:00 • 20:00');
      expect(chip(fixture, 1).getAttribute('aria-describedby')).toContain(preview()?.id);

      await act(fixture, () => {
        chip(fixture, 1).click();
      });
      expect(fixture.componentInstance.answers()).toEqual({
        first: 'available',
        morning: 'unavailable',
        evening: 'unavailable',
      });
    });
  });

  it('previews nothing in an event without times', async () => {
    const fixture = await render([sixth]);
    const hover = new MouseEvent('pointerenter', { bubbles: true });
    Object.defineProperty(hover, 'pointerType', { value: 'mouse' });

    await act(fixture, () => button(fixture, /6 de julio/).dispatchEvent(hover));

    expect(element(fixture).querySelector('[role="tooltip"]')).toBeNull();
  });
});
