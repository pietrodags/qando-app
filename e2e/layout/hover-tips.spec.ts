// The tips that say under the mouse what a button does, as the browser draws them: the mouse can
// cross the gap of the tip's stem onto the tip and rest there to read it (as someone reading
// through a screen magnifier does), the tip goes once the mouse is over neither, and Escape takes
// it away. The mouse crosses off the stem, which is as thin as a line. The API is answered here,
// so this runs against any URL.
import { expect, type Locator, type Page, test } from '@playwright/test';
import { currentStep } from '../steps/step-card.js';

const ONCE = 'once, with the laptop and its mouse';

/** Where an element is drawn; it must be on screen. */
async function boxOf(
  element: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await element.boundingBox();
  if (!box) throw new Error('The element is not on screen');
  return box;
}

/**
 * The mouse goes from the anchor, near its left edge (off the stem, which is as thin as a line),
 * straight towards the tip, above it or below it, in steps of about 2 px; it rests in the gap
 * between the two, longer than the tip waits for a mouse that has left (as a slow hand does), and
 * goes on onto the tip.
 */
async function crossOnto(page: Page, anchor: Locator, tip: Locator, words: string): Promise<void> {
  const from = await boxOf(anchor);
  const to = await boxOf(tip);
  const x = from.x + 4;
  const above = to.y < from.y;
  const gap = above ? (to.y + to.height + from.y) / 2 : (from.y + from.height + to.y) / 2;
  const end = above ? to.y + to.height - 4 : to.y + 4;
  await page.mouse.move(x, from.y + from.height / 2);
  await page.mouse.move(x, gap, { steps: Math.ceil(Math.abs(gap - from.y) / 2) });
  await page.waitForTimeout(400);
  await expect(tip).toHaveText(words);
  await page.mouse.move(x, end, { steps: 4 });
  await page.waitForTimeout(400);
  await expect(tip).toHaveText(words);
}

async function checkTip(page: Page, anchor: Locator, tip: Locator, words: string): Promise<void> {
  await anchor.hover();
  await expect(tip).toHaveText(words);

  await crossOnto(page, anchor, tip, words);

  await page.mouse.move(5, 5);
  await expect(tip).toBeHidden();

  await anchor.hover();
  await expect(tip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
}

test('the sparkles’ tip, above them, can be read with the mouse on it and goes with Escape', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'layout desktop', ONCE);
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00+02:00'));
  await page.goto('/');
  await currentStep(page).getByLabel('¿Qué organizamos?').fill('Cena de verano');
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  const step = currentStep(page);
  await expect(step.getByRole('heading', { name: 'Junio 2026' })).toBeVisible();

  await checkTip(
    page,
    step.getByRole('button', { name: 'Generar fechas con IA', exact: true }),
    step.locator('.top app-tooltip'),
    'Generar fechas con IA',
  );
});

test('the trash’s tip, under it, can be read with the mouse on it and goes with Escape', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'layout desktop', ONCE);
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { name: 'Ana', email: 'ana@example.com' } }),
  );
  await page.goto('/');
  await page.locator('app-account-menu button.account').click();
  await page.getByText('ana@example.com').hover();

  await checkTip(
    page,
    page.getByRole('button', { name: 'Eliminar mi cuenta' }),
    page.locator('app-account-menu app-tooltip'),
    'Eliminar mi cuenta',
  );
});
