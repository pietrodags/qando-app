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

Then('the page names one icon, a PNG of {int} px', async ({ page }, size: number) => {
  const icons = page.locator('link[rel="icon"]');
  await expect(icons).toHaveCount(1);
  const address = new URL((await icons.getAttribute('href')) ?? '', page.url());
  const answer = await page.request.get(address.href);
  expect(answer.status()).toBe(200);
  expect(answer.headers()['content-type']).toBe('image/png');
  const png = await answer.body();
  // A PNG says its width and height in its header, after its signature.
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
});
