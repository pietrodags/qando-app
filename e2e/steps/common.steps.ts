import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from './fixtures.js';

const { When, Then } = createBdd(test);

When('I open the home page', async ({ page }) => {
  await page.goto('/');
});

When('I open {string}', async ({ page }, path: string) => {
  await page.goto(path);
});

Then('I see {string}', async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: true })).toBeVisible();
});

Then('I see the heading {string}', async ({ page }, name: string) => {
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
});

Then('the tab title is {string}', async ({ page }, title: string) => {
  await expect(page).toHaveTitle(title);
});
