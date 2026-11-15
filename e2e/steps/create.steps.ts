import { type APIResponse, type Locator, type Page, expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
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
