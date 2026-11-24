import { expect, type Locator, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { expectAccessible } from '../accessibility.js';
import { test } from './fixtures.js';

const { When, Then } = createBdd(test);

// Deleting the signed-in account from the header's menu, with a code emailed to it.

/** The question that deletes the account, and then takes its code. */
const deletionDialog = (page: Page): Locator =>
  page.getByRole('dialog', { name: '¿Eliminar tu cuenta?', exact: true });

When(
  'I choose "Eliminar mi cuenta" beside my email in the header menu',
  async ({ page, mailbox, mySession }) => {
    if (!mySession.email) throw new Error('The scenario has not signed in');
    // Signed in through the API: the browser opens qando's home page when it shows none yet.
    if (page.url() === 'about:blank') await page.goto('/');
    await page
      .getByRole('banner')
      .getByRole('button', { name: /^Cuenta de / })
      .click();
    const menu = page.locator('#account-menu');
    // The trash shows itself once the mouse is over the email's row.
    await menu.getByText(mailbox.addressOf(mySession.email), { exact: true }).hover();
    const trash = menu.getByRole('button', { name: 'Eliminar mi cuenta', exact: true });
    await trash.hover();
    // The open menu, its trash said under it, is a state this step leaves, so it is checked here.
    await expectAccessible(page);
    await trash.click();
    await expect(deletionDialog(page)).toBeVisible();
    await expectAccessible(page);
  },
);

When('I press "Enviar código"', async ({ page, mailbox, mySession, mySignIn }) => {
  if (!mySession.email) throw new Error('The scenario has not signed in');
  const dialog = deletionDialog(page);
  const sentBefore = (await mailbox.codesSentTo(mySession.email, ['deletion'])).length;
  await dialog.getByRole('button', { name: 'Enviar código', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Escribe el código', exact: true }),
  ).toBeVisible();
  await expect(dialog.getByLabel('Código', { exact: true })).toBeVisible();
  // The page asks for the code once the API has delivered it.
  expect(await mailbox.codesSentTo(mySession.email, ['deletion'])).toHaveLength(sentBefore + 1);
  // The steps that type a code type it for the account's email.
  mySignIn.email = mySession.email;
});

Then('the header offers {string}', async ({ page }, name: string) => {
  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(header.getByRole('button', { name: /^Cuenta de / })).toHaveCount(0);
});

Then(
  'the voting links of {string}, {string} and {string} show {string}',
  async ({ page, events }, first: string, second: string, third: string, shown: string) => {
    for (const title of [first, second, third]) {
      await page.goto(`/vote/${events.get(title).seeded.publicId}`);
      await expect(page.getByRole('heading', { name: shown, exact: true })).toBeVisible();
      await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    }
  },
);

Then('no account exists for {string}', async ({ seeder, mailbox }, email: string) => {
  expect(await seeder.accountName(mailbox.addressOf(email))).toBeNull();
});

Then(
  'the account {string} still owns {string} and {string}',
  async ({ seeder, mailbox, events }, email: string, first: string, second: string) => {
    // The scenario stored only these two for the account: both are still its own, whole.
    expect(await seeder.eventsOwnedBy(mailbox.addressOf(email))).toBe(2);
    for (const title of [first, second]) {
      expect((await events.rowsOf(title)).options).toBe(events.get(title).seed.options.length);
    }
  },
);
