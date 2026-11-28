// The years and the options counter of the wizard's steps of columns, the times and the summary,
// as the browser draws them at each width. The year of the days on screen is beside them, level
// with their month: at the edge of the back arrow where the card leaves it room beside the
// columns, written upright in the card's margin where it does not (a phone's three columns take
// the step's whole width). A second year, when the days reach into it, is its mirror on the right.
// The counter is over the arrows; without a mouse in the middle of the row of the "+" button,
// which is always there, so nothing moves when it comes. The wizard sends nothing before its last
// step, so nothing is stored.
import { expect, type Page, test } from '@playwright/test';
import { day, monthArrow, press } from '../steps/dates-calendar.js';
import { currentStep, stepsSettled as settled } from '../steps/step-card.js';
import { WIDE, centre, drawn, expectFirstYear, expectSecondYear, middle } from './column-years.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * From the home page to the times step, with `days` days from `first` and "Horario" on, pressed
 * with a finger or the mouse, once its card has come in and the step before has folded away: a
 * time focused meanwhile, with the card still lower than it stays, would scroll the page.
 */
async function toTimes(page: Page, first: string, days: number, finger = false): Promise<void> {
  await page.clock.setFixedTime(new Date(`${first}T10:00:00Z`).getTime() - 5 * DAY_MS);
  await page.goto('/');
  await currentStep(page).getByLabel('¿Qué organizamos?').fill('Cena de verano');
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  for (let place = 0; place < days; place++) {
    const date = new Date(Date.parse(first) + place * DAY_MS).toISOString().slice(0, 10);
    // On to the next month once its first day is the one to mark.
    if (place > 0 && date.endsWith('-01')) await press(monthArrow(page, 'Mes siguiente'), finger);
    await press(day(page, date), finger);
  }
  await currentStep(page).getByRole('switch', { name: 'Horario', exact: true }).click();
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(currentStep(page).locator('app-wizard-times')).toBeVisible();
  await settled(page);
}

/** From the times step, with every column on one page, to the summary. */
async function toSummary(page: Page): Promise<void> {
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(currentStep(page).locator('app-wizard-summary')).toBeVisible();
}

for (const step of ['times', 'summary'] as const) {
  test.describe(`the ${step} step`, () => {
    test('shows the year of the days beside them, level with their month', async ({ page }) => {
      await toTimes(page, '2026-06-20', 3);
      if (step === 'summary') await toSummary(page);

      const seen = await drawn(page);

      expect(seen.years.map(({ text }) => text)).toEqual(['2026']);
      expectFirstYear(page, seen);
    });

    test('mirrors the year on the right when the days on screen reach into another', async ({
      page,
    }) => {
      await toTimes(page, '2026-12-30', 3);
      if (step === 'summary') await toSummary(page);

      const seen = await drawn(page);

      expect(seen.years.map(({ text }) => text)).toEqual(['2026', '2027']);
      expectFirstYear(page, seen);
      expectSecondYear(page, seen);
    });
  });
}

test('on a phone, a single day leaves the year room at the edge of the back arrow', async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) >= WIDE, 'Only a phone lacks the room.');
  await toTimes(page, '2026-06-20', 1);

  const { years, back, first, firstMonth } = await drawn(page);

  const [year] = years;
  expect(year?.box.width).toBeGreaterThan(year?.box.height ?? Infinity);
  expect(Math.abs((year?.box.left ?? 0) - back.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(middle(year?.box ?? first) - middle(firstMonth))).toBeLessThanOrEqual(2);
});

/**
 * Watches a tab growing back into the card, one frame at a time: how many frames showed a year,
 * and how far at most a year was cut at its sides by what hides what overflows it (the card grows
 * from its top, so what it holds is cut at the bottom meanwhile, and that is not measured).
 */
async function watchSideCuts(page: Page): Promise<() => Promise<{ frames: number; most: number }>> {
  const record = await page.evaluateHandle(() => {
    const seen = { frames: 0, most: 0, watching: true };
    const frame = (): void => {
      const card = document.querySelector('.step.card.returning');
      const years = [...(card?.querySelectorAll('.year') ?? [])].filter(
        (year) => year.textContent.trim() !== '',
      );
      if (years.length > 0) seen.frames++;
      for (const year of years) {
        const box = year.getBoundingClientRect();
        for (let around = year.parentElement; around; around = around.parentElement) {
          if (getComputedStyle(around).overflowX === 'visible') continue;
          const left = around.getBoundingClientRect().left + around.clientLeft;
          seen.most = Math.max(seen.most, left - box.left, box.right - (left + around.clientWidth));
        }
      }
      if (seen.watching) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return seen;
  });
  return async () => {
    await settled(page);
    return record.evaluate((seen) => {
      seen.watching = false;
      return { frames: seen.frames, most: seen.most };
    });
  };
}

test('on a phone, the upright year is whole while its step grows back into the card', async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) >= WIDE, 'Only a phone writes the year upright.');
  await toTimes(page, '2026-06-20', 3);
  await toSummary(page);
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(currentStep(page)).toHaveAccessibleName('último paso');
  await settled(page);
  const seen = await watchSideCuts(page);

  await page.getByRole('button', { name: 'paso 3', exact: true }).click();

  const { frames, most } = await seen();
  expect(frames).toBeGreaterThan(0);
  expect(most).toBeLessThanOrEqual(0);
});

for (const finger of [false, true]) {
  test.describe(finger ? 'with a finger' : 'with a mouse', () => {
    test.use({ hasTouch: finger });

    test('the options counter comes over the arrows, in the middle, and the columns stay', async ({
      page,
    }) => {
      // 48 days, two times on the first: 49 options, and its trash under it. A third time: 50.
      await toTimes(page, '2026-06-16', 48, finger);
      const column = currentStep(page).getByRole('group').first();
      const mark = async (hour: number): Promise<void> => {
        await column
          .locator('button.time', { hasText: new RegExp(`^\\s*${String(hour)}\\s*:`) })
          .focus();
        await page.keyboard.press('Enter');
      };
      await mark(9);
      await mark(10);
      const counter = currentStep(page).locator('app-option-counter .counter');
      await expect(counter).toHaveCount(0);
      const before = await drawn(page);

      await mark(11);

      await expect(counter).toHaveText('50 de 60 opciones');
      const after = await drawn(page);
      const pill = await counter.evaluate((element) => {
        const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
        return { left, top, right, bottom, width, height };
      });
      expect(after.first.top).toBeCloseTo(before.first.top, 0);
      expect(
        Math.abs(centre(pill) - (after.back.left + after.forward.right) / 2),
      ).toBeLessThanOrEqual(1);
      expect(pill.top).toBeGreaterThanOrEqual(after.columns.bottom);
      expect(pill.bottom).toBeLessThanOrEqual(after.forward.top);
      if (finger) {
        // In the row of the button that shows the "+", which was there before: nothing moves.
        const adder = currentStep(page).getByRole('button', {
          name: 'Guardar una hora',
          exact: true,
        });
        const row = await currentStep(page)
          .locator('app-save-offer')
          .evaluate((element) => {
            const { top, height } = element.getBoundingClientRect();
            return { top, height };
          });
        await expect(adder).toBeVisible();
        expect(Math.abs(middle(pill) - (row.top + row.height / 2))).toBeLessThanOrEqual(1);
        expect(after.forward.top).toBeCloseTo(before.forward.top, 0);
      }
    });
  });
}
