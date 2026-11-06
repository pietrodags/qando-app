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
    // A click turns the preferred day available, then toggles: at most two clicks.
    for (let clicks = 0; clicks < 2; clicks += 1) {
      const name = await target.getAttribute('aria-label');
      if (name?.endsWith(`: ${ANSWER_NAMES[answer]}`)) break;
      await target.click();
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

Then(
  'only {string} is preferred and {string} is available',
  async ({ page }, preferred: string, available: string) => {
    await expect(day(page, preferred)).toHaveAccessibleName(`${dayName(preferred)}: Preferido`);
    await expect(day(page, available)).toHaveAccessibleName(`${dayName(available)}: Disponible`);
    await expect(page.getByRole('button', { name: /: Preferido$/ })).toHaveCount(1);
  },
);
