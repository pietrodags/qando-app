import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { parse } from '@messageformat/parser';
import es from '../../../i18n/es.json';
import { provideI18n } from './provide-i18n';

function flatten(catalogue: object, prefix = ''): [string, unknown][] {
  return Object.entries(catalogue).flatMap(([key, value]): [string, unknown][] => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object'
      ? flatten(value as object, path)
      : [[path, value]];
  });
}

describe('i18n', () => {
  let transloco: TranslocoService;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideI18n()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    transloco = TestBed.inject(TranslocoService);
  });

  it('starts in Spanish with the Spanish catalogue loaded', () => {
    expect(transloco.getActiveLang()).toBe('es');
    expect(transloco.translate('common.retry')).toBe('Reintentar');
  });

  it('formats ICU plurals and placeholders', () => {
    transloco.setTranslationKey(
      'test.voters',
      '{count, plural, one {# persona ha votado} other {# personas han votado}}',
    );

    expect(transloco.translate('test.voters', { count: 1 })).toBe('1 persona ha votado');
    expect(transloco.translate('test.voters', { count: 3 })).toBe('3 personas han votado');
  });

  describe('Spanish catalogue', () => {
    const entries = flatten(es);

    it('holds only non-empty strings', () => {
      const invalid = entries.filter(([, value]) => typeof value !== 'string' || value === '');
      expect(invalid).toEqual([]);
    });

    it('holds only valid ICU messages', () => {
      const invalid = entries.filter(([, value]) => {
        try {
          parse(String(value));
          return false;
        } catch {
          return true;
        }
      });
      expect(invalid).toEqual([]);
    });
  });
});
