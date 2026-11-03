import {
  type EnvironmentProviders,
  Injectable,
  inject,
  isDevMode,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { TitleStrategy } from '@angular/router';
import {
  type Translation,
  type TranslocoLoader,
  TranslocoService,
  provideTransloco,
} from '@jsverse/transloco';
import { provideTranslocoMessageformat } from '@jsverse/transloco-messageformat';
import { type Observable, firstValueFrom, of } from 'rxjs';
import es from '../../../i18n/es.json';
import { I18nTitleStrategy } from './i18n-title-strategy';

@Injectable({ providedIn: 'root' })
class CatalogueLoader implements TranslocoLoader {
  getTranslation(): Observable<Translation> {
    return of(es);
  }
}

/**
 * Translations (ADR 0005): Transloco with ICU MessageFormat and keyed JSON catalogues.
 * The Spanish catalogue ships with the app, so the first page renders without waiting.
 */
export function provideI18n(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideTransloco({
      config: {
        availableLangs: ['es'],
        defaultLang: 'es',
        fallbackLang: 'es',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: { logMissingKey: isDevMode() },
      },
      loader: CatalogueLoader,
    }),
    provideTranslocoMessageformat(),
    provideAppInitializer(() => firstValueFrom(inject(TranslocoService).load('es'))),
    { provide: TitleStrategy, useClass: I18nTitleStrategy },
  ]);
}
