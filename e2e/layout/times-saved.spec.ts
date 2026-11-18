// The saved times of the times step as the browser draws them, at each width, with a mouse and
// with a finger: the "−" of a pill is whole wherever its pill is, and the shadow of a column's
// well falls on its hours alone. The wizard sends nothing before its last step, so nothing is
// stored.
import { expect, type Locator, type Page, test } from '@playwright/test';
import { columns, openTimes } from './times-step.js';

const pill = (column: Locator, time: string): Locator =>
  column.locator('app-saved-pills li.pill').filter({ hasText: time });

/** Marks an hour and saves it, with the keyboard: the same at every width, mouse or finger. */
async function save(page: Page, column: Locator, hour: number): Promise<void> {
  const row = column.locator('.row').filter({
    has: page.locator('button.time', { hasText: new RegExp(`^\\s*${hour}\\s*:`) }),
  });
  await row.locator('button.time').focus();
  await page.keyboard.press('Enter');
  await row.locator('button.save').focus();
  await page.keyboard.press('Enter');
  await expect(pill(column, `${hour}:00`)).toHaveCount(1);
}

/** Brings the "−" of a pill: the mouse over the pill, or a finger's press on it. */
async function showRemove(page: Page, saved: Locator, finger: boolean): Promise<Locator> {
  const view = saved.locator('button.pill-view');
  await (finger ? view.tap() : view.hover());
  const remove = saved.locator('button.remove');
  await expect(remove).toBeVisible();
  return remove;
}

/**
 * How far an element reaches out of what cuts it, in px: every box around it that hides what
 * overflows it, on the sides it hides.
 */
function cut(element: Locator): Promise<number> {
  return element.evaluate((target) => {
    const box = target.getBoundingClientRect();
    let most = 0;
    for (let around = target.parentElement; around; around = around.parentElement) {
      const style = getComputedStyle(around);
      const edge = around.getBoundingClientRect();
      const left = edge.left + around.clientLeft;
      const top = edge.top + around.clientTop;
      if (style.overflowX !== 'visible') {
        most = Math.max(most, left - box.left, box.right - (left + around.clientWidth));
      }
      if (style.overflowY !== 'visible') {
        most = Math.max(most, top - box.top, box.bottom - (top + around.clientHeight));
      }
    }
    return most;
  });
}

/**
 * How far the shadow of the circle of a "−" reaches out of what cuts it, in px. The circle is
 * drawn in the middle of its button, which may be larger and grows under the mouse; its shadow
 * reaches as far as each of its layers is moved, blurred and spread.
 */
function shadowCut(remove: Locator): Promise<number> {
  return remove.evaluate((button: HTMLElement) => {
    const circle = getComputedStyle(button, '::before');
    const pressed = button.getBoundingClientRect();
    const grown = pressed.width / button.offsetWidth;
    const half = (parseFloat(circle.width) * grown) / 2;
    const middle = { x: pressed.left + pressed.width / 2, y: pressed.top + pressed.height / 2 };
    const reach = { left: 0, top: 0, right: 0, bottom: 0 };
    for (const layer of circle.boxShadow.split(/,(?![^(]*\))/)) {
      if (layer.includes('inset')) continue;
      const [x = 0, y = 0, blur = 0, spread = 0] = (layer.match(/-?[\d.]+px/g) ?? []).map(
        parseFloat,
      );
      reach.left = Math.max(reach.left, (blur + spread - x) * grown);
      reach.right = Math.max(reach.right, (blur + spread + x) * grown);
      reach.top = Math.max(reach.top, (blur + spread - y) * grown);
      reach.bottom = Math.max(reach.bottom, (blur + spread + y) * grown);
    }
    const box = {
      left: middle.x - half - reach.left,
      right: middle.x + half + reach.right,
      top: middle.y - half - reach.top,
      bottom: middle.y + half + reach.bottom,
    };
    let most = 0;
    for (let around = button.parentElement; around; around = around.parentElement) {
      const style = getComputedStyle(around);
      const edge = around.getBoundingClientRect();
      const left = edge.left + around.clientLeft;
      const top = edge.top + around.clientTop;
      if (style.overflowX !== 'visible') {
        most = Math.max(most, left - box.left, box.right - (left + around.clientWidth));
      }
      if (style.overflowY !== 'visible') {
        most = Math.max(most, top - box.top, box.bottom - (top + around.clientHeight));
      }
    }
    return most;
  });
}

/** The shadow of a "−" is whole, also once the "−" has grown under the mouse. */
async function expectShadowWhole(remove: Locator, finger: boolean): Promise<void> {
  if (!finger) await remove.hover();
  await expect.poll(() => shadowCut(remove)).toBeLessThanOrEqual(0.5);
  // Still whole once it has stopped growing.
  await remove.evaluate((button) => Promise.all(button.getAnimations().map((a) => a.finished)));
  expect(await shadowCut(remove)).toBeLessThanOrEqual(0.5);
}

for (const finger of [false, true]) {
  test.describe(finger ? 'with a finger' : 'with a mouse', () => {
    test.use({ hasTouch: finger });

    test('the "−" of a saved time and its shadow are whole on the last column on screen', async ({
      page,
    }) => {
      await openTimes(page);
      const last = columns(page).last();
      await save(page, last, 10);

      const remove = await showRemove(page, pill(last, '10:00'), finger);

      expect(await cut(remove)).toBeLessThanOrEqual(0.5);
      await expectShadowWhole(remove, finger);
    });

    test('the "−" of the last saved time in sight and its shadow are whole in a list that scrolls', async ({
      page,
    }) => {
      await openTimes(page);
      const last = columns(page).last();
      for (const hour of [9, 10, 11, 12, 13]) await save(page, last, hour);
      await expect(last.locator('app-saved-pills button.fold')).toHaveCount(2);

      const remove = await showRemove(page, pill(last, '13:00'), finger);

      expect(await cut(remove)).toBeLessThanOrEqual(0.5);
      await expectShadowWhole(remove, finger);
    });
  });
}

test('the shadow of a well falls on its hours alone, with saved times under them', async ({
  page,
}) => {
  await openTimes(page);
  const first = columns(page).first();
  await save(page, first, 10);

  // The shadows drawn apart over the hours: where each starts and ends, beside the hours' own.
  const { shadows, hours } = await first.evaluate((column) => {
    const list = column.querySelector('.hours');
    if (!list) throw new Error('The column has no list of hours.');
    const found: { top: number; bottom: number }[] = [];
    for (let around: Element | null = list; around && column.contains(around);) {
      const drawn = getComputedStyle(around, '::after');
      if (drawn.content !== 'none' && drawn.position === 'absolute' && drawn.boxShadow !== 'none') {
        const top = around.getBoundingClientRect().top + around.clientTop + parseFloat(drawn.top);
        found.push({ top, bottom: top + parseFloat(drawn.height) });
      }
      around = around.parentElement;
    }
    const box = list.getBoundingClientRect();
    return { shadows: found, hours: { top: box.top, bottom: box.bottom } };
  });

  expect(shadows).toHaveLength(1);
  expect(shadows[0]?.top).toBeCloseTo(hours.top, 0);
  expect(shadows[0]?.bottom).toBeCloseTo(hours.bottom, 0);
});
