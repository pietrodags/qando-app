import type { Locator, Page } from '@playwright/test';
import { currentStep } from './step-card.js';

// The calendar of the wizard's dates step as a scenario finds it, for the step files that look at
// it: its days by their date, the dates marked, its month arrows, and a press as the scenario's
// browser gives it.

export const dayNames = new Intl.DateTimeFormat('es', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

const datesOfRange = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** As a day of a range ends its name: "rango del 18 de junio al 20 de junio". */
export function rangeName(start: string, end: string): string {
  return `rango del ${datesOfRange.format(Date.parse(start))} al ${datesOfRange.format(Date.parse(end))}`;
}

/**
 * A day of the month on screen, named in full for screen readers ("sábado, 20 de junio"); a day
 * of a range adds its range ("sábado, 20 de junio, rango del 18 de junio al 20 de junio").
 */
export function day(page: Page, date: string): Locator {
  return currentStep(page).getByRole('button', {
    name: new RegExp(`^${dayNames.format(Date.parse(date))}(, rango del .+)?$`),
  });
}

/** The month on screen: its days and the "+" of its ranges. A pill under it is not part of it. */
export const calendar = (page: Page): Locator => currentStep(page).getByRole('group');

/** The dates marked on the month on screen, as their days are named: singles and ranges. */
export async function datesOnScreen(page: Page): Promise<string[]> {
  const names = await calendar(page)
    .locator('button[aria-pressed="true"]')
    .evaluateAll((days) => days.map((each) => each.getAttribute('aria-label') ?? ''));
  // Every day of a range ends with the same words: once per range.
  return [...new Set(names.map((name) => /rango del .+$/.exec(name)?.[0] ?? name))];
}

export const monthArrow = (page: Page, name: 'Mes anterior' | 'Mes siguiente'): Locator =>
  currentStep(page).getByRole('button', { name, exact: true });

/** A press with what the scenario's browser has: a finger on a touch screen, or the mouse. */
export const press = (target: Locator, hasTouch: boolean): Promise<void> =>
  hasTouch ? target.tap() : target.click();
