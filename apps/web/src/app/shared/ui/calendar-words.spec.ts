import { calendarWords } from './calendar-words';

describe('calendarWords', () => {
  describe('in Spanish', () => {
    it('names the weekdays by their initial, from Monday on', () => {
      expect(calendarWords('es').weekdays).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D']);
    });

    it('titles a month with its name, capitalised, and its year', () => {
      const words = calendarWords('es');

      expect(words.monthTitle('2026-07')).toBe('Julio 2026');
      expect(words.monthTitle('2026-12')).toBe('Diciembre 2026');
      expect(words.monthTitle('2027-01')).toBe('Enero 2027');
    });

    it('names a date in full: its weekday, its day and its month', () => {
      const words = calendarWords('es');

      expect(words.dayName('2026-07-06')).toBe('lunes, 6 de julio');
      expect(words.dayName('2026-07-31')).toBe('viernes, 31 de julio');
      expect(words.dayName('2027-01-01')).toBe('viernes, 1 de enero');
    });
  });

  describe('in English', () => {
    it('names the weekdays by their initial, from Monday on', () => {
      expect(calendarWords('en').weekdays).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    });

    it('titles a month with its name and its year', () => {
      const words = calendarWords('en');

      expect(words.monthTitle('2026-07')).toBe('July 2026');
      expect(words.monthTitle('2026-12')).toBe('December 2026');
      expect(words.monthTitle('2027-01')).toBe('January 2027');
    });

    it('names a date in full: its weekday, its month and its day', () => {
      const words = calendarWords('en');

      expect(words.dayName('2026-07-06')).toBe('Monday, July 6');
      expect(words.dayName('2026-07-31')).toBe('Friday, July 31');
    });
  });
});

describe('calendarWords: a date without its weekday', () => {
  it('names the day and its month in each language', () => {
    expect(calendarWords('es').dayOfMonth('2026-07-06')).toBe('6 de julio');
    expect(calendarWords('es').dayOfMonth('2026-12-31')).toBe('31 de diciembre');
    expect(calendarWords('en').dayOfMonth('2026-07-06')).toBe('July 6');
  });
});
