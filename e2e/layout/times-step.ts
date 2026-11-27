// The wizard's times step, for the tests of what the browser draws on it. The wizard sends
// nothing before its last step, so nothing is stored.
import { expect, type Locator, type Page } from '@playwright/test';
import { currentStep, stepsSettled } from '../steps/step-card.js';

const DAYS = ['sábado, 20 de junio', 'domingo, 21 de junio', 'martes, 23 de junio'];

/**
 * Goes through the wizard to the times step, with a column for each of the three days, once its
 * card has come in and the step before has folded away: the lists of hours are measured at the
 * size they keep.
 */
export async function openTimes(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00+02:00'));
  await page.goto('/');
  await currentStep(page).getByLabel('¿Qué organizamos?').fill('Cena de verano');
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  for (const day of DAYS) {
    await currentStep(page).getByRole('button', { name: day, exact: true }).click();
  }
  await currentStep(page).getByRole('switch', { name: 'Horario', exact: true }).click();
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(columns(page)).toHaveCount(DAYS.length);
  await stepsSettled(page);
}

/** The columns of the step, one for each day. */
export const columns = (page: Page): Locator => currentStep(page).getByRole('group');
