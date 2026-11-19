// The smart calendar's box on the dates step, as the browser draws it: it covers the calendar
// alone, as large as it, and what is under the calendar stays where it was while the box is open
// and once it is closed. The wizard sends nothing before a phrase is read, so nothing is stored.
import { expect, type Locator, type Page, test } from '@playwright/test';
import { settled } from '../settled.js';
import { currentStep } from '../steps/step-card.js';

/** Where an element is drawn: its corner and its size. */
interface Place {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function openDates(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00+02:00'));
  await page.goto('/');
  await currentStep(page).getByLabel('Tu nombre').fill('Ana');
  await currentStep(page).getByLabel('¿Qué hay que organizar?').fill('Cena de verano');
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(currentStep(page).getByRole('heading', { name: 'Junio 2026' })).toBeVisible();
}

/** Where an element is once the step is still: its card settles for a moment after a change. */
async function placeOf(page: Page, element: Locator): Promise<Place> {
  await settled(page);
  let place = await element.boundingBox();
  await expect
    .poll(async () => {
      const before = place;
      await page.waitForTimeout(100);
      place = await element.boundingBox();
      return JSON.stringify(place) === JSON.stringify(before);
    })
    .toBe(true);
  if (!place) throw new Error('The element is not on screen');
  return place;
}

/** The two places are the same, to less than a pixel. */
function expectSamePlace(place: Place, other: Place): void {
  for (const side of ['x', 'y', 'width', 'height'] as const) {
    expect(place[side], side).toBeCloseTo(other[side], 0);
  }
}

test('the box is as large as the calendar it covers, and nothing under it moves', async ({
  page,
}) => {
  await openDates(page);
  const step = currentStep(page);
  const asker = step.getByRole('switch', { name: 'Generar fechas con IA', exact: true });
  const calendar = step.locator('.calendar');
  const row = step.locator('.tools');
  const arrows = step.locator('.nav');
  // A date marked: the row under the calendar has its trash.
  await step.getByRole('button', { name: 'sábado, 20 de junio', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Limpiar selección' })).toBeVisible();
  const closed = {
    calendar: await placeOf(page, calendar),
    row: await placeOf(page, row),
    arrows: await placeOf(page, arrows),
  };

  await asker.click();
  const box = step.locator('app-phrase-box');
  await expect(box).toBeVisible();

  expectSamePlace(await placeOf(page, box), closed.calendar);
  expectSamePlace(await placeOf(page, calendar), closed.calendar);
  expectSamePlace(await placeOf(page, row), closed.row);
  expectSamePlace(await placeOf(page, arrows), closed.arrows);
  // Under the box the calendar is not seen, and the row keeps its trash.
  await expect(calendar).toBeHidden();
  await expect(row.getByRole('button', { name: 'Limpiar selección' })).toBeVisible();

  // A phrase of one line asks for no more room than the calendar gives.
  await box.getByRole('textbox').fill('todos los lunes de julio');
  expectSamePlace(await placeOf(page, box), closed.calendar);
  expectSamePlace(await placeOf(page, row), closed.row);

  await asker.click();
  await expect(box).toHaveCount(0);

  await expect(calendar).toBeVisible();
  expectSamePlace(await placeOf(page, calendar), closed.calendar);
  expectSamePlace(await placeOf(page, row), closed.row);
  expectSamePlace(await placeOf(page, arrows), closed.arrows);
});
