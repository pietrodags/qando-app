// The calendar of the dates step under a finger's slide sideways, as the browser draws it: a slide
// that begins while the days still glide after the one before takes them from where they are, with
// no jump. The wizard sends nothing before its last step, so nothing is stored.
import { expect, type Page, test } from '@playwright/test';
import { currentStep } from '../steps/step-card.js';

test.use({ hasTouch: true });

async function openDates(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00+02:00'));
  await page.goto('/');
  await currentStep(page).getByLabel('¿Qué organizamos?').fill('Cena de verano');
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(currentStep(page).getByRole('heading', { name: 'Junio 2026' })).toBeVisible();
}

/** How far the days are from their place, as the browser draws them now. */
function shown(page: Page): Promise<number> {
  return currentStep(page)
    .locator('.strip')
    .evaluate((strip) => Number.parseFloat(getComputedStyle(strip).translate) || 0);
}

test('a slide begun while the days glide takes them from where they are', async ({ page }) => {
  await openDates(page);
  // The step's card settles for a moment after the step opens: the days are measured once still.
  const days = currentStep(page).locator('.window');
  await expect
    .poll(async () => {
      const top = (await days.boundingBox())?.y;
      await page.waitForTimeout(100);
      return top === (await days.boundingBox())?.y;
    })
    .toBe(true);
  const box = await days.boundingBox();
  if (!box) throw new Error('The days are not on screen');
  const y = box.y + box.height / 2;
  const start = box.x + box.width * 0.75;
  // A real finger, sent through the DevTools protocol.
  const devtools = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number) =>
    devtools.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: x === undefined ? [] : [{ x, y, id: 1 }],
    });

  // A slide to the left, past a quarter of the calendar: July glides in from the right.
  await touch('touchStart', start);
  for (const step of [1, 2, 3, 4]) await touch('touchMove', start - step * box.width * 0.1);
  await touch('touchEnd');
  // The glide is held a third of the way, for the measure.
  const before = await currentStep(page)
    .locator('.strip')
    .evaluate(async (strip) => {
      while (strip.getAnimations().length === 0) {
        await new Promise((frame) => requestAnimationFrame(frame));
      }
      for (const glide of strip.getAnimations()) {
        glide.pause();
        glide.currentTime = 100;
      }
      return Number.parseFloat(getComputedStyle(strip).translate);
    });
  await expect(currentStep(page).getByRole('heading', { name: 'Julio 2026' })).toBeVisible();
  expect(before).toBeGreaterThan(0);

  // The browser holds back the moves of a finger's first few pixels.
  await touch('touchStart', start);
  await touch('touchMove', start - 20);
  await touch('touchMove', start - 40);

  await expect.poll(() => shown(page)).toBeCloseTo(before - 40, 0);
  await touch('touchEnd');
  await devtools.detach();
});
