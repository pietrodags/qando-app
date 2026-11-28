// The voting page's times step for the layout tests: an event answered by the test (nothing is
// stored), the way to its times step, and where its columns and year are expected to be.
import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { currentStep, stepsSettled } from '../steps/step-card.js';
import { drawn, middle } from './column-years.js';

const participationId = 'p'.repeat(22);

/** An open event with a time, 19:00, on each of `dates`, on the clock of `timeZone`. */
export function eventOn(dates: readonly string[], timeZone = 'Europe/Madrid'): object {
  return {
    title: 'Cena de verano',
    organizerName: 'Ana',
    note: null,
    deadline: '2026-12-20',
    timeZone,
    anonymous: false,
    state: 'open',
    confirmedOption: null,
    options: dates.map((date) => ({
      id: randomUUID(),
      dates: { kind: 'single', date },
      time: { kind: 'single', at: '19:00' },
    })),
  };
}

/** The voting page of `event`, on to its times step once its card has come in. */
export async function toTimes(page: Page, event: object): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-12-01T12:00:00+01:00'));
  await page.route(`**/api/public/events/${participationId}`, (route) =>
    route.fulfill({ json: event }),
  );
  await page.goto(`/vote/${participationId}`);
  await page.getByLabel('Escribe tu nombre para votar').fill('Luis');
  await page.getByRole('button', { name: 'Quiero elegir mis preferencias…' }).click();
  await stepsSettled(page);
  const choose = page.getByRole('button', { name: 'Elegir las horas' });
  // Several months: the forward arrow pages to the last one, whose arrow goes on to the times.
  while (!(await choose.isVisible())) {
    await currentStep(page).locator('app-step-pager button.arrow').last().click();
    await stepsSettled(page);
  }
  await choose.click();
  await expect(currentStep(page).locator('app-vote-times')).toBeVisible();
}

/**
 * `columns` columns of days on screen and, lying or upright, their year inside the card, 8 px
 * from the first day, level with its month.
 */
export async function expectColumnsAndYear(page: Page, columns: number): Promise<void> {
  await expect(currentStep(page).locator('.column')).toHaveCount(columns);
  const { years, first, firstMonth, card } = await drawn(page);
  const [year] = years;
  if (!year) throw new Error('No year');
  expect(year.cut).toBe(0);
  expect(year.box.left).toBeGreaterThanOrEqual(card.left + 4);
  expect(year.box.right).toBeLessThanOrEqual(first.left - 8);
  if (year.box.height > year.box.width) {
    expect(Math.abs(year.box.top - firstMonth.top)).toBeLessThanOrEqual(3);
  } else {
    expect(Math.abs(middle(year.box) - middle(firstMonth))).toBeLessThanOrEqual(2);
  }
}
