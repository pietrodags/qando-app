// The trash of a column of the times step as the browser draws it, at each width, with a mouse
// and with a finger: where the screen has room for it, its place is kept, as tall as the trash,
// so nothing under the columns moves when it comes, and with a mouse the arrows are right under
// it; on a short phone it takes no hour from the lists; it is centred under its column, and its
// question stays inside the column. The wizard sends nothing before its last step, so nothing is
// stored.
import { expect, type Locator, type Page, test } from '@playwright/test';
import { currentStep } from '../steps/step-card.js';
import { columns, openTimes } from './times-step.js';

/** Marks an hour with the keyboard: the same at every width, mouse or finger. */
async function mark(page: Page, column: Locator, hour: number): Promise<void> {
  await column.locator('button.time', { hasText: new RegExp(`^\\s*${String(hour)}\\s*:`) }).focus();
  await page.keyboard.press('Enter');
}

/** Where the step's forward arrow is, from the top of the page, read in one go. */
function forwardTop(page: Page): Promise<number> {
  return currentStep(page)
    .getByRole('button', { name: 'Día siguiente', exact: true })
    .or(currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }))
    .evaluate((arrow) => arrow.getBoundingClientRect().top + window.scrollY);
}

/** How tall the list of hours of a column is. */
function listHeight(column: Locator): Promise<number> {
  return column.locator('.hours').evaluate((list) => list.getBoundingClientRect().height);
}

/**
 * A measure once the page has stopped moving: the step's card and the one before it settle for
 * a moment after the step opens, and the page may still scroll to the focus.
 */
async function settled(read: () => Promise<number>): Promise<number> {
  let last = Number.NaN;
  await expect
    .poll(
      async () => {
        const now = await read();
        const still = Math.abs(now - last) < 0.5;
        last = now;
        return still;
      },
      { intervals: [200] },
    )
    .toBe(true);
  return last;
}

async function box(element: Locator): Promise<{ x: number; y: number; width: number }> {
  const found = await element.boundingBox();
  if (!found) throw new Error('Not drawn');
  return found;
}

for (const finger of [false, true]) {
  test.describe(finger ? 'with a finger' : 'with a mouse', () => {
    test.use({ hasTouch: finger });

    test('nothing under the columns moves when the trash comes, on a screen with room for it', async ({
      page,
    }) => {
      await page.setViewportSize({ width: page.viewportSize()?.width ?? 0, height: 1100 });
      await openTimes(page);
      const before = await settled(() => forwardTop(page));

      await mark(page, columns(page).first(), 10);

      await expect(
        columns(page).first().getByRole('button', { name: 'Limpiar horarios' }),
      ).toBeVisible();
      expect(await settled(() => forwardTop(page))).toBeCloseTo(before, 0);
    });

    test('its place, kept, is as tall as the trash, and with a mouse the arrows are right under it', async ({
      page,
    }) => {
      await page.setViewportSize({ width: page.viewportSize()?.width ?? 0, height: 1100 });
      await openTimes(page);

      const { height, gap } = await currentStep(page).evaluate((step) => {
        const place = step.querySelector('.clear-place.kept')?.getBoundingClientRect();
        const arrows = step.querySelector('app-step-pager')?.getBoundingClientRect();
        if (!place || !arrows) throw new Error('No kept place, or no arrows');
        return { height: place.height, gap: arrows.top - place.bottom };
      });

      expect(height).toBeCloseTo(40, 0);
      // With a finger the row of the "+" is between them.
      if (!finger) expect(gap).toBeCloseTo(0, 0);
    });

    test('on a short phone the trash takes no hour from the lists when it comes', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await openTimes(page);
      const first = columns(page).first();
      const before = await settled(() => listHeight(first));

      await mark(page, first, 10);

      await expect(first.getByRole('button', { name: 'Limpiar horarios' })).toBeVisible();
      expect(await settled(() => listHeight(first))).toBeCloseTo(before, 0);
    });

    test('the trash is centred under its column, and its question stays inside it', async ({
      page,
    }) => {
      await openTimes(page);
      const first = columns(page).first();
      await mark(page, first, 10);
      const list = first.locator('.well');
      const trash = first.getByRole('button', { name: 'Limpiar horarios' });

      const column = await box(list);
      const icon = await box(trash);
      expect(Math.abs(icon.x + icon.width / 2 - (column.x + column.width / 2))).toBeLessThanOrEqual(
        1,
      );

      await (finger ? trash.tap() : trash.click());
      const question = first.getByRole('group', { name: '¿Borrar?', exact: true });
      await expect(question).toBeVisible();
      for (const part of [
        question.locator('.question'),
        question.getByRole('button', { name: 'Sí' }),
        question.getByRole('button', { name: 'No' }),
      ]) {
        const each = await box(part);
        expect(each.x).toBeGreaterThanOrEqual(column.x - 0.5);
        expect(each.x + each.width).toBeLessThanOrEqual(column.x + column.width + 0.5);
      }
    });
  });
}
