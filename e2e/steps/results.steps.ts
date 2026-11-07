import { expect, type Locator, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from './fixtures.js';

const { When, Then } = createBdd(test);

When('I open the results link', async ({ page, events }) => {
  await page.goto(`/results/${events.latest.resultsId}`);
});

When('I open its results link', async ({ page, events }) => {
  await page.goto(`/results/${events.latest.resultsId}`);
});

When('I open a results link that does not exist', async ({ page }) => {
  // The shape of a results ID, which no stored event has.
  await page.goto(`/results/${'x'.repeat(22)}`);
});

/** The winning dates listed under the sentence, by their long labels ("viernes 10 de julio"). */
function winningDates(page: Page): Locator {
  return page.locator('.winning-dates > li');
}

/** The counter of `label` ("Votantes", "Asisten", "No asisten"). */
function counter(page: Page, label: string): Locator {
  return page.locator('.counter').filter({ hasText: new RegExp(`^\\s*\\d+\\s*${label}\\s*$`) });
}

/** "Vie 10 Jul", the chart's label of a date the page names "viernes 10 de julio". */
function chartLabel(longLabel: string): string {
  const match = /^(\S+) (\d+) de (\S+)$/.exec(longLabel);
  if (!match) throw new Error(`"${longLabel}" is not a date like "viernes 10 de julio"`);
  const [, weekday = '', day = '', month = ''] = match;
  const short = (name: string) => name.charAt(0).toUpperCase() + name.slice(1, 3);
  return `${short(weekday)} ${day} ${short(month)}`;
}

/** How many can attend an option of the chart: its preferred and available counts. */
async function attendingIn(option: Locator): Promise<number> {
  const counts = await option.locator('.segment.preferred, .segment.available').allInnerTexts();
  return counts.reduce((sum, text) => sum + Number.parseInt(text, 10), 0);
}

Then(
  'the winner is {string} with {int} attending and {int} not attending',
  async ({ page }, date: string, attending: number, notAttending: number) => {
    await expect(page.getByText('La fecha elegida es:', { exact: true })).toBeVisible();
    await expect(winningDates(page)).toHaveText([date]);
    await expect(counter(page, 'Asisten')).toHaveText(`${attending} Asisten`);
    await expect(counter(page, 'No asisten')).toHaveText(`${notAttending} No asisten`);
  },
);

Then('the winner is {string}', async ({ page }, date: string) => {
  await expect(winningDates(page)).toHaveText([date]);
});

Then('no alternatives are shown', async ({ page }) => {
  // The chart is on screen, so an alternative still loading is not taken for none.
  await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible();
  await expect(page.getByText(/Fechas? alternativas?:/)).toHaveCount(0);
});

Then(
  'the alternatives show {string} with {int} attending',
  async ({ page }, date: string, attending: number) => {
    const alternatives = page.locator('.alternatives-title ~ .option');
    const option = alternatives.filter({
      has: page.getByRole('heading', { name: chartLabel(date), exact: true }),
    });
    await expect(option).toHaveCount(1);
    expect(await attendingIn(option)).toBe(attending);
  },
);

/** Opens the winner's attendee list and reads it: each group's names, in the order shown. */
async function winnerList(
  page: Page,
): Promise<Record<'preferred' | 'available' | 'unavailable', string[]>> {
  const toggle = page.locator('.winner-names').getByRole('button', { name: 'Lista de asistentes' });
  await toggle.click();
  const list = page.locator(`#${await toggle.getAttribute('aria-controls')}`);
  await expect(list).toBeVisible();
  // A name's text ends where the screen reader's ", Preferida" begins.
  const names = async (group: string) =>
    (await list.locator(`li.${group}`).allInnerTexts()).map(
      (text) => text.split(',')[0]?.trim() ?? '',
    );
  return {
    preferred: await names('preferred'),
    available: await names('available'),
    unavailable: await names('unavailable'),
  };
}

Then(
  'the names are listed alphabetically: {string}, {string}, {string}',
  async ({ page }, first: string, second: string, third: string) => {
    const expected = [first, second, third];
    // The list groups who preferred, could and could not come; each group in that order.
    const groups = await winnerList(page);
    expect(Object.values(groups).flat().toSorted()).toEqual(expected.toSorted());
    for (const names of Object.values(groups)) {
      expect(names).toEqual(expected.filter((name) => names.includes(name)));
    }
  },
);

Then(
  'I see {string} with {string} and {string}',
  async ({ page }, sentence: string, first: string, second: string) => {
    await expect(page.getByText(sentence, { exact: true })).toBeVisible();
    await expect(winningDates(page)).toHaveText([first, second]);
  },
);

Then('there is no winner and a message says nobody can attend any option', async ({ page }) => {
  await expect(
    page.getByText('Nadie puede asistir en ninguna de las fechas propuestas.', { exact: true }),
  ).toBeVisible();
  await expect(winningDates(page)).toHaveCount(0);
  await expect(page.getByText('La fecha elegida es:')).toHaveCount(0);
});

Then('the results are marked {string}', async ({ page }, mark: string) => {
  await expect(page.getByText(/Este es el cómputo \S+ de la votación:/)).toHaveText(
    `Este es el cómputo ${mark} de la votación:`,
  );
});

Then('I see the counts and no names', async ({ page, events }) => {
  await expect(counter(page, 'Votantes')).toHaveText(`${events.latest.votes.length} Votantes`);
  await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lista de asistentes' })).toHaveCount(0);
});

Then('the API answer for its results has no names', async ({ request, events, address }) => {
  const answer = await request.get(`/api/results/${events.latest.resultsId}`, {
    headers: { 'x-forwarded-for': address },
  });
  expect(answer.status()).toBe(200);
  const { winners, alternatives } = (await answer.json()) as {
    winners: object[];
    alternatives: object[];
  };
  expect(winners.length).toBeGreaterThan(0);
  for (const option of [...winners, ...alternatives]) expect(option).not.toHaveProperty('names');
});

Then('I see {string} apart from the recommended option', async ({ page }, text: string) => {
  // Its own line, apart from the sentence of the outcome and never one of the winning dates.
  await expect(page.locator('.confirmed')).toHaveText(text);
  await expect(page.locator('.sentence')).toBeVisible();
  await expect(page.locator('.sentence')).not.toContainText('Fecha confirmada');
  await expect(winningDates(page).filter({ hasText: text })).toHaveCount(0);
});

When(
  'the API is asked for the results with the participation link',
  async ({ request, events, address, apiAnswer }) => {
    const answer = await request.get(`/api/results/${events.latest.publicId}`, {
      headers: { 'x-forwarded-for': address },
    });
    apiAnswer.status = answer.status();
  },
);

Then('it answers {int}', ({ apiAnswer }, status: number) => {
  expect(apiAnswer.status).toBe(status);
});
