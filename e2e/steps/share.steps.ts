// Sharing the participation link from "¡Hecho!", the event just created.
import { type Page, expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from './fixtures.js';

const { When, Then } = createBdd(test);

/** The whole participation link of the event just created, by the ID its "Gestionar evento" opens. */
async function participationLink(page: Page, baseURL: string | undefined): Promise<string> {
  const manage = page.getByRole('link', { name: 'Gestionar evento', exact: true });
  const id = (await manage.getAttribute('href'))?.split('/').pop() ?? '';
  return `${new URL(baseURL ?? '').origin}/vote/${id}`;
}

Then(
  'WhatsApp, Telegram and email share the participation link with {string}',
  async ({ page, baseURL }, text: string) => {
    const link = await participationLink(page, baseURL);
    await expect(page.getByRole('button', { name: 'Compartir', exact: true })).toBeVisible();
    for (const channel of ['WhatsApp', 'Telegram', 'Email']) {
      const href = await page
        .getByRole('link', { name: channel, exact: true })
        .getAttribute('href');
      expect(href, channel).toContain(encodeURIComponent(text));
      expect(href, channel).toContain(encodeURIComponent(link));
    }
  },
);

When('I press "Copiar enlace"', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copiar enlace', exact: true }).click();
});

Then(
  'the participation link is in the clipboard and I see {string}',
  async ({ page, baseURL }, told: string) => {
    await expect(page.getByText(told, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      await participationLink(page, baseURL),
    );
  },
);
