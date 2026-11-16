import { type APIResponse, type Locator, type Page, expect } from '@playwright/test';
import { type DataTable, createBdd } from 'playwright-bdd';
import { test } from './fixtures.js';
import { currentStep } from './step-card.js';

const { Given, When, Then } = createBdd(test);

// The answer of the health check, kept for the step that reads it.
let health: APIResponse | undefined;

When('I ask the web how the service is', async ({ page }) => {
  // Through the web's own address: the web forwards /api to the API, as the pages' requests do.
  health = await page.request.get('/api/health');
});

Then('it answers that the API and the database are up', async () => {
  expect(health?.status()).toBe(200);
  expect(await health?.json()).toEqual({ status: 'ok', database: 'up' });
});

When('I open the creation wizard', async ({ page }) => {
  await page.goto('/');
});

Given('I have opened the creation wizard', async ({ page }) => {
  await page.goto('/');
  await expect(currentStep(page)).toHaveAccessibleName('paso 1');
});

async function onStep(page: Page, step: number): Promise<void> {
  await expect(currentStep(page)).toHaveAccessibleName(`paso ${step}`);
}

Then('I am on step {int}', async ({ page }, step: number) => onStep(page, step));
Then('I am still on step {int}', async ({ page }, step: number) => onStep(page, step));

/** The round arrow of the step on screen, named "Siguiente" for screen readers. */
function next(page: Page): Locator {
  return currentStep(page).getByRole('button', { name: 'Siguiente', exact: true });
}

Then('"Siguiente" is disabled', async ({ page }) => {
  await expect(next(page)).toBeDisabled();
});

Then('"Siguiente" is enabled', async ({ page }) => {
  await expect(next(page)).toBeEnabled();
});

// On screen, the labels say what to write; what is missing is only told to screen readers.
Then('screen readers hear with "Siguiente": {string}', async ({ page }, missing: string) => {
  await expect(next(page)).toHaveAccessibleDescription(missing);
});

const nameField = (page: Page): Locator => currentStep(page).getByLabel('Tu nombre');
const titleField = (page: Page): Locator => currentStep(page).getByLabel('¿Qué hay que organizar?');

/** Which fields show the green check, which screen readers hear as "Correcto". */
async function markedValid(page: Page, name: boolean, title: boolean): Promise<void> {
  for (const [field, valid] of [
    [nameField(page), name],
    [titleField(page), title],
  ] as const) {
    await expect(field).toHaveAccessibleDescription(valid ? 'Correcto' : '');
    await expect(field.locator('xpath=..').locator('.check')).toHaveCount(valid ? 1 : 0);
  }
}

Then('no field is marked as valid', async ({ page }) => markedValid(page, false, false));
Then('only the name field is marked as valid', async ({ page }) => markedValid(page, true, false));
Then('both fields are marked as valid', async ({ page }) => markedValid(page, true, true));

When('I type my name {string}', async ({ page }, name: string) => nameField(page).fill(name));
When('I type the title {string}', async ({ page }, title: string) => titleField(page).fill(title));

When('I type my name {string} and press Enter', async ({ page }, name: string) => {
  await nameField(page).fill(name);
  await nameField(page).press('Enter');
});

When('I type the title {string} and press Enter', async ({ page }, title: string) => {
  await titleField(page).fill(title);
  await titleField(page).press('Enter');
});

Given('I am on the dates step of the creation wizard', async ({ page }) => {
  await page.goto('/');
  await nameField(page).fill('Ana');
  await titleField(page).fill('Cena de verano');
  await next(page).click();
  await onStep(page, 2);
});

const dayNames = new Intl.DateTimeFormat('es', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

const datesOfRange = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** As a day of a range ends its name: "rango del 18 de junio al 20 de junio". */
function rangeName(start: string, end: string): string {
  return `rango del ${datesOfRange.format(Date.parse(start))} al ${datesOfRange.format(Date.parse(end))}`;
}

/**
 * A day of the month on screen, named in full for screen readers ("sábado, 20 de junio"); a day
 * of a range adds its range ("sábado, 20 de junio, rango del 18 de junio al 20 de junio").
 */
function day(page: Page, date: string): Locator {
  return currentStep(page).getByRole('button', {
    name: new RegExp(`^${dayNames.format(Date.parse(date))}(, rango del .+)?$`),
  });
}

/** The month on screen: its days and the "+" of its ranges. A pill under it is not part of it. */
const calendar = (page: Page): Locator => currentStep(page).getByRole('group');

Then('the calendar shows {string}', async ({ page }, month: string) => {
  await expect(currentStep(page).getByRole('heading', { name: month, exact: true })).toBeVisible();
});

When('I press the day {string}', async ({ page }, date: string) => day(page, date).click());

Then('the marked days are:', async ({ page }, table: DataTable) => {
  const marked = table.hashes().map(({ day: date }) => dayNames.format(Date.parse(date ?? '')));
  const pressed = calendar(page).getByRole('button', { pressed: true });
  await expect
    .poll(() => pressed.evaluateAll((days) => days.map((each) => each.getAttribute('aria-label'))))
    .toEqual(marked);
});

When(
  'I drag from the day {string} to the day {string}',
  async ({ page }, from: string, to: string) => {
    const target = await day(page, to).boundingBox();
    if (!target) throw new Error(`The day ${to} is not on screen`);
    await day(page, from).hover();
    await page.mouse.down();
    // In steps, as a hand moves: the calendar follows the mouse from day to day.
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
    await page.mouse.up();
  },
);

/** The dates marked on the month on screen, as their days are named: singles and ranges. */
async function datesOnScreen(page: Page): Promise<string[]> {
  const names = await calendar(page)
    .locator('button[aria-pressed="true"]')
    .evaluateAll((days) => days.map((each) => each.getAttribute('aria-label') ?? ''));
  // Every day of a range ends with the same words: once per range.
  return [...new Set(names.map((name) => /rango del .+$/.exec(name)?.[0] ?? name))];
}

Then('the dates on the calendar are:', async ({ page }, table: DataTable) => {
  const expected = table.hashes().map(({ dates }) => {
    const [start = '', end] = (dates ?? '').split('..');
    return end ? rangeName(start, end) : dayNames.format(Date.parse(start));
  });
  await expect.poll(() => datesOnScreen(page)).toEqual(expected);
});

Then('no date is marked on the calendar', async ({ page }) => {
  await expect.poll(() => datesOnScreen(page)).toEqual([]);
});

/** Where the calendar says what it waits for, between the step's two arrows. */
const hint = (page: Page): Locator => currentStep(page).getByRole('status');

Then('screen readers hear under the calendar: {string}', async ({ page }, text: string) => {
  await expect(hint(page)).toHaveText(text);
});

Then('screen readers hear nothing under the calendar', async ({ page }) => {
  await expect(hint(page)).toBeEmpty();
});

Then('the day {string} can be chosen', async ({ page }, date: string) => {
  await expect(day(page, date)).toBeEnabled();
});

Then('the day {string} cannot be chosen', async ({ page }, date: string) => {
  await expect(day(page, date)).toBeDisabled();
});

const monthArrow = (page: Page, name: 'Mes anterior' | 'Mes siguiente'): Locator =>
  currentStep(page).getByRole('button', { name, exact: true });

Then('the calendar cannot go to the previous month', async ({ page }) => {
  await expect(monthArrow(page, 'Mes anterior')).toBeDisabled();
});

Then('the calendar cannot go to the next month', async ({ page }) => {
  await expect(monthArrow(page, 'Mes siguiente')).toBeDisabled();
});

When('I go {int} month(s) forward', async ({ page }, months: number) => {
  for (let month = 0; month < months; month += 1) await monthArrow(page, 'Mes siguiente').click();
});

When('I go back to step 1 and on to the dates again', async ({ page }) => {
  await currentStep(page).getByRole('button', { name: 'Volver al paso 1', exact: true }).click();
  await onStep(page, 1);
  await next(page).click();
  await onStep(page, 2);
});

When('I reach the days of the calendar with the Tab key', async ({ page }) => {
  // Only the days say whether they are pressed (the role's `pressed: false` also matches a
  // button that does not say). Before them, the card itself and the two month arrows.
  const focusedDay = calendar(page).locator('button[aria-pressed]:focus');
  await expect(async () => {
    await page.keyboard.press('Tab');
    await expect(focusedDay).toHaveCount(1, { timeout: 100 });
  }).toPass();
});

Then('the focus is on the day {string}', async ({ page }, date: string) => {
  await expect(day(page, date)).toBeFocused();
});

When('I press the key {string} {int} time(s)', async ({ page }, key: string, times: number) => {
  for (let press = 0; press < times; press += 1) await page.keyboard.press(key);
});

When('I move the mouse over the day {string}', async ({ page }, date: string) => {
  await day(page, date).hover();
});

/** The "+" that saves a range: there only while the mouse or the keyboard is on its range. */
const savePlus = (page: Page): Locator =>
  calendar(page).getByRole('button', { name: /^Guardar el rango del / });

Then('no "+" is shown on the calendar', async ({ page }) => {
  await expect(savePlus(page)).toHaveCount(0);
});

When('I save the range with its "+"', async ({ page }) => savePlus(page).click());

/** The saved ranges under the calendar, each a pill that reads as "Lun 22 ➔ Vie 26". */
const pills = (page: Page): Locator => currentStep(page).getByRole('listitem');

/** A pill as screen readers name it: "Lun 22 ➔ Vie 26" on screen is heard "Lun 22 a Vie 26". */
const heard = (range: string): string => range.replace('➔', 'a');

/** What a pill shows: pressed, it shows its range on the calendar. */
const pillView = (page: Page, range: string): Locator =>
  pills(page).getByRole('button', { name: heard(range), exact: true });

Then('the saved ranges are:', async ({ page }, table: DataTable) => {
  const expected = table.hashes().map(({ range }) => range ?? '');
  const views = pills(page).locator('button[aria-pressed]');
  await expect(views).toHaveCount(expected.length);
  for (const [place, range] of expected.entries()) {
    await expect(views.nth(place)).toHaveAccessibleName(heard(range));
  }
});

Then('there are no saved ranges', async ({ page }) => {
  await expect(pills(page)).toHaveCount(0);
});

When('I press the saved range {string}', async ({ page }, range: string) => {
  await pillView(page, range).click();
});

Then('the saved range {string} is shown on the calendar', async ({ page }, range: string) => {
  await expect(pillView(page, range)).toHaveAttribute('aria-pressed', 'true');
});

Then('the saved range {string} is not shown on the calendar', async ({ page }, range: string) => {
  await expect(pillView(page, range)).toHaveAttribute('aria-pressed', 'false');
});

When('I delete the saved range {string}', async ({ page }, range: string) => {
  const pill = pills(page).filter({
    has: page.getByRole('button', { name: heard(range), exact: true }),
  });
  // Its "−" is there while the mouse is over the pill.
  await pill.hover();
  await pill.getByRole('button', { name: /^Eliminar el rango del / }).click();
});
