import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from './fixtures.js';

const { When, Then } = createBdd(test);

When('I open {string} under the voting choices', async ({ page }, name: string) => {
  await page.getByRole('link', { name, exact: true }).click();
});

Then('a new tab shows the heading {string}', async ({ page }, name: string) => {
  await expect.poll(() => page.context().pages().length).toBe(2);
  const tab = page
    .context()
    .pages()
    .find((open) => open !== page);
  if (!tab) throw new Error('No new tab was opened');
  await expect(tab.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
});

Then('the voting page still holds the name {string}', async ({ page }, name: string) => {
  await expect(page.getByLabel('Escribe tu nombre para votar')).toHaveValue(name);
});
