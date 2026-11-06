import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from './fixtures.js';

const { When, Then } = createBdd(test);

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
