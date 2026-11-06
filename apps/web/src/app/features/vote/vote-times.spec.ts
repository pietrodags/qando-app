import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { Option } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { HOLD_MS } from '../../shared/ui/long-press';
import { literalValues } from '../../../styles/token-usage';
import { type Answers, allAvailable } from './answers';
import { VoteTimes } from './vote-times';
import stepStyles from './_vote-step.scss' with { loader: 'text' };
import timesStyles from './vote-times.scss' with { loader: 'text' };

const nine: Option = {
  id: 'nine',
  dates: { kind: 'single', date: '2026-07-06' },
  time: { kind: 'single', at: '09:00' },
};
const evening: Option = {
  id: 'evening',
  dates: { kind: 'single', date: '2026-07-06' },
  time: { kind: 'range', start: '18:00', end: '20:30' },
};
const seventh: Option = {
  id: 'seventh',
  dates: { kind: 'single', date: '2026-07-07' },
  time: null,
};
const weekend: Option = {
  id: 'weekend',
  dates: { kind: 'range', start: '2026-07-11', end: '2026-07-12' },
  time: null,
};

function wholeDay(date: string): Option {
  return { id: date, dates: { kind: 'single', date }, time: null };
}

/** The browser's own zone: no notice is due when the event is in it. */
const BROWSER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe('VoteTimes', () => {
  let touchScreen: boolean;
  let wide: boolean;
  let widthChanged: ((event: { matches: boolean }) => void) | undefined;

  beforeEach(() => {
    touchScreen = false;
    wide = false;
    // jsdom has neither pointer nor width: both are the test's choice.
    window.matchMedia = (query: string) =>
      ({
        matches:
          query === '(pointer: coarse)' ? touchScreen : query === '(min-width: 650px)' && wide,
        media: query,
        addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => {
          if (query === '(min-width: 650px)') widthChanged = listener;
        },
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList;
    TestBed.configureTestingModule({ imports: [VoteTimes], providers: [provideI18n()] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function render(
    options: readonly Option[],
    answers: Answers = allAvailable(options.map(({ id }) => id)),
    timeZone = BROWSER_ZONE,
  ): Promise<ComponentFixture<VoteTimes>> {
    const fixture = TestBed.createComponent(VoteTimes);
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('answers', answers);
    fixture.componentRef.setInput('timeZone', timeZone);
    await fixture.whenStable();
    return fixture;
  }

  function element(fixture: ComponentFixture<VoteTimes>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(fixture: ComponentFixture<VoteTimes>): string {
    return element(fixture).textContent.replace(/\s+/g, ' ').trim();
  }

  function button(fixture: ComponentFixture<VoteTimes>, name: RegExp): HTMLButtonElement {
    const found = Array.from(element(fixture).querySelectorAll('button')).find((candidate) =>
      name.test(candidate.getAttribute('aria-label') ?? candidate.textContent),
    );
    if (found === undefined) throw new Error(`No button named ${String(name)}`);
    return found;
  }

  function blockNames(fixture: ComponentFixture<VoteTimes>): string[] {
    return Array.from(
      element(fixture).querySelectorAll('.block'),
      (block) => block.getAttribute('aria-label') ?? '',
    );
  }

  /** Each header's lines, read as flat text: "Jul 6 Lun", "Jul 11 Sáb ➔ Jul 12 Dom". */
  function headers(fixture: ComponentFixture<VoteTimes>): string[] {
    return Array.from(element(fixture).querySelectorAll('.header'), (header) =>
      Array.from(header.querySelectorAll('*'))
        .filter((part) => part.children.length === 0)
        .map((part) => part.textContent.trim())
        .join(' '),
    );
  }

  async function act(fixture: ComponentFixture<VoteTimes>, action: () => void): Promise<void> {
    action();
    await fixture.whenStable();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(timesStyles)).toEqual([]);
    expect(literalValues(stepStyles)).toEqual([]);
  });

  it('explains the mouse gestures on a screen with a mouse', async () => {
    const fixture = await render([nine]);

    expect(text(fixture)).toContain(
      'Y ahora los horarios... Haz doble clic para marcar tu preferido (máximo uno).',
    );
  });

  it('explains the touch gestures on a touch screen', async () => {
    touchScreen = true;
    const fixture = await render([nine]);

    expect(text(fixture)).toContain(
      'Y ahora los horarios... Toca una hora para indicar si puedes o no. Mantén pulsado para elegir tu preferido (máximo uno).',
    );
  });

  it('shows the legend of the three answers and tells keyboard users how to answer', async () => {
    const fixture = await render([nine]);
    const legend = Array.from(element(fixture).querySelectorAll('.legend li'), (item) =>
      item.textContent.trim(),
    );

    expect(legend).toEqual(['Disponible', 'Preferido', 'No puedo']);
    expect(text(fixture)).toContain('Intro: puedes o no puedes. Mayúsculas+Intro: tu preferido.');
  });

  it('heads each column with its month, day and weekday, and a range with both ends', async () => {
    const fixture = await render([nine, evening, seventh, weekend]);

    expect(headers(fixture)).toEqual(['Jul 6 Lun', 'Jul 7 Mar', 'Jul 11 Sáb ➔ Jul 12 Dom']);
  });

  it('shows each option as the organizer chose its time, named with its day and answer', async () => {
    const fixture = await render([nine, evening, seventh, weekend], {
      nine: 'available',
      evening: 'preferred',
      seventh: 'unavailable',
      weekend: 'available',
    });
    // The whole-day option of 7 July is unavailable, so its day is out of step 3.

    expect(blockNames(fixture)).toEqual([
      'lunes, 6 de julio, 9:00: Disponible',
      'lunes, 6 de julio, 18:00 a 20:30: Preferido',
      'sábado, 11 de julio a domingo, 12 de julio, Sin horario: Disponible',
    ]);
    expect(
      Array.from(element(fixture).querySelectorAll('.block'), (block) =>
        block.textContent.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['9:00', '18:00 ⬇ 20:30', 'Sin horario']);
    expect(
      Array.from(element(fixture).querySelectorAll('.block'), (block) =>
        [...block.classList].sort(),
      ),
    ).toEqual([
      ['available', 'block', 'single'],
      ['block', 'preferred', 'range'],
      ['available', 'block', 'whole-day'],
    ]);
  });

  it('leaves out the days that are not possible', async () => {
    const fixture = await render([nine, seventh], { nine: 'unavailable', seventh: 'available' });

    expect(headers(fixture)).toEqual(['Jul 7 Mar']);
  });

  it('toggles a time between available and unavailable when it is pressed', async () => {
    const fixture = await render([nine, evening]);

    await act(fixture, () => {
      button(fixture, /9:00:/).click();
    });
    expect(fixture.componentInstance.answers()).toEqual({
      nine: 'unavailable',
      evening: 'available',
    });

    await act(fixture, () => {
      button(fixture, /9:00:/).click();
    });
    expect(fixture.componentInstance.answers()).toEqual({
      nine: 'available',
      evening: 'available',
    });
  });

  it('keeps a day shown while its last time turns unavailable, until the step is opened again', async () => {
    const fixture = await render([nine]);

    await act(fixture, () => {
      button(fixture, /9:00:/).click();
    });

    expect(blockNames(fixture)).toEqual(['lunes, 6 de julio, 9:00: No puedo']);
  });

  it('makes a time the preferred one on double-click, and the previous one available', async () => {
    const fixture = await render([nine, evening], { nine: 'preferred', evening: 'available' });

    await act(fixture, () =>
      button(fixture, /20:30:/).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
    );

    expect(fixture.componentInstance.answers()).toEqual({
      nine: 'available',
      evening: 'preferred',
    });
  });

  it('ignores a double tap: a quick second tap only corrects the first', async () => {
    const fixture = await render([nine]);
    const block = button(fixture, /9:00:/);
    const touch = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });

    await act(fixture, () => {
      block.dispatchEvent(touch);
      block.click();
      block.click();
      block.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    expect(fixture.componentInstance.answers()).toEqual({ nine: 'available' });
  });

  it('makes a time the preferred one when a finger rests on it', async () => {
    const fixture = await render([nine]);
    vi.useFakeTimers();
    const touch = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });

    button(fixture, /9:00:/).dispatchEvent(touch);
    vi.advanceTimersByTime(HOLD_MS);

    expect(fixture.componentInstance.answers()).toEqual({ nine: 'preferred' });
  });

  it('makes the focused time the preferred one with Shift+Enter, without toggling it', async () => {
    const fixture = await render([nine]);
    const shiftEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });

    await act(fixture, () => button(fixture, /9:00:/).dispatchEvent(shiftEnter));

    expect(fixture.componentInstance.answers()).toEqual({ nine: 'preferred' });
    expect(shiftEnter.defaultPrevented).toBe(true);
  });

  it('lets a whole-day option be the preferred one', async () => {
    const fixture = await render([seventh]);

    await act(fixture, () =>
      button(fixture, /Sin horario/).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
    );

    expect(fixture.componentInstance.answers()).toEqual({ seventh: 'preferred' });
  });

  describe('with few columns', () => {
    it('shows no page indicator, goes back to step 2 and confirms the times', async () => {
      const fixture = await render([nine, seventh]);
      let back = 0;
      let done = 0;
      fixture.componentInstance.back.subscribe(() => (back += 1));
      fixture.componentInstance.done.subscribe(() => (done += 1));

      expect(element(fixture).querySelector('.page-indicator')).toBeNull();
      button(fixture, /Volver al paso 2/).click();
      button(fixture, /Confirmar mis horas/).click();

      expect([back, done]).toEqual([1, 1]);
    });
  });

  describe('with more columns than fit', () => {
    const july = ['06', '07', '08', '09', '10'].map((day) => wholeDay(`2026-07-${day}`));

    it('shows three columns at a time on a narrow screen and four on a wide one', async () => {
      const narrow = await render(july);
      wide = true;
      const wideScreen = await render(july);

      expect(headers(narrow)).toHaveLength(3);
      expect(element(narrow).querySelector('.page-indicator')?.textContent.trim()).toBe('1 / 2');
      expect(headers(wideScreen)).toHaveLength(4);
    });

    it('goes back to the first page with the new number of columns when the screen turns wide', async () => {
      const fixture = await render(july);
      await act(fixture, () => {
        button(fixture, /Días siguientes/).click();
      });

      await act(fixture, () => widthChanged?.({ matches: true }));

      expect(headers(fixture)).toHaveLength(4);
      expect(headers(fixture)[0]).toBe('Jul 6 Lun');
      expect(element(fixture).querySelector('.page-indicator')?.textContent.trim()).toBe('1 / 2');
    });

    it('pages forward and back, marks the last page and only confirms from it', async () => {
      const fixture = await render(july);
      let back = 0;
      let done = 0;
      fixture.componentInstance.back.subscribe(() => (back += 1));
      fixture.componentInstance.done.subscribe(() => (done += 1));
      const indicator = () => element(fixture).querySelector('.page-indicator');

      expect(indicator()?.classList).not.toContain('last');
      await act(fixture, () => {
        button(fixture, /Días siguientes/).click();
      });

      expect(headers(fixture)).toEqual(['Jul 9 Jue', 'Jul 10 Vie']);
      expect(indicator()?.textContent.trim()).toBe('2 / 2');
      expect(indicator()?.classList).toContain('last');
      expect(done).toBe(0);

      await act(fixture, () => {
        button(fixture, /Días anteriores/).click();
      });
      expect(headers(fixture)[0]).toBe('Jul 6 Lun');
      await act(fixture, () => {
        button(fixture, /Volver al paso 2/).click();
      });
      expect(back).toBe(1);
      await act(fixture, () => {
        button(fixture, /Días siguientes/).click();
      });
      await act(fixture, () => {
        button(fixture, /Confirmar mis horas/).click();
      });
      expect(done).toBe(1);
    });
  });

  describe('the year row', () => {
    function yearRow(fixture: ComponentFixture<VoteTimes>): string[] {
      return Array.from(element(fixture).querySelectorAll('.year-row > *'), (slot) =>
        slot.textContent.trim(),
      );
    }

    it('shows the year of the days on the left', async () => {
      const fixture = await render([nine]);

      expect(yearRow(fixture)).toEqual(['2026', '']);
    });

    it('shows both years when the page reaches into the next one', async () => {
      const fixture = await render([wholeDay('2026-12-31'), wholeDay('2027-01-01')]);

      expect(yearRow(fixture)).toEqual(['2026', '2027']);
    });

    it('says whose clock the times are on when the browser is in another time zone', async () => {
      const elsewhere = BROWSER_ZONE === 'America/New_York' ? 'Europe/Madrid' : 'America/New_York';
      const fixture = await render([nine], undefined, elsewhere);

      expect(element(fixture).querySelector('.zone')?.textContent.trim()).toBe(
        `Hora de ${elsewhere === 'Europe/Madrid' ? 'Madrid' : 'New York'}`,
      );
    });

    it('says nothing of the time zone when the browser is in the event’s', async () => {
      const fixture = await render([nine]);

      expect(element(fixture).querySelector('.zone')).toBeNull();
    });
  });
});
