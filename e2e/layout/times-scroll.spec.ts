// The list of hours of a column as the browser leaves it once it has been scrolled, at each
// width, with a mouse and with a finger: it rests with whole hours in sight, never with one cut
// by its top, whatever moved it.
import { expect, type Locator, test } from '@playwright/test';
import { columns, openTimes } from './times-step.js';

const hours = (column: Locator): Locator => column.locator('.hours');

const time = (column: Locator, hour: number): Locator =>
  column.locator('button.time', { hasText: new RegExp(`^\\s*${String(hour)}\\s*:`) });

/**
 * How far the list is from showing whole hours, in px: from the top of the hour nearest its top
 * to where the first hour stands when the list has not been scrolled.
 */
function offRow(list: Locator): Promise<number> {
  return list.evaluate((box) => {
    const first =
      box.getBoundingClientRect().top +
      box.clientTop +
      parseFloat(getComputedStyle(box).paddingTop);
    return Math.min(
      ...Array.from(box.children, (row) => Math.abs(row.getBoundingClientRect().top - first)),
    );
  });
}

const scrolled = (list: Locator): Promise<number> => list.evaluate((box) => box.scrollTop);

for (const finger of [false, true]) {
  test.describe(finger ? 'with a finger' : 'with a mouse', () => {
    test.use({ hasTouch: finger });

    test('the hours rest on a whole one after a scroll that ends between two', async ({ page }) => {
      await openTimes(page);
      const list = hours(columns(page).first());
      const opened = await scrolled(list);
      expect(await offRow(list)).toBeLessThanOrEqual(0.5);

      await list.hover();
      await page.mouse.wheel(0, 60);

      await expect.poll(() => scrolled(list)).toBeGreaterThan(opened);
      await expect.poll(() => offRow(list)).toBeLessThanOrEqual(0.5);
    });
  });
}

test('the saved times of a column rest on a whole one after a scroll that ends between two', async ({
  page,
}) => {
  await openTimes(page);
  const column = columns(page).first();
  for (const hour of [9, 10, 11, 12, 13]) {
    await time(column, hour).focus();
    await page.keyboard.press('Enter');
    await time(column, hour).locator('..').locator('button.save').focus();
    await page.keyboard.press('Enter');
  }
  const list = column.locator('app-saved-pills .pills');
  await expect(list.locator('li.pill')).toHaveCount(5);
  // The fifth one is brought into sight: the list ends up at its end.
  await expect
    .poll(() => list.evaluate((box) => box.scrollHeight - box.clientHeight - box.scrollTop))
    .toBeLessThanOrEqual(0.5);
  const rested = await scrolled(list);
  expect(rested).toBeGreaterThan(0);

  await list.hover();
  await page.mouse.wheel(0, -14);

  await expect.poll(() => scrolled(list)).toBeLessThan(rested);
  await expect.poll(() => offRow(list)).toBeLessThanOrEqual(0.5);
});

test('a drag past the end of the list still takes it to its last hour, and it rests on a whole one', async ({
  page,
}) => {
  await openTimes(page);
  const column = columns(page).first();
  const list = hours(column);
  const under = await column.locator('button', { hasText: '﹀' }).first().boundingBox();
  if (!under) throw new Error('no ﹀ under the hours');

  await time(column, 15).hover();
  await page.mouse.down();
  await page.mouse.move(under.x + under.width / 2, under.y + under.height / 2, { steps: 8 });
  await expect(time(column, 23)).toBeInViewport({ ratio: 1 });
  await page.mouse.up();

  await expect(time(column, 23)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => offRow(list)).toBeLessThanOrEqual(0.5);
});
