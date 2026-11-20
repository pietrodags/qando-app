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

describe('calendarWords: the year of a date', () => {
  it('is said only when the date is not in the year of today', () => {
    const words = calendarWords('es');

    expect(words.dayName('2026-11-27', '2026-11-20')).toBe('viernes, 27 de noviembre');
    expect(words.dayName('2027-01-08', '2026-11-20')).toBe('viernes, 8 de enero de 2027');
    expect(words.dayOfMonth('2026-11-28', '2026-11-20')).toBe('28 de noviembre');
    expect(words.dayOfMonth('2027-01-08', '2026-11-20')).toBe('8 de enero de 2027');
  });

  it('is said in the order of each language', () => {
    expect(calendarWords('en').dayName('2027-01-08', '2026-11-20')).toBe('Friday, January 8, 2027');
    expect(calendarWords('en').dayOfMonth('2027-01-08', '2026-11-20')).toBe('January 8, 2027');
  });
});

describe('calendarWords: a date as its short weekday and its day', () => {
  it('capitalises the weekday and leaves the month out, in each language', () => {
    expect(calendarWords('es').shortDay('2026-06-22')).toBe('Lun 22');
    expect(calendarWords('es').shortDay('2026-07-02')).toBe('Jue 2');
    expect(calendarWords('es').shortDay('2026-06-20')).toBe('Sáb 20');
    expect(calendarWords('en').shortDay('2026-07-02')).toBe('Thu 2');
  });

  it('reads the date as the calendar value it is, whatever the time zone', () => {
    // Midnight UTC is the day before in the Americas: the weekday is still the date's own.
    expect(calendarWords('es').shortDay('2026-01-01')).toBe('Jue 1');
    expect(calendarWords('es').shortDay('2026-12-31')).toBe('Jue 31');
  });
});

describe('calendarWords: a date as a field shows it', () => {
  it('gives its short weekday, its day, its short month and its year, without commas', () => {
    expect(calendarWords('es').shortDate('2026-11-27')).toBe('vie 27 nov 2026');
    expect(calendarWords('es').shortDate('2027-01-01')).toBe('vie 1 ene 2027');
    expect(calendarWords('en').shortDate('2026-11-27')).toBe('Fri Nov 27 2026');
  });

  it('reads the date as the calendar value it is, whatever the time zone', () => {
    expect(calendarWords('es').shortDate('2026-12-31')).toBe('jue 31 dic 2026');
  });
});

describe('calendarWords: the weekday of a date', () => {
  it('names it in full, in each language', () => {
    expect(calendarWords('es').weekday('2026-11-28')).toBe('sábado');
    expect(calendarWords('es').weekday('2027-01-01')).toBe('viernes');
    expect(calendarWords('en').weekday('2026-11-28')).toBe('Saturday');
  });
});
