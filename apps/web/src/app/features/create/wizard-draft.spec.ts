import type { DayTimes } from './day-times';
import { type WizardDraft, forgetDraft, keepDraft, newDraft, openingDraft } from './wizard-draft';

describe('the wizard draft', () => {
  /** Ana's wizard left on its last step, everything asked, after a send whose answer was lost. */
  const left: WizardDraft = {
    step: 3,
    details: { organizerName: 'Ana', title: 'Cena de verano' },
    dates: {
      singles: ['2026-06-20'],
      ranges: [{ start: '2026-06-26', end: '2026-06-28' }],
      saved: [{ start: '2026-07-03', end: '2026-07-05' }],
      times: {},
      timed: false,
    },
    phrase: 'el sábado y el finde siguiente',
    month: '2026-07',
    ending: { deadline: '2026-06-18', note: 'Cenamos en casa de Marta.', anonymous: true },
    sent: { token: 'tK3nAbCdEfGhIjKlMnOpQr', body: '{"title":"Cena de verano"}' },
  };

  /** The same wizard with times asked for, left on the summary of its times. */
  const timed: WizardDraft = {
    ...left,
    step: 4,
    dates: {
      ...left.dates,
      times: {
        '2026-06-20': {
          marked: [{ kind: 'single', at: '18:15' }],
          saved: [{ kind: 'range', start: '20:00', end: '22:00' }],
        },
      },
      timed: true,
    },
  };

  /** Sets the clock of the person to noon of a day of June 2026. */
  function onJune(day: number): void {
    vi.setSystemTime(new Date(2026, 5, day, 12));
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // Monday 15 June 2026.
    onJune(15);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('opens a new wizard while this tab has kept none: step 1, nothing asked, on the month of today', () => {
    expect(openingDraft()).toEqual({
      step: 1,
      details: { organizerName: '', title: '' },
      dates: { singles: [], ranges: [], saved: [], times: {}, timed: false },
      phrase: '',
      month: '2026-06',
      ending: { deadline: null, note: '', anonymous: false },
      sent: null,
    });
    expect(newDraft()).toEqual(openingDraft());
  });

  it('opens a new wizard on the month of the day it is opened', () => {
    vi.setSystemTime(new Date(2026, 7, 1, 12));

    expect(newDraft().month).toBe('2026-08');
  });

  it('opens the draft kept, as it was left', () => {
    keepDraft(left);

    expect(openingDraft()).toEqual(left);
  });

  it('opens the draft kept with its times', () => {
    keepDraft(timed);

    expect(openingDraft()).toEqual(timed);
  });

  it('keeps only the last draft', () => {
    keepDraft(timed);
    keepDraft(left);

    expect(openingDraft()).toEqual(left);
  });

  it('keeps the draft for this tab alone, gone when it closes', () => {
    keepDraft(left);

    expect(sessionStorage).toHaveLength(1);
    expect(localStorage).toHaveLength(0);
  });

  it('opens a new wizard once the draft is forgotten', () => {
    keepDraft(left);

    forgetDraft();

    expect(openingDraft()).toEqual(newDraft());
    expect(sessionStorage).toHaveLength(0);
  });

  describe('opened on a later day', () => {
    it('drops the dates before today: the days of their own, and the ranges that began before it whole', () => {
      onJune(12);
      keepDraft({
        ...left,
        dates: {
          singles: ['2026-06-12', '2026-06-15', '2026-06-20'],
          ranges: [
            { start: '2026-06-13', end: '2026-06-16' },
            { start: '2026-06-26', end: '2026-06-28' },
          ],
          saved: [
            { start: '2026-06-14', end: '2026-06-15' },
            { start: '2026-06-15', end: '2026-06-17' },
          ],
          times: {},
          timed: false,
        },
      });
      onJune(15);

      expect(openingDraft().dates).toEqual({
        singles: ['2026-06-15', '2026-06-20'],
        ranges: [{ start: '2026-06-26', end: '2026-06-28' }],
        saved: [{ start: '2026-06-15', end: '2026-06-17' }],
        times: {},
        timed: false,
      });
    });

    it('drops the times of a date dropped and keeps the others', () => {
      onJune(12);
      const times: DayTimes = { marked: [{ kind: 'single', at: '18:15' }], saved: [] };
      keepDraft({
        ...timed,
        dates: {
          ...timed.dates,
          singles: ['2026-06-13', '2026-06-20'],
          times: { '2026-06-13': times, '2026-06-20': times },
        },
      });
      onJune(15);

      expect(openingDraft().dates.times).toEqual({ '2026-06-20': times });
    });

    it('opens the calendar on the month of today when the month left is past', () => {
      vi.setSystemTime(new Date(2026, 4, 30, 12));
      keepDraft({ ...left, month: '2026-05' });
      onJune(1);

      expect(openingDraft().month).toBe('2026-06');
    });

    it('goes back to the suggested deadline when the one chosen is past, and keeps one of today', () => {
      onJune(14);
      keepDraft({ ...left, ending: { ...left.ending, deadline: '2026-06-14' } });
      onJune(15);
      expect(openingDraft().ending).toEqual({ ...left.ending, deadline: null });

      keepDraft({ ...left, ending: { ...left.ending, deadline: '2026-06-15' } });
      expect(openingDraft().ending.deadline).toBe('2026-06-15');
    });

    it('opens the dates when no date is left, what was written in the smart calendar kept', () => {
      onJune(12);
      keepDraft({
        ...left,
        dates: { ...left.dates, singles: ['2026-06-13'], ranges: [], saved: [] },
      });
      onJune(15);

      expect(openingDraft()).toMatchObject({ step: 2, phrase: left.phrase });
    });

    it('opens the last step when no date of its own is left to have times', () => {
      onJune(12);
      keepDraft({ ...timed, step: 5, dates: { ...timed.dates, singles: ['2026-06-13'] } });
      onJune(15);

      expect(openingDraft().step).toBe(3);
    });

    it('keeps the step of the summary while a date of its own can have times', () => {
      keepDraft(timed);
      onJune(19);

      expect(openingDraft().step).toBe(4);
    });
  });

  it('opens step 1 when the name or the title left are not valid', () => {
    keepDraft({ ...left, details: { ...left.details, title: '  ' } });
    expect(openingDraft().step).toBe(1);

    keepDraft({ ...left, details: { ...left.details, organizerName: 'A' } });
    expect(openingDraft().step).toBe(1);
  });

  it.each([
    ['something that is not JSON', () => 'not a draft'],
    ['nothing', () => 'null'],
    ['an object without a draft', () => '{}'],
    [
      'a draft kept by another version of the wizard',
      (kept: string) => {
        const { version, ...rest } = JSON.parse(kept) as { version: number };
        return JSON.stringify({ ...rest, version: version - 1 });
      },
    ],
  ])('opens a new wizard when this tab holds %s', (_what, written) => {
    keepDraft(left);
    const key = sessionStorage.key(0) ?? '';

    sessionStorage.setItem(key, written(sessionStorage.getItem(key) ?? ''));

    expect(openingDraft()).toEqual(newDraft());
  });

  it('goes on without a draft in a tab whose storage is refused', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Refused', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Refused', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Refused', 'SecurityError');
    });

    expect(() => {
      keepDraft(left);
    }).not.toThrow();
    expect(openingDraft()).toEqual(newDraft());
    expect(() => {
      forgetDraft();
    }).not.toThrow();
  });
});
