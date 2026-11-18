// The saved times of the times step as the browser draws them, at each width, with a mouse and
// with a finger: the "−" of a pill is whole wherever its pill is, and the shadow of a column's
// well falls on its hours alone. The wizard sends nothing before its last step, so nothing is
// stored.
import { expect, type Locator, type Page, test } from '@playwright/test';
import { currentStep } from '../steps/step-card.js';

const DAYS = ['sábado, 20 de junio', 'domingo, 21 de junio', 'martes, 23 de junio'];

/** Goes through the wizard to the times step, with a column for each of the three days. */
async function openTimes(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00+02:00'));
  await page.goto('/');
  await currentStep(page).getByLabel('Tu nombre').fill('Ana');
  await currentStep(page).getByLabel('¿Qué hay que organizar?').fill('Cena de verano');
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  for (const day of DAYS) {
    await currentStep(page).getByRole('button', { name: day, exact: true }).click();
  }
  await currentStep(page).getByRole('switch', { name: 'Horario', exact: true }).click();
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(columns(page)).toHaveCount(DAYS.length);
}

const columns = (page: Page): Locator => currentStep(page).getByRole('group');

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

for (const finger of [false, true]) {
  test.describe(finger ? 'with a finger' : 'with a mouse', () => {
    test.use({ hasTouch: finger });

    test('the "−" of a saved time is whole on the last column on screen', async ({ page }) => {
      await openTimes(page);
      const last = columns(page).last();
      await save(page, last, 10);

      const remove = await showRemove(page, pill(last, '10:00'), finger);

      expect(await cut(remove)).toBeLessThanOrEqual(0.5);
    });

    test('the "−" of the last saved time in sight is whole in a list that scrolls', async ({
      page,
    }) => {
      await openTimes(page);
      const last = columns(page).last();
      for (const hour of [9, 10, 11, 12, 13]) await save(page, last, hour);
      await expect(last.locator('app-saved-pills button.fold')).toHaveCount(2);

      const remove = await showRemove(page, pill(last, '13:00'), finger);

      expect(await cut(remove)).toBeLessThanOrEqual(0.5);
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
