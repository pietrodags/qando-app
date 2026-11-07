import { TestBed } from '@angular/core/testing';
import type { Option } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { OptionLabels } from './option-labels';

const id = '6f1c2a0e-0000-4000-8000-000000000001';

function single(date: string, time: Option['time'] = null): Option {
  return { id, dates: { kind: 'single', date }, time };
}

function range(start: string, end: string): Option {
  return { id, dates: { kind: 'range', start, end }, time: null };
}

describe('OptionLabels', () => {
  let labels: OptionLabels;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideI18n()] });
    labels = TestBed.inject(OptionLabels);
  });

  /** The long label with its connecting words in brackets: "sábado 11 [de] julio". */
  function marked(option: Option): string {
    return labels
      .long(option)
      .map(({ text, minor }) => (minor ? `[${text}]` : text))
      .join('');
  }

  describe('the long label', () => {
    it.each([
      ['a day', single('2026-07-11'), 'sábado 11 [de] julio'],
      [
        'a day at a time',
        single('2026-01-08', { kind: 'single', at: '09:30' }),
        'jueves 8 [de] enero[, a las] 9:30',
      ],
      [
        'a day between two times',
        single('2026-01-08', { kind: 'range', start: '10:00', end: '12:00' }),
        'jueves 8 [de] enero[, de] 10:00 [a] 12:00',
      ],
      [
        'days in one month',
        range('2026-01-05', '2026-01-09'),
        '[del] lunes 5 [al] viernes 9 [de] enero',
      ],
      [
        'days across two months',
        range('2026-12-31', '2027-01-01'),
        '[del] jueves 31 [de] diciembre [al] viernes 1 [de] enero',
      ],
    ])('names %s, its connecting words apart', (_case, option, expected) => {
      expect(marked(option)).toBe(expected);
    });

    it('leaves no empty piece where a label starts or ends with a connecting word', () => {
      const pieces = labels.long(range('2026-01-05', '2026-01-09')).map(({ text }) => text);

      expect(pieces).not.toContain('');
    });

    it('reads as plain text, for the share message', () => {
      expect(labels.plain(range('2026-01-05', '2026-01-09'))).toBe(
        'del lunes 5 al viernes 9 de enero',
      );
    });
  });

  describe('the short label', () => {
    it.each([
      ['a day', single('2026-07-11'), 'Sáb 11 Jul'],
      [
        'a day at a time',
        single('2026-01-08', { kind: 'single', at: '09:30' }),
        'Jue 8 Ene · 9:30',
      ],
      [
        'a day between two times',
        single('2026-01-08', { kind: 'range', start: '10:00', end: '12:00' }),
        'Jue 8 Ene · 10:00 → 12:00',
      ],
      ['days in one month', range('2026-07-07', '2026-07-10'), 'Mar 7 → Vie 10 Jul'],
      ['days across two months', range('2026-06-29', '2026-07-02'), 'Lun 29 Jun → Jue 2 Jul'],
    ])('names %s', (_case, option, expected) => {
      expect(labels.short(option)).toBe(expected);
    });

    it('takes the same month of another year as another month', () => {
      expect(labels.short(range('2026-07-30', '2027-07-02'))).toBe('Jue 30 Jul → Vie 2 Jul');
    });
  });
});
