// The widths of the results bars as the browser lays them out: each answer keeps its exact share
// of the 250 px bar while its count fits, and one whose count does not fit grows to fit it, the
// others giving it room; and at any width the page never scrolls sideways. The API is answered
// here, so the counts are exact and nothing is stored.
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { expectEveryStopShowsFocus } from './focus.js';

interface Counts {
  preferred: number;
  available: number;
  unavailable: number;
}

/** Results of one winning whole day with `counts`, shaped as the API answers them. */
function results(counts: Counts) {
  const voters = counts.preferred + counts.available + counts.unavailable;
  return {
    title: 'Cena de verano',
    timeZone: 'Europe/Madrid',
    final: false,
    outcome: 'one',
    voters,
    attending: counts.preferred + counts.available,
    notAttending: counts.unavailable,
    winnersListed: true,
    winners: [
      {
        option: { id: randomUUID(), dates: { kind: 'single', date: '2026-07-10' }, time: null },
        ...counts,
      },
    ],
    alternatives: [],
    confirmedOption: null,
  };
}

/** The rendered width of each answer's segment in the winner's bar, in pixels. */
async function segmentWidths(page: Page, counts: Counts): Promise<number[]> {
  await page.route('**/api/results/**', (route) => route.fulfill({ json: results(counts) }));
  await page.goto(`/results/${'r'.repeat(22)}`);
  const segments = page.locator('.bar .segment');
  await expect(segments).toHaveCount(3);
  return Promise.all(
    (await segments.all()).map(async (segment) => (await segment.boundingBox())?.width ?? 0),
  );
}

function expectWidths(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((width, index) => {
    expect(Math.abs(width - (expected[index] ?? 0)), `segment ${index}: ${width}px`).toBeLessThan(
      0.5,
    );
  });
}

test('each answer takes its exact share of the bar when its count fits', async ({ page }) => {
  expectWidths(
    await segmentWidths(page, { preferred: 2, available: 2, unavailable: 1 }),
    [100, 100, 50],
  );
});

test('an answer too narrow for its count grows to fit it, the bar keeping its width', async ({
  page,
}) => {
  // How wide a "1" is depends on the system font (14.8 px each on macOS, leaving 220.4 px), so
  // the check is the rule, not those numbers: the two counts of 1 grow alike past their exact
  // share (under 1 px), and the 258 takes what they leave of the 250 px bar.
  const [preferred = 0, available = 0, unavailable = 0] = await segmentWidths(page, {
    preferred: 1,
    available: 258,
    unavailable: 1,
  });
  expect(preferred).toBeGreaterThan(5);
  expect(Math.abs(preferred - unavailable)).toBeLessThan(0.5);
  expect(Math.abs(preferred + available + unavailable - 250)).toBeLessThan(0.5);
});

test('the results page never scrolls sideways, whatever the counts', async ({ page }) => {
  await segmentWidths(page, { preferred: 1, available: 258, unavailable: 1 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test('every stop of the results page shows that it has the focus', async ({ page }) => {
  const answered = results({ preferred: 1, available: 1, unavailable: 1 });
  const [winner] = answered.winners;
  await page.route('**/api/results/**', (route) =>
    route.fulfill({
      json: {
        ...answered,
        winners: [
          { ...winner, names: { preferred: ['Ana'], available: ['Luis'], unavailable: ['Eva'] } },
        ],
      },
    }),
  );
  await page.goto(`/results/${'r'.repeat(22)}`);
  const list = page.getByRole('button', { name: 'Lista de asistentes' }).first();
  await expect(list).toBeVisible();

  expect(await expectEveryStopShowsFocus(page)).toEqual(
    expect.arrayContaining(['Lista de asistentes']),
  );
  await list.click();
  await expectEveryStopShowsFocus(page);
});
