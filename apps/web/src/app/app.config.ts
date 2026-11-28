import { provideHttpClient } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { appRoutes } from './app.routes';
import { provideI18n } from './core/i18n/provide-i18n';
import { provideKeyboardFocusRing } from './core/layout/keyboard-focus';
import { provideScrollbarRoom } from './core/layout/scrollbar-room';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideI18n(),
    provideRouter(appRoutes(), withComponentInputBinding()),
    provideHttpClient(),
    provideKeyboardFocusRing(),
    provideScrollbarRoom(),
  ],
};
