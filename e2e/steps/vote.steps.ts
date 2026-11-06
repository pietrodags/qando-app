import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from './fixtures.js';

const { When, Then } = createBdd(test);

type Answer = 'available' | 'preferred' | 'unavailable';

const ANSWER_NAMES: Record<Answer, string> = {
  available: 'Disponible',
  preferred: 'Preferido',
  unavailable: 'No puedo',
};

/** "lunes, 6 de julio", as the calendar names its days. */
function dayName(isoDate: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(Date.parse(isoDate));
}

function day(page: Page, isoDate: string) {
  return page.getByRole('button', { name: new RegExp(`^${dayName(isoDate)}:`) });
}

/** Marks a day with a mouse: a click toggles available ↔ unavailable, a double-click prefers. */
async function mark(page: Page, isoDate: string, answer: Answer): Promise<void> {
  const choose = page.getByRole('button', { name: 'Quiero elegir mis preferencias…' });
  if (await choose.isVisible()) await choose.click();
  const target = day(page, isoDate);
  if (answer === 'preferred') {
    await target.dblclick();
  } else {
    // A click turns the preferred day available, then toggles: at most two clicks, each one
    // waited for, so the next read sees the answer it left.
    const current = await target.getAttribute('aria-label');
    let state = (Object.keys(ANSWER_NAMES) as Answer[]).find((candidate) =>
      current?.endsWith(`: ${ANSWER_NAMES[candidate]}`),
    );
    while (state !== answer) {
      state = state === 'available' ? 'unavailable' : 'available';
      await target.click();
      await expect(target).toHaveAccessibleName(`${dayName(isoDate)}: ${ANSWER_NAMES[state]}`);
    }
  }
  await expect(target).toHaveAccessibleName(`${dayName(isoDate)}: ${ANSWER_NAMES[answer]}`);
}

function votingChoices(page: Page) {
  return [
    page.getByRole('button', { name: 'Me adapto a lo que elija la mayoría…' }),
    page.getByRole('button', { name: 'Quiero elegir mis preferencias…' }),
  ];
}

async function typeName(page: Page, name: string): Promise<void> {
  await page.getByLabel('Escribe tu nombre para votar').fill(name);
}

When(
  'I open the participation link and type the name {string}',
  async ({ page, events }, name: string) => {
    await page.goto(`/vote/${events.latest.publicId}`);
    await typeName(page, name);
  },
);

When('I type the name {string}', async ({ page }, name: string) => {
  await typeName(page, name);
});

Then('the voting choices are disabled', async ({ page }) => {
  for (const choice of votingChoices(page)) await expect(choice).toBeDisabled();
});

Then('the voting choices are enabled', async ({ page }) => {
  for (const choice of votingChoices(page)) await expect(choice).toBeEnabled();
});

When('I mark {string} as preferred', async ({ page }, date: string) => {
  await mark(page, date, 'preferred');
});

When(
  'I mark {string} as available, {string} as preferred and {string} as unavailable',
  async ({ page }, available: string, preferred: string, unavailable: string) => {
    await mark(page, available, 'available');
    await mark(page, preferred, 'preferred');
    await mark(page, unavailable, 'unavailable');
  },
);

/** From the days, after the last month's check: the overlay that sends the vote. */
function sendButton(page: Page) {
  return page.getByRole('button', { name: 'Confirmar mi voto' });
}

async function openConfirmation(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Confirmar mis días' }).click();
  await expect(sendButton(page)).toBeVisible();
}

When('I confirm my vote', async ({ page }) => {
  await openConfirmation(page);
  await sendButton(page).click();
});

/** Opens the participation link as "Luis" and gets to the confirmation of his days. */
async function readyToSend(page: Page, publicId: string): Promise<void> {
  await page.goto(`/vote/${publicId}`);
  await typeName(page, 'Luis');
  await page.getByRole('button', { name: 'Quiero elegir mis preferencias…' }).click();
  await openConfirmation(page);
}

When('I confirm my vote twice in a row', async ({ page, events }) => {
  await readyToSend(page, events.latest.publicId);
  await sendButton(page).dblclick();
  await expect(page.getByRole('heading', { name: '¡Hecho!' })).toBeVisible();
});

When(
  'I confirm my vote in two tabs of the same browser at once',
  async ({ page, context, clock, events }) => {
    const other = await context.newPage();
    await clock.follow(other);
    const tabs = [page, other];
    for (const tab of tabs) await readyToSend(tab, events.latest.publicId);

    await Promise.all(tabs.map((tab) => sendButton(tab).click()));

    for (const tab of tabs) {
      await expect(tab.getByRole('heading', { name: '¡Hecho!' })).toBeVisible();
    }
  },
);

Then(
  'I see the thank-you screen with a private {string} link',
  async ({ page, events }, name: string) => {
    await expect(page.getByRole('heading', { name: '¡Hecho!' })).toBeVisible();
    const link = page.getByRole('link', { name });
    await expect(link).toHaveAttribute(
      'href',
      new RegExp(`/vote/${events.latest.publicId}/my-vote#t=[A-Za-z0-9_-]{22,64}$`),
    );
  },
);

Then(
  'the results of {string} show {string} available on 6 and 10 July, preferring 10 July',
  async ({ events }, title: string, name: string) => {
    // The event's options are 6, 10 and 11 July (Background).
    expect(await events.votesOf(title)).toEqual([
      { name, states: ['available', 'preferred', 'unavailable'] },
    ]);
  },
);

Then('the results count {int} voter(s)', async ({ events }, count: number) => {
  expect(await events.votesOf(events.latest.title)).toHaveLength(count);
});

Then(
  'only {string} is preferred and {string} is available',
  async ({ page }, preferred: string, available: string) => {
    await expect(day(page, preferred)).toHaveAccessibleName(`${dayName(preferred)}: Preferido`);
    await expect(day(page, available)).toHaveAccessibleName(`${dayName(available)}: Disponible`);
    await expect(page.getByRole('button', { name: /: Preferido$/ })).toHaveCount(1);
  },
);
