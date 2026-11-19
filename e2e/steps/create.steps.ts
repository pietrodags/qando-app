import { type APIResponse, type Locator, type Page, expect } from '@playwright/test';
import { type DataTable, createBdd } from 'playwright-bdd';
import { test } from './fixtures.js';
import {
  calendar,
  datesOnScreen,
  day,
  dayNames,
  monthArrow,
  press,
  rangeName,
} from './dates-calendar.js';
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

Then('the calendar shows {string}', async ({ page }, month: string) => {
  await expect(currentStep(page).getByRole('heading', { name: month, exact: true })).toBeVisible();
});

When('I press the day {string}', async ({ page }, date: string) => day(page, date).click());

// A press where the day is: the day itself takes no press.
When('I press the day {string}, which cannot be chosen', async ({ page }, date: string) => {
  await expect(day(page, date)).toBeDisabled();
  await day(page, date).click({ force: true });
});

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

interface Point {
  readonly x: number;
  readonly y: number;
}

async function centreOf(target: Locator): Promise<Point> {
  const box = await target.boundingBox();
  if (!box) throw new Error('What the finger is put on is not on screen');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * A real finger, sent through the DevTools protocol (Playwright has no long-press nor touch
 * drag): put down on `from`, slid to `to` in steps, as a finger slides, and lifted. `rested` runs
 * with the finger down, before it slides; without it the finger slides at once.
 */
async function slideFinger(
  page: Page,
  from: Locator,
  to: Locator,
  rested: () => Promise<void> = () => Promise.resolve(),
): Promise<void> {
  const [start, end] = [await centreOf(from), await centreOf(to)];
  const devtools = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', at?: Point) =>
    devtools.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: at ? [{ ...at, id: 1 }] : [],
    });
  await touch('touchStart', start);
  await rested();
  for (let step = 1; step <= 8; step += 1) {
    const part = step / 8;
    await touch('touchMove', {
      x: start.x + (end.x - start.x) * part,
      y: start.y + (end.y - start.y) * part,
    });
  }
  await touch('touchEnd');
  await devtools.detach();
}

/** What is rested on is `holding` while the finger rests: the drag begins once it no longer is. */
async function restOn(held: Locator): Promise<void> {
  await expect(held).toHaveClass(/holding/);
  await expect(held).not.toHaveClass(/holding/);
}

When(
  'I rest a finger on the day {string} and slide it to the day {string}',
  async ({ page }, from: string, to: string) => {
    await slideFinger(page, day(page, from), day(page, to), () => restOn(day(page, from)));
  },
);

// The days glide after a slide: the next one starts from where they settle.
When(
  'I slide a finger from the day {string} to the day {string}',
  async ({ page }, from: string, to: string) => {
    await expect(currentStep(page).locator('.strip.gliding')).toHaveCount(0);
    await slideFinger(page, day(page, from), day(page, to));
  },
);

/** The ring of a finger's rest: over the whole page, as large as what it rests on and there. */
async function expectRingOn(page: Page, held: Locator): Promise<void> {
  const ring = page.locator('app-hold-ring');
  await expect(ring).toHaveCount(1);
  expect(await ring.evaluate((each) => each.matches(':popover-open'))).toBe(true);
  const [around, under] = [await ring.boundingBox(), await held.boundingBox()];
  if (!around || !under) throw new Error('The ring or what it rests on is not on screen');
  for (const side of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(around[side] - under[side])).toBeLessThan(1);
  }
}

Then(
  'a finger that rests on the day {string} sees a ring close on it until the day is held',
  async ({ page }, date: string) => {
    const held = day(page, date);
    await slideFinger(page, held, held, async () => {
      await expectRingOn(page, held);
      await restOn(held);
      await expect(page.locator('app-hold-ring')).toHaveCount(0);
    });
  },
);

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

/**
 * Where the calendar says what it waits for, in a text that is not seen: the last of the two
 * places of the step that speak by themselves.
 */
const hint = (page: Page): Locator => currentStep(page).getByRole('status').last();

/** Where the step says how many options are taken, under the calendar: the first of the two. */
const counter = (page: Page): Locator => currentStep(page).getByRole('status').first();

Then('the options counter reads {string}', async ({ page }, text: string) => {
  await expect(counter(page)).toHaveText(text);
});

Then('no options counter is shown', async ({ page }) => {
  await expect(counter(page)).toBeEmpty();
});

Then('screen readers hear under the calendar: {string}', async ({ page }, text: string) => {
  await expect(hint(page)).toHaveText(text);
});

Then('screen readers hear nothing under the calendar', async ({ page }) => {
  await expect(hint(page)).toBeEmpty();
});

/** The tip over a day of the calendar: for the eyes only, so it has no role to be found by. */
const tip = (page: Page): Locator => currentStep(page).locator('app-tooltip');

/** The tip reads `text`, above `under` and over its middle. */
async function expectTipOver(page: Page, under: Locator, text: string): Promise<void> {
  await expect(tip(page)).toHaveText(text);
  await expect(tip(page)).toBeInViewport({ ratio: 1 });
  await expect
    .poll(async () => {
      const [over, below] = await Promise.all([tip(page).boundingBox(), under.boundingBox()]);
      if (!over || !below) return 'not drawn';
      const middle = below.x + below.width / 2;
      return over.y + over.height <= below.y && over.x < middle && middle < over.x + over.width;
    })
    .toBe(true);
}

Then('a tip over the day {string} reads {string}', async ({ page }, date: string, text: string) => {
  await expectTipOver(page, day(page, date), text);
});

// With the mouse, in the middle of the part of the day that is under the tip.
When('I press the day {string} where the tip covers it', async ({ page }, date: string) => {
  const [over, under] = await Promise.all([tip(page).boundingBox(), day(page, date).boundingBox()]);
  if (!over || !under) throw new Error('The tip or the day is not drawn');
  const middle = (from: number, to: number, otherFrom: number, otherTo: number): number =>
    (Math.max(from, otherFrom) + Math.min(to, otherTo)) / 2;
  await page.mouse.click(
    middle(over.x, over.x + over.width, under.x, under.x + under.width),
    middle(over.y, over.y + over.height, under.y, under.y + under.height),
  );
});

Then('no tip is shown on the calendar', async ({ page }) => {
  await expect(tip(page)).toHaveCount(0);
});

Then('the day {string} can be chosen', async ({ page }, date: string) => {
  await expect(day(page, date)).toBeEnabled();
});

Then('the day {string} cannot be chosen', async ({ page }, date: string) => {
  await expect(day(page, date)).toBeDisabled();
});

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

When('I press the key {string}', async ({ page }, key: string) => page.keyboard.press(key));

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

// Without a mouse: the button under the calendar that gives way to the "+" of every range.
When('I press the button {string} under the calendar', async ({ page }, name: string) => {
  await currentStep(page).getByRole('button', { name, exact: true }).tap();
});

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

/** The "−" that deletes a saved range, on its pill. */
const pillMinus = (page: Page, range: string): Locator =>
  pills(page)
    .filter({ has: page.getByRole('button', { name: heard(range), exact: true }) })
    .getByRole('button', { name: /^Eliminar el rango del / });

When('I delete the saved range {string}', async ({ page }, range: string) => {
  // Its "−" is there while the mouse is over the pill.
  await pillView(page, range).hover();
  await pillMinus(page, range).click();
});

// Without a mouse: the "−" is there only on the pill pressed before.
Then('the saved range {string} has no "−"', async ({ page }, range: string) => {
  await expect(pillMinus(page, range)).toHaveCount(0);
});

When(
  'I delete the saved range {string} with the "−" on its pill',
  async ({ page }, range: string) => pillMinus(page, range).tap(),
);

/** The trash that clears the dates: there only while there is something to clear. */
const trash = (page: Page): Locator =>
  currentStep(page).getByRole('button', { name: 'Limpiar selección' });

Then('there is no trash under the calendar', async ({ page }) => {
  await expect(trash(page)).toHaveCount(0);
});

When('I press the trash', async ({ page, hasTouch }) => press(trash(page), hasTouch));

/** The question the trash gives way to, with its two answers. */
const trashQuestion = (page: Page): Locator =>
  currentStep(page).getByRole('group', { name: '¿Borrar todo?', exact: true });

Then('the trash asks "¿Borrar todo?" in its place', async ({ page }) => {
  await expect(trashQuestion(page)).toBeVisible();
  await expect(trash(page)).toHaveCount(0);
});

When('I answer the trash {string}', async ({ page, hasTouch }, answer: string) => {
  await press(trashQuestion(page).getByRole('button', { name: answer, exact: true }), hasTouch);
});

Then('the trash is back under the calendar', async ({ page }) => {
  await expect(trash(page)).toBeVisible();
  await expect(trashQuestion(page)).toHaveCount(0);
});

const DAY_MS = 24 * 60 * 60 * 1000;

// The calendar is on the month of the first day.
When('I mark the {int} days from {string}', async ({ page }, count: number, first: string) => {
  for (let place = 0; place < count; place++) {
    const date = new Date(Date.parse(first) + place * DAY_MS).toISOString().slice(0, 10);
    // On to the next month once its first day is the one to mark.
    if (place > 0 && date.endsWith('-01')) await monthArrow(page, 'Mes siguiente').click();
    await day(page, date).click();
  }
});

Then('the day {string} is not marked', async ({ page }, date: string) => {
  await expect(day(page, date)).toHaveAttribute('aria-pressed', 'false');
});

/** The switch of the dates step that asks for times on the dates of their own. */
const timesSwitch = (page: Page): Locator =>
  currentStep(page).getByRole('switch', { name: 'Horario', exact: true });

Then('there is no "Horario" switch', async ({ page }) => {
  await expect(timesSwitch(page)).toHaveCount(0);
});

Then('the "Horario" switch is off', async ({ page }) => {
  await expect(timesSwitch(page)).not.toBeChecked();
});

Then('the "Horario" switch is on', async ({ page }) => {
  await expect(timesSwitch(page)).toBeChecked();
});

When('I turn the "Horario" switch on', async ({ page, hasTouch }) => {
  await press(timesSwitch(page), hasTouch);
});

When('I turn the "Horario" switch off', async ({ page, hasTouch }) => {
  await expect(timesSwitch(page)).toBeChecked();
  await press(timesSwitch(page), hasTouch);
});

When('I reach the "Horario" switch with the Tab key', async ({ page }) => {
  // From the day pressed: the trash, and then the switch.
  for (let tabs = 0; tabs < 5; tabs += 1) {
    await page.keyboard.press('Tab');
    if (await timesSwitch(page).evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('The Tab key does not reach the "Horario" switch');
});

/** Where an element is on screen: its sides and its middle line. */
async function sides(
  target: Locator,
): Promise<{ left: number; right: number; top: number; bottom: number; middle: number }> {
  const box = await target.boundingBox();
  if (!box) throw new Error('The element is not on screen');
  return {
    left: box.x,
    right: box.x + box.width,
    top: box.y,
    bottom: box.y + box.height,
    middle: box.y + box.height / 2,
  };
}

Then(
  'the "Horario" switch is under the calendar, its right side over that of "Siguiente"',
  async ({ page }) => {
    const [control, days, arrow] = await Promise.all([
      sides(timesSwitch(page)),
      sides(calendar(page)),
      sides(next(page)),
    ]);
    expect(control.top).toBeGreaterThanOrEqual(days.bottom);
    expect(control.bottom).toBeLessThanOrEqual(arrow.top);
    expect(Math.abs(control.right - arrow.right)).toBeLessThanOrEqual(1);
  },
);

Then('the "Horario" switch is between the two arrows, beside "Siguiente"', async ({ page }) => {
  const back = currentStep(page).getByRole('button', { name: 'Volver al paso 1', exact: true });
  const [control, before, after] = await Promise.all([
    sides(timesSwitch(page)),
    sides(back),
    sides(next(page)),
  ]);
  expect(control.left).toBeGreaterThan(before.right);
  expect(Math.abs(control.middle - after.middle)).toBeLessThanOrEqual(1);
  // 14 px from the arrow: near enough to be one group with it, far enough not to be pressed for it.
  expect(Math.abs(after.left - control.right - 14)).toBeLessThanOrEqual(1);
});

const TIMES_LABEL = 'Selecciona los horarios para cada día.';

/** A column of the times step is named after its day, or after both ends of its range of days. */
function columnName(dates: string): string {
  return dates
    .split('..')
    .map((date) => dayNames.format(Date.parse(date)))
    .join(' a ');
}

/** Every column of the times step: the ones off screen are in the page too, out of reach. */
const allColumns = (page: Page): Locator => currentStep(page).getByRole('group');

/** The columns within reach: the ones the step has on screen. */
const columns = (page: Page): Locator => allColumns(page).and(page.locator(':not([inert] *)'));

const column = (page: Page, dates: string): Locator =>
  currentStep(page).getByRole('group', { name: columnName(dates), exact: true });

/**
 * An hour of a day's column, named by the time it shows ("18:00", or "18:15" once moved); an hour
 * of a time range adds its range ("19:00, rango de 18:15 a 20:00"). The pill of a saved time is
 * named as an hour is, and says whether it is pressed too: it is not one of the hours.
 */
const timeOf = (page: Page, time: string, date: string): Locator =>
  column(page, date)
    .getByRole('button', { name: new RegExp(`^${time}(, rango de .+)?$`) })
    .and(page.locator('.time'));

const markedTimes = (page: Page, date: string): Locator =>
  column(page, date).locator('button.time[aria-pressed="true"]');

When('I press "Siguiente" on the dates step', async ({ page, hasTouch }) => {
  await press(next(page), hasTouch);
});

When('I go on to the times step', async ({ page, hasTouch }) => {
  await press(next(page), hasTouch);
  await expect(currentStep(page).getByText(TIMES_LABEL, { exact: true })).toBeVisible();
});

Given(
  'I am on the times step with the dates {string} and {string}',
  async ({ page }, first: string, second: string) => {
    await page.goto('/');
    await nameField(page).fill('Ana');
    await titleField(page).fill('Cena de verano');
    await next(page).click();
    await day(page, first).click();
    await day(page, second).click();
    await timesSwitch(page).click();
    await next(page).click();
    await expect(currentStep(page).getByText(TIMES_LABEL, { exact: true })).toBeVisible();
  },
);

When('I go back to the dates step', async ({ page }) => {
  await currentStep(page).getByRole('button', { name: 'Volver al paso 2', exact: true }).click();
  await onStep(page, 2);
});

Then('the columns of times on screen are:', async ({ page }, table: DataTable) => {
  const names = table.hashes().map((row) => columnName(row.column ?? ''));
  await expect(columns(page)).toHaveCount(names.length);
  for (const [place, name] of names.entries()) {
    await expect(columns(page).nth(place)).toHaveAccessibleName(name);
    await expect(columns(page).nth(place)).toBeInViewport();
  }
  // The rest have slid out of sight.
  const away = allColumns(page).and(page.locator('[inert] *'));
  for (const column of await away.all()) await expect(column).not.toBeInViewport();
});

Then('there are no columns of times', async ({ page }) => {
  await expect(currentStep(page).getByText(TIMES_LABEL, { exact: true })).toHaveCount(0);
  await expect(allColumns(page)).toHaveCount(0);
});

Then(
  'the column of {string} reads {string} and has no times',
  async ({ page }, dates: string, text: string) => {
    await expect(column(page, dates)).toHaveText(text);
    await expect(column(page, dates).getByRole('button')).toHaveCount(0);
  },
);

const clock = (hour: number): string => `${String(hour)}:00`;

Then(
  'the column of {string} shows the {int} hours from {string}',
  async ({ page }, date: string, count: number, from: string) => {
    const first = Number(from.split(':')[0]);
    for (let hour = first; hour < first + count; hour += 1) {
      // Whole, up to rounding: on a day without times each hour is drawn a little larger, and the
      // browser measures a scaled box in fractions of a pixel (a whole hour reads 0.9999996).
      await expect(timeOf(page, clock(hour), date)).toBeInViewport({ ratio: 0.999 });
    }
    await expect(timeOf(page, clock(first - 1), date)).not.toBeInViewport();
    await expect(timeOf(page, clock(first + count), date)).not.toBeInViewport();
  },
);

// "︿" and "﹀" are for the mouse and the finger only: they have no name to be found by. The
// ones of the hours, never the ones a list of saved times has of its own.
When(
  'I press the {string} of the column of {string} {int} times in a row',
  async ({ page }, arrow: string, date: string, times: number) => {
    const button = column(page, date).locator('button.fold:not(app-saved-pills *)', {
      hasText: arrow,
    });
    for (let press = 0; press < times; press += 1) await button.click();
  },
);

When(
  'I press the time {string} of {string}',
  async ({ page, hasTouch }, time: string, date: string) => {
    await press(timeOf(page, time, date), hasTouch);
  },
);

When(
  'I press each hour from {int} to {int} of {string}',
  async ({ page }, first: number, last: number, date: string) => {
    for (let hour = first; hour <= last; hour += 1) await timeOf(page, clock(hour), date).click();
  },
);

/** The times marked on a day as they are written: "9:00", and a time range once, "18:00 → 20:30". */
async function timesOn(page: Page, date: string): Promise<string[]> {
  const names = await markedTimes(page, date).evaluateAll((hours) =>
    hours.map((each) => each.getAttribute('aria-label') ?? ''),
  );
  const written = names.map((name) => {
    const range = /, rango de (.+) a (.+)$/.exec(name);
    return range ? `${range[1] ?? ''} → ${range[2] ?? ''}` : name;
  });
  // Every hour of a time range ends with the same words: once per range.
  return [...new Set(written)];
}

Then('the times marked on {string} are {string}', async ({ page }, date: string, times: string) => {
  await expect.poll(() => timesOn(page, date)).toEqual(times.split(', '));
});

When(
  'I drag from the time {string} to the time {string} of {string}',
  async ({ page }, from: string, to: string, date: string) => {
    // The mouse first: the list scrolls to bring its hour into sight, and the other moves with it.
    await timeOf(page, from, date).hover();
    const target = await centreOf(timeOf(page, to, date));
    await page.mouse.down();
    // In steps, as a hand moves: the column follows the mouse from hour to hour.
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.up();
  },
);

// Over the "﹀" under the list, which is past its last hour on screen.
When(
  'I drag from the time {string} of {string} down to the end of its list, until {string} shows',
  async ({ page }, from: string, date: string, until: string) => {
    const under = await centreOf(column(page, date).locator('button', { hasText: '﹀' }));
    await timeOf(page, from, date).hover();
    await page.mouse.down();
    await page.mouse.move(under.x, under.y, { steps: 8 });
    await expect(timeOf(page, until, date)).toBeInViewport({ ratio: 1 });
    await page.mouse.up();
  },
);

// The finger rests on the row of the hour, which is what its ring closes on.
When(
  'I rest a finger on the time {string} of {string} and slide it to the time {string}',
  async ({ page }, from: string, date: string, to: string) => {
    const held = timeOf(page, from, date).locator('..');
    await slideFinger(page, timeOf(page, from, date), timeOf(page, to, date), () => restOn(held));
  },
);

When(
  'I slide a finger from the time {string} of {string} to the time {string} without resting',
  async ({ page }, from: string, date: string, to: string) => {
    await slideFinger(page, timeOf(page, from, date), timeOf(page, to, date));
  },
);

// From a column to another: sideways, and without resting.
When(
  'I slide a finger from the time {string} of {string} to the time {string} of {string}',
  async ({ page }, from: string, date: string, to: string, toDate: string) => {
    await slideFinger(page, timeOf(page, from, date), timeOf(page, to, toDate));
  },
);

When(
  'I rest a finger on the time {string} of {string} and slide it to the time {string} of {string}',
  async ({ page }, from: string, date: string, to: string, toDate: string) => {
    const held = timeOf(page, from, date).locator('..');
    await slideFinger(page, timeOf(page, from, date), timeOf(page, to, toDate), () => restOn(held));
  },
);

Then(
  'the time {string} of {string} is out of sight',
  async ({ page }, time: string, date: string) => {
    await expect(timeOf(page, time, date)).not.toBeInViewport();
  },
);

Then(
  'a tip over the time {string} of {string} reads {string}',
  async ({ page }, time: string, date: string, text: string) => {
    await expectTipOver(page, timeOf(page, time, date), text);
  },
);

Then('no tip is shown over the times', async ({ page }) => {
  await expect(tip(page)).toHaveCount(0);
});

Then(
  'screen readers hear in the column of {string}: {string}',
  async ({ page }, date: string, text: string) => {
    const heard = column(page, date).getByRole('status');
    await expect(heard).toHaveText(text);
    // For the ears only: the eyes have the tip.
    const box = await heard.boundingBox();
    expect(Math.max(box?.width ?? 0, box?.height ?? 0)).toBeLessThanOrEqual(1);
  },
);

Then('screen readers hear nothing in the column of {string}', async ({ page }, date: string) => {
  await expect(column(page, date).getByRole('status')).toBeEmpty();
});

Then('no time is marked on {string}', async ({ page }, date: string) => {
  await expect(column(page, date).getByRole('button').first()).toBeVisible();
  await expect(markedTimes(page, date)).toHaveCount(0);
});

const QUARTER = { earlier: 'quince minutos antes', later: 'quince minutos después' } as const;

/** One of the two arrows of a marked time, named after the time it moves. */
const quarterArrow = (page: Page, time: string, date: string, to: keyof typeof QUARTER): Locator =>
  column(page, date).getByRole('button', { name: `${time}, ${QUARTER[to]}`, exact: true });

/** "10:45" a quarter later is not asked for: the minutes stay within the hour. */
function quarterFrom(time: string, quarters: number): string {
  const [hour = '', minutes = ''] = time.split(':');
  return `${hour}:${String(Number(minutes) + quarters * 15).padStart(2, '0')}`;
}

async function moveTime(
  { page, hasTouch }: { page: Page; hasTouch: boolean },
  time: string,
  date: string,
  quarters: number,
  to: keyof typeof QUARTER,
): Promise<void> {
  for (let moved = 0; moved < quarters; moved += 1) {
    const from = quarterFrom(time, to === 'later' ? moved : -moved);
    await press(quarterArrow(page, from, date, to), hasTouch);
  }
}

When(
  'I move the time {string} of {string} {int} quarter(s) later',
  async ({ page, hasTouch }, time: string, date: string, quarters: number) =>
    moveTime({ page, hasTouch }, time, date, quarters, 'later'),
);

When(
  'I move the time {string} of {string} {int} quarter(s) earlier',
  async ({ page, hasTouch }, time: string, date: string, quarters: number) =>
    moveTime({ page, hasTouch }, time, date, quarters, 'earlier'),
);

Then(
  'the time {string} of {string} cannot be moved earlier',
  async ({ page }, time: string, date: string) => {
    await expect(quarterArrow(page, time, date, 'earlier')).toBeDisabled();
  },
);

Then(
  'the time {string} of {string} cannot be moved later',
  async ({ page }, time: string, date: string) => {
    await expect(quarterArrow(page, time, date, 'later')).toBeDisabled();
  },
);

/** A time as it is written, "18:15" or "10:00 → 13:15", without the spaces around its arrow. */
const tight = (time: string): string => time.replace(/\s+/g, '');

/** The two ends of a time as it is written; a time of its own has no second end. */
const endsOf = (time: string): string[] => time.split('→').map((end) => end.trim());

/**
 * The "+" that saves a marked time, on the last of its hours. It is in the page for every marked
 * time, and shown (`offered`) only when the step offers it.
 */
function saveOf(page: Page, time: string, date: string): Locator {
  const [start = '', end] = endsOf(time);
  const name = end ? `Guardar el rango de ${start} a ${end}` : `Guardar la hora ${start}`;
  return column(page, date).getByRole('button', { name, exact: true });
}

const offeredSaves = (page: Page): Locator => currentStep(page).locator('button.save.offered');

Then('no "+" is shown on the times', async ({ page }) => {
  await expect(offeredSaves(page)).toHaveCount(0);
});

/**
 * With a mouse the "+" of a time is offered once the mouse comes back to it: it goes off the hours
 * (onto the step's instructions) and over the last hour of the time. With a finger the step's
 * button has already shown it.
 */
async function saveTime(
  { page, hasTouch }: { page: Page; hasTouch: boolean },
  time: string,
  date: string,
): Promise<void> {
  const plus = saveOf(page, time, date);
  if (hasTouch) {
    await expect(plus).toHaveClass(/offered/);
    await plus.tap();
    return;
  }
  await currentStep(page).getByText(TIMES_LABEL, { exact: true }).hover();
  await timeOf(page, endsOf(time).at(-1) ?? '', date).hover();
  await expect(plus).toHaveClass(/offered/);
  await plus.click();
}

When(
  'I save the time {string} of {string} with its "+"',
  async ({ page, hasTouch }, time: string, date: string) =>
    saveTime({ page, hasTouch }, time, date),
);

When(
  'I save each hour from {int} to {int} of {string}',
  async ({ page, hasTouch }, first: number, last: number, date: string) => {
    for (let hour = first; hour <= last; hour += 1) {
      await press(timeOf(page, clock(hour), date), hasTouch);
      await saveTime({ page, hasTouch }, clock(hour), date);
    }
  },
);

// A real press of the mouse where the "+" would be, shown or not.
When(
  'I press the place of the "+" of the time {string} of {string}',
  async ({ page }, time: string, date: string) => {
    const place = await centreOf(saveOf(page, time, date));
    await page.mouse.click(place.x, place.y);
  },
);

// Without a mouse: the button of the step that gives way to the "+" of every marked time.
When('I press the button {string} of the times step', async ({ page, hasTouch }, name: string) => {
  await press(currentStep(page).getByRole('button', { name, exact: true }), hasTouch);
});

/** The saved times of a day, each a pill under its column. */
const savedPills = (page: Page, date: string): Locator =>
  column(page, date).locator('app-saved-pills li.pill');

/** The pill of a saved time, found by what it reads. */
function savedPill(page: Page, time: string, date: string): Locator {
  const reads = new RegExp(`^\\s*${endsOf(time).join('\\s*→\\s*')}\\s*$`);
  return savedPills(page, date).filter({ has: page.locator('.label', { hasText: reads }) });
}

/** What a pill shows: pressed, its saved time is edited. */
const savedView = (page: Page, time: string, date: string): Locator =>
  savedPill(page, time, date).locator('button.pill-view');

const readPills = (pills: Locator): Promise<string[]> =>
  pills.locator('.label').evaluateAll((labels) => labels.map((each) => each.textContent));

Then('the saved times of {string} are {string}', async ({ page }, date: string, times: string) => {
  await expect
    .poll(async () => (await readPills(savedPills(page, date))).map(tight))
    .toEqual(times.split(', ').map(tight));
});

Then('{string} has no saved times', async ({ page }, date: string) => {
  await expect(savedPills(page, date)).toHaveCount(0);
});

/** The trash under a day's column: there only while the column has a time, marked or saved. */
const columnTrash = (page: Page, date: string): Locator =>
  column(page, date).getByRole('button', { name: 'Limpiar horarios', exact: true });

/** The question a column's trash gives way to, with its two answers. */
const columnTrashQuestion = (page: Page, date: string): Locator =>
  column(page, date).getByRole('group', { name: '¿Borrar?', exact: true });

Then('{string} has no trash', async ({ page }, date: string) => {
  await expect(columnTrash(page, date)).toHaveCount(0);
});

Then('{string} has a trash', async ({ page }, date: string) => {
  await expect(columnTrash(page, date)).toBeVisible();
  await expect(columnTrashQuestion(page, date)).toHaveCount(0);
});

Then('the focus is on the trash of {string}', async ({ page }, date: string) => {
  await expect(columnTrash(page, date)).toBeFocused();
});

When('I press the trash of {string}', async ({ page, hasTouch }, date: string) =>
  press(columnTrash(page, date), hasTouch),
);

Then(
  'the trash of {string} asks {string} in its place',
  async ({ page }, date: string, question: string) => {
    await expect(
      column(page, date).getByRole('group', { name: question, exact: true }),
    ).toBeVisible();
    await expect(columnTrash(page, date)).toHaveCount(0);
  },
);

When(
  'I answer the trash of {string} {string}',
  async ({ page, hasTouch }, date: string, answer: string) =>
    press(
      columnTrashQuestion(page, date).getByRole('button', { name: answer, exact: true }),
      hasTouch,
    ),
);

/** The saved times whose pills are whole inside their list, which shows four and scrolls the rest. */
async function pillsInSight(page: Page, date: string): Promise<string[]> {
  const list = await column(page, date).locator('app-saved-pills ul.pills').boundingBox();
  if (!list) return [];
  const inSight: string[] = [];
  for (const pill of await savedPills(page, date).all()) {
    const box = await pill.boundingBox();
    if (!box) continue;
    const whole = box.y >= list.y - 1 && box.y + box.height <= list.y + list.height + 1;
    if (whole) inSight.push(...(await readPills(pill)).map(tight));
  }
  return inSight;
}

Then(
  'the saved times of {string} in sight are {string}',
  async ({ page }, date: string, times: string) => {
    await expect.poll(() => pillsInSight(page, date)).toEqual(times.split(', ').map(tight));
  },
);

/** The "︿" and "﹀" of the saved times: there only while their list scrolls. */
const pillFolds = (page: Page, date: string): Locator =>
  column(page, date).locator('app-saved-pills button.fold');

Then('the saved times of {string} have no "︿" nor "﹀"', async ({ page }, date: string) => {
  await expect(pillFolds(page, date)).toHaveCount(0);
});

When(
  'I press the {string} of the saved times of {string}',
  async ({ page, hasTouch }, arrow: string, date: string) => {
    await press(pillFolds(page, date).filter({ hasText: arrow }), hasTouch);
  },
);

When(
  'I move the mouse over the saved time {string} of {string}',
  async ({ page }, time: string, date: string) => {
    await savedView(page, time, date).hover();
  },
);

/** The row of an hour in a day's column, whatever its minutes: "12:30" is on the row of 12. */
function rowOf(page: Page, time: string, date: string): Locator {
  const hour = new RegExp(`^\\s*${time.split(':')[0] ?? ''}\\s*:`);
  return column(page, date)
    .locator('.row')
    .filter({ has: page.locator('button.time', { hasText: hour }) });
}

// The outline starts on the first hour of the saved time and runs over the rest.
Then(
  'the saved time {string} is outlined on the hours of {string}',
  async ({ page }, time: string, date: string) => {
    await expect(rowOf(page, endsOf(time)[0] ?? '', date).locator('i.frame')).toHaveCount(1);
  },
);

When(
  'I press the saved time {string} of {string}',
  async ({ page, hasTouch }, time: string, date: string) => {
    await press(savedView(page, time, date), hasTouch);
  },
);

Then(
  'the saved time {string} of {string} is being edited',
  async ({ page }, time: string, date: string) => {
    await expect(savedView(page, time, date)).toHaveAttribute('aria-pressed', 'true');
  },
);

Then('no saved time of {string} is being edited', async ({ page }, date: string) => {
  await expect(savedPills(page, date).first()).toBeVisible();
  await expect(savedPills(page, date).locator('button[aria-pressed="true"]')).toHaveCount(0);
});

Then('no saved time of {string} has a "−"', async ({ page }, date: string) => {
  await expect(savedPills(page, date).first()).toBeVisible();
  await expect(savedPills(page, date).locator('button.remove')).toHaveCount(0);
});

/** The saved time being edited moves by the arrows of its hours, as a marked time does. */
async function moveEdited(
  { page, hasTouch }: { page: Page; hasTouch: boolean },
  date: string,
  quarters: number,
  to: keyof typeof QUARTER,
  hour: string,
): Promise<void> {
  const arrow = rowOf(page, hour, date).locator(`button.quarter.${to}`);
  for (let moved = 0; moved < quarters; moved += 1) await press(arrow, hasTouch);
}

When(
  'I move the edited time of {string} {int} quarter(s) later at {string}',
  async ({ page, hasTouch }, date: string, quarters: number, hour: string) =>
    moveEdited({ page, hasTouch }, date, quarters, 'later', hour),
);

When(
  'I move the edited time of {string} {int} quarter(s) earlier at {string}',
  async ({ page, hasTouch }, date: string, quarters: number, hour: string) =>
    moveEdited({ page, hasTouch }, date, quarters, 'earlier', hour),
);

When(
  'I delete the saved time {string} of {string}',
  async ({ page }, time: string, date: string) => {
    // Its "−" is shown while the mouse is over the pill.
    await savedView(page, time, date).hover();
    await savedPill(page, time, date).locator('button.remove').click();
  },
);

// Without a mouse: the "−" is there only on the pill pressed before.
When(
  'I delete the saved time {string} of {string} with the "−" on its pill',
  async ({ page }, time: string, date: string) => {
    await savedPill(page, time, date).locator('button.remove').tap();
  },
);

Then(
  'the focus is on the "+" of the time {string} of {string}',
  async ({ page }, time: string, date: string) => {
    await expect(saveOf(page, time, date)).toBeFocused();
  },
);

Then(
  'the focus is on the saved time {string} of {string}',
  async ({ page }, time: string, date: string) => {
    await expect(savedView(page, time, date)).toBeFocused();
  },
);

Then('the place among the columns reads {string}', async ({ page }, place: string) => {
  await expect(currentStep(page).getByText(place, { exact: true })).toBeVisible();
});

When("I press the step's arrow {string}", async ({ page, hasTouch }, name: string) => {
  await press(currentStep(page).getByRole('button', { name, exact: true }), hasTouch);
});

When("I hold the step's arrow {string} down", async ({ page }, name: string) => {
  await currentStep(page).getByRole('button', { name, exact: true }).hover();
  await page.mouse.down();
});

// Long enough for a held arrow to act again, were it not to stop.
When('I let the arrow go half a second later', async ({ page }) => {
  await page.waitForTimeout(500);
  await page.mouse.up();
});

When('I reach the times with the Tab key', async ({ page }) => {
  // Only the hours say whether they are pressed. Before them, the card itself.
  const focusedTime = columns(page).locator('button[aria-pressed]:focus');
  await expect(async () => {
    await page.keyboard.press('Tab');
    await expect(focusedTime).toHaveCount(1, { timeout: 100 });
  }).toPass();
});

Then(
  'the focus is on the time {string} of {string}',
  async ({ page }, time: string, date: string) => {
    await expect(timeOf(page, time, date)).toBeFocused();
  },
);

Given('the screen measures {int} by {int}', async ({ page }, width: number, height: number) => {
  await page.setViewportSize({ width, height });
});

Then('the step ends above the bottom of the screen', async ({ page }) => {
  await expect(async () => {
    const card = await currentStep(page).boundingBox();
    const screen = page.viewportSize();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect((card?.y ?? 0) + (card?.height ?? Infinity)).toBeLessThanOrEqual(screen?.height ?? 0);
  }).toPass();
});

Then(
  'the arrows of the time {string} of {string} are the two ends of its band',
  async ({ page }, time: string, date: string) => {
    const band = await timeOf(page, time, date).boundingBox();
    const earlier = await quarterArrow(page, time, date, 'earlier').boundingBox();
    const later = await quarterArrow(page, time, date, 'later').boundingBox();
    if (!band || !earlier || !later) throw new Error(`The time ${time} has no arrows on screen`);
    expect(earlier.x).toBeCloseTo(band.x, 0);
    expect(later.x + later.width).toBeCloseTo(band.x + band.width, 0);
    for (const arrow of [earlier, later]) {
      expect(arrow.width).toBeGreaterThanOrEqual(24);
      expect(arrow.height).toBeCloseTo(band.height, 0);
    }
  },
);
