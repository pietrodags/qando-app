import { type Locator, type Page, expect } from '@playwright/test';
import { type DataTable, createBdd } from 'playwright-bdd';
import { datesOnScreen, day, dayNames, monthArrow, press, rangeName } from './dates-calendar.js';
import { expectAccessible } from '../accessibility.js';
import { test } from './fixtures.js';
import { currentStep } from './step-card.js';

const { Given, When, Then } = createBdd(test);

/** The sparkles of the dates step, the button that opens the smart calendar's box over it. */
const asker = (page: Page): Locator =>
  currentStep(page).getByRole('button', { name: 'Generar fechas con IA', exact: true });

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
  if ((await asker(page).getAttribute('aria-pressed')) !== 'true')
    await press(asker(page), hasTouch);
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

When('I choose {string}', async ({ page, hasTouch }, name: string) => {
  // Not in the step's card: what a message offers to do is at the bottom of the screen.
  await press(page.getByRole('button', { name, exact: true }), hasTouch);
});

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
  await expect(asker(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(phraseField(page)).toHaveCount(0);
});

Then(
  'the smart calendar stays open with a notice that the text was not understood',
  async ({ page }) => {
    await expect(toldInBox(page)).toHaveText([
      'No hemos entendido bien tu petición. Prueba a ser más específico.',
    ]);
    await expect(asker(page)).toHaveAttribute('aria-pressed', 'true');
  },
);

Then('the smart calendar stays open with the notice {string}', async ({ page }, notice: string) => {
  await expect(toldInBox(page)).toHaveText([notice]);
  await expect(asker(page)).toHaveAttribute('aria-pressed', 'true');
});

Then('{string} is still selected', async ({ page }, date: string) => {
  await expect(markedDays(page)).toHaveAttribute('aria-label', dayNames.format(Date.parse(date)));
});

Then('no date is selected yet', async ({ page }) => {
  await expect(markedDays(page)).toHaveCount(0);
});

Then('I see the question {string}', async ({ page }, question: string) => {
  const asked = currentStep(page).locator('app-time-questions');
  await expect(asked.getByText(question, { exact: true })).toBeVisible();
  // Its two answers are named after it.
  await expect(asked.getByRole('group', { name: question, exact: true })).toBeVisible();
});

When('I answer {string}', async ({ page, hasTouch }, answer: string) => {
  // By what it shows: screen readers hear a time range in words in its place.
  await press(
    currentStep(page).locator('app-time-questions button', { hasText: answer }),
    hasTouch,
  );
});

Then('I see the notices:', async ({ page }, table: DataTable) => {
  const notices = table.raw().map(([notice = '']) => notice);
  // Above the calendar, each line with the days it speaks of first.
  await expect(currentStep(page).locator('.told app-notice-box p')).toHaveText(notices);
});

/** The button of the open box that dictates, under either of its names. */
const microphone = (page: Page, name: 'Dictar con micrófono' | 'Detener dictado'): Locator =>
  currentStep(page).getByRole('button', { name, exact: true });

/**
 * Gives the page a speech recognizer in place of the browser's, which answers nothing in a test
 * run: asked to listen, it says at once that it does, or that the microphone is refused. What it
 * hears is said to it through `window.say`, word by word, and then it ends.
 */
async function recognizerFor(page: Page, refused: boolean): Promise<void> {
  await page.evaluate((refuses) => {
    class Recognizer extends EventTarget {
      lang = '';
      interimResults = false;
      continuous = true;

      start(): void {
        const tell = (kind: string, more: object = {}): void => {
          this.dispatchEvent(Object.assign(new Event(kind), more));
        };
        Reflect.set(window, 'say', (phrase: string) => {
          const words = phrase.split(' ');
          for (let said = 1; said <= words.length; said += 1) {
            tell('result', { results: [[{ transcript: words.slice(0, said).join(' ') }]] });
          }
          tell('end');
        });
        setTimeout(() => {
          if (refuses) tell('error', { error: 'not-allowed' });
          else tell('start');
        });
      }

      abort(): void {
        Reflect.deleteProperty(window, 'say');
      }
    }
    Reflect.set(window, 'SpeechRecognition', Recognizer);
  }, refused);
}

Given('my browser offers dictation', async ({ page }) => {
  await recognizerFor(page, false);
});

Given('my browser refuses the microphone', async ({ page }) => {
  await recognizerFor(page, true);
});

Given('my browser offers no dictation', async ({ page }) => {
  await page.evaluate(() => {
    Reflect.deleteProperty(window, 'SpeechRecognition');
    Reflect.deleteProperty(window, 'webkitSpeechRecognition');
  });
});

When('I open the smart calendar', async ({ page, hasTouch }) => {
  await press(asker(page), hasTouch);
  await expect(phraseField(page)).toBeFocused();
});

When('I close the smart calendar with its cross', async ({ page, hasTouch }) => {
  await press(
    currentStep(page).getByRole('button', {
      name: 'Cerrar el calendario inteligente',
      exact: true,
    }),
    hasTouch,
  );
});

Then("the smart calendar's button has the focus", async ({ page }) => {
  await expect(asker(page)).toBeFocused();
});

Given('I have written {string} in the smart calendar', async ({ page, hasTouch }, text: string) => {
  await press(asker(page), hasTouch);
  await phraseField(page).fill(text);
});

When('I press the microphone', async ({ page, hasTouch }) => {
  if ((await asker(page).getAttribute('aria-pressed')) !== 'true')
    await press(asker(page), hasTouch);
  await press(microphone(page, 'Dictar con micrófono'), hasTouch);
});

When('I press the microphone and say {string}', async ({ page, hasTouch }, phrase: string) => {
  await press(microphone(page, 'Dictar con micrófono'), hasTouch);
  // While it listens the button is the one that stops.
  await expect(microphone(page, 'Detener dictado')).toBeVisible();
  await expectAccessible(page);
  await page.evaluate((said) => {
    (Reflect.get(window, 'say') as (phrase: string) => void)(said);
  }, phrase);
});

Then("the smart calendar's text is {string}", async ({ page }, text: string) => {
  await expect(phraseField(page)).toHaveValue(text);
});

Then('the microphone is at rest', async ({ page }) => {
  await expect(microphone(page, 'Dictar con micrófono')).toBeVisible();
  await expect(microphone(page, 'Detener dictado')).toHaveCount(0);
});

Then('the smart calendar has no microphone', async ({ page }) => {
  await expect(phraseField(page)).toBeVisible();
  await expect(currentStep(page).locator('app-phrase-box .grow button')).toHaveCount(0);
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
