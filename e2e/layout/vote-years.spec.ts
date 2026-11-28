// The voting page's times step as the browser draws its years at each width: the year of the days
// on screen beside them, level with their month, as the wizard's steps of columns draw it, and a
// second one mirrored on the right when the days reach into it; the event's clock, when the
// browser keeps another one, on a line of its own over the columns, in their middle. The API is
// answered here, so nothing is stored.
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { currentStep, stepsSettled } from '../steps/step-card.js';
import { centre, drawn, expectFirstYear, expectSecondYear, middle } from './column-years.js';

const participationId = 'p'.repeat(22);

/** An open event with a time, 19:00, on each of `dates`, on the clock of `timeZone`. */
function eventOn(dates: readonly string[], timeZone = 'Europe/Madrid'): object {
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
async function toTimes(page: Page, event: object): Promise<void> {
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

test.use({ timezoneId: 'Europe/Madrid' });

test('shows the year of the days beside them, level with their month', async ({ page }) => {
  await toTimes(page, eventOn(['2026-12-05', '2026-12-06', '2026-12-12']));

  const seen = await drawn(page);

  expect(seen.years.map(({ text }) => text)).toEqual(['2026']);
  expectFirstYear(page, seen);
});

test('mirrors the year on the right when the days on screen reach into another', async ({
  page,
}) => {
  await toTimes(page, eventOn(['2026-12-30', '2026-12-31', '2027-01-01']));

  const seen = await drawn(page);

  expect(seen.years.map(({ text }) => text)).toEqual(['2026', '2027']);
  expectFirstYear(page, seen);
  expectSecondYear(page, seen);
});

test('names the event’s clock on a line of its own over the columns, in their middle', async ({
  page,
}) => {
  await toTimes(page, eventOn(['2026-12-05', '2026-12-06', '2026-12-12'], 'America/New_York'));

  const seen = await drawn(page);
  const zone = currentStep(page).locator('.zone');

  await expect(zone).toHaveText('Hora de New York');
  const line = await zone.evaluate((element) => {
    const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
    return { left, top, right, bottom, width, height };
  });
  expect(Math.abs(centre(line) - centre(seen.columns))).toBeLessThanOrEqual(1);
  expect(line.bottom).toBeLessThanOrEqual(seen.first.top);
  expectFirstYear(page, seen);
});

// On a phone three columns take the card's width, and the year stands upright in the card's margin
// beside them; where the margin would leave it less than 4 px inside the card (below 373 px), two
// columns of their usual width. Whether lying or upright, the year stays inside the card, 8 px from
// the first day, level with its month.
for (const [width, columns] of [
  [320, 2],
  [328, 2],
  [360, 2],
  [372, 2],
  [373, 3],
  [375, 3],
] as const) {
  test.describe(`at ${String(width)} px wide`, () => {
    test.use({ viewport: { width, height: 800 } });

    test(`shows ${String(columns)} columns of days, their year inside the card beside them`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'layout phone', 'once, with the phone');
      await toTimes(
        page,
        eventOn(['2026-12-05', '2026-12-06', '2026-12-12', '2026-12-13', '2026-12-19']),
      );

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
    });
  });
}
