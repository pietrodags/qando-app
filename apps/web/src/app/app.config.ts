import { provideHttpClient } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { provideI18n } from './core/i18n/provide-i18n';
import { provideKeyboardFocusRing } from './core/layout/keyboard-focus';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideI18n(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(),
    provideKeyboardFocusRing(),
  ],
};
