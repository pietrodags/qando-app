import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { Option } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { HOLD_MS } from '../../shared/ui/long-press';
import { literalValues } from '../../../styles/token-usage';
import { type Answers, allAvailable } from './answers';
import { VoteDays } from './vote-days';
import daysStyles from './vote-days.scss' with { loader: 'text' };

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
  let touchScreen: boolean;

  beforeEach(() => {
    touchScreen = false;
    // jsdom has no pointer: whether the screen is touched is the test's choice.
    window.matchMedia = (query: string) =>
      ({ matches: query === '(pointer: coarse)' && touchScreen, media: query }) as MediaQueryList;
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
    touchScreen = true;
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
      touchScreen = true;
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
  });
});
