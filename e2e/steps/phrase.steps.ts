import { type Locator, type Page, expect } from '@playwright/test';
import { type DataTable, createBdd } from 'playwright-bdd';
import { datesOnScreen, day, dayNames, monthArrow, press, rangeName } from './create.steps.js';
import { test } from './fixtures.js';
import { currentStep } from './step-card.js';

const { Given, When, Then } = createBdd(test);

/** The switch of the dates step that opens the smart calendar's box over the calendar. */
const asker = (page: Page): Locator =>
  currentStep(page).getByRole('switch', { name: 'Generar fechas con IA', exact: true });

/** The text box of the smart calendar's box. */
const phraseField = (page: Page): Locator =>
  currentStep(page).getByRole('textbox', { name: 'Escribe las fechas con tus palabras' });

/** What the open box tells about the phrase it keeps, each of its lines. */
const toldInBox = (page: Page): Locator =>
  currentStep(page).locator('app-phrase-box app-notice-box p');

/**
 * The days marked on the month the calendar is on, whether the calendar is in sight or under the
 * open box, where no role finds them.
 */
const markedDays = (page: Page): Locator =>
  currentStep(page).locator('.calendar button[aria-pressed="true"]');

/** The dates a step names between quotes, one after another. */
const quoted = (dates: string): string[] =>
  [...dates.matchAll(/"([^"]+)"/g)].map(([, date = '']) => date);

Given('the text editor returns the phrase unchanged', () => {
  // Nothing to set up: the API of the run has no text editor (playwright.config.ts gives it no
  // key for one), so it reads every phrase as it was written.
});

When('I ask for {string}', async ({ page, hasTouch, asked }, phrase: string) => {
  if (!(await asker(page).isChecked())) await press(asker(page), hasTouch);
  await phraseField(page).fill(phrase);
  asked.phrase = phrase;
  const generate = currentStep(page).getByRole('button', { name: 'Generar fechas', exact: true });
  // With nothing to read the button says it is disabled, and takes the press all the same.
  if (phrase.trim() === '') await generate.click({ force: true });
  else await press(generate, hasTouch);
});

Given(
  /^I have chosen (".+") on the calendar$/,
  async ({ page, hasTouch, clock }, dates: string) => {
    // The calendar opens on today's month and stays on the month of the day pressed last.
    let shown = monthsSince0(clock.now ?? new Date());
    for (const date of quoted(dates)) {
      const month = monthsSince0(new Date(date));
      for (; shown < month; shown += 1) await monthArrow(page, 'Mes siguiente').click();
      await press(day(page, date), hasTouch);
    }
  },
);

/** A date's month, counted so that the months of two dates can be told apart. */
const monthsSince0 = (date: Date): number => date.getUTCFullYear() * 12 + date.getUTCMonth();

Then(/^the calendar has (".+") selected$/, async ({ page }, dates: string) => {
  const names = quoted(dates).map((date) => dayNames.format(Date.parse(date)));
  await expect.poll(() => datesOnScreen(page)).toEqual(names);
});

Then('the calendar has the range {string} as one option', async ({ page }, range: string) => {
  const [start = '', end = ''] = range.split('..');
  // Each of its days is named with the range it is in: days of their own would be an option each.
  await expect.poll(() => datesOnScreen(page)).toEqual([rangeName(start, end)]);
});

Then('the smart calendar is closed', async ({ page }) => {
  await expect(asker(page)).not.toBeChecked();
  await expect(phraseField(page)).toHaveCount(0);
});

Then(
  'the smart calendar stays open with a notice that the text was not understood',
  async ({ page }) => {
    await expect(toldInBox(page)).toHaveText([
      'No hemos entendido bien tu petición. Prueba a ser más específico.',
    ]);
    await expect(asker(page)).toBeChecked();
  },
);

Then('the smart calendar stays open with the notice {string}', async ({ page }, notice: string) => {
  await expect(toldInBox(page)).toHaveText([notice]);
  await expect(asker(page)).toBeChecked();
});

Then('{string} is still selected', async ({ page }, date: string) => {
  await expect(markedDays(page)).toHaveAttribute('aria-label', dayNames.format(Date.parse(date)));
});

Then('no date is selected yet', async ({ page }) => {
  await expect(markedDays(page)).toHaveCount(0);
});

Then('I see the notices:', async ({ page }, table: DataTable) => {
  const notices = table.raw().map(([notice = '']) => notice);
  // Above the calendar, each line with the days it speaks of first.
  await expect(currentStep(page).locator('.told app-notice-box p')).toHaveText(notices);
});

Given("my browser's language is {string}", async ({ page }, language: string) => {
  await page.evaluate((spoken) => {
    Object.defineProperty(navigator, 'language', { get: () => spoken });
  }, language);
});

Then('no request reaches the interpreter', async ({ page, asked }) => {
  // A request leaves with the press: it would be known by the time the page answers again.
  await page.evaluate(() => document.readyState);
  expect(asked.readings).toEqual([]);
});

Given('the qando API cannot be reached', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort('connectionrefused'));
});

Then('the text I typed is still there', async ({ page, asked }) => {
  await expect(phraseField(page)).toHaveValue(asked.phrase);
});

Then('I can choose dates on the calendar by hand', async ({ page, hasTouch }) => {
  await press(asker(page), hasTouch);
  const days = currentStep(page).locator('.calendar button[data-date]:enabled');
  const date = await days
    .and(page.locator('[aria-pressed="false"]'))
    .first()
    .getAttribute('data-date');
  const free = days.and(page.locator(`[data-date="${date ?? ''}"]`));
  await press(free, hasTouch);
  await expect(free).toHaveAttribute('aria-pressed', 'true');
});

/** Where the page's fonts come from: the only addresses requested besides the web's own. */
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

Then('the browser never called an AI provider', async ({ page, asked, baseURL }) => {
  // The phrase was read, and through the web's own address.
  await expect.poll(() => asked.readings.length).toBe(1);
  await asked.readings[0]?.response();
  const own = new URL(baseURL ?? page.url()).host;
  const others = asked.requests
    .map((request) => new URL(request.url()))
    .filter(({ protocol }) => protocol.startsWith('http'))
    .map(({ host }) => host)
    .filter((host) => host !== own && !FONT_HOSTS.includes(host));
  expect([...new Set(others)]).toEqual([]);
});

/**
 * How the key of an AI provider would show in what the browser receives: a Google API key, the
 * name the API keeps its own under, or the header a key travels in.
 */
const AI_CREDENTIALS = /AIza[\w-]{35}|GEMINI_API_KEY|x-goog-api-key/i;

Then('the page and its scripts contain no AI credentials', async ({ asked }) => {
  const received = asked.requests.filter((request) =>
    ['document', 'script'].includes(request.resourceType()),
  );
  expect(received.length).toBeGreaterThan(1);
  for (const request of received) {
    const response = await request.response();
    const text = (await response?.text()) ?? '';
    expect(AI_CREDENTIALS.test(text), request.url()).toBe(false);
  }
});
