import { type Locator, type Page, expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { reachLastStep } from './create.steps.js';
import { type MyEvent, test } from './fixtures.js';
import { currentStep } from './step-card.js';

const { Given, When, Then } = createBdd(test);

// "Crear" by an organizer without a session: the code emailed and typed inside the wizard, and
// the signed-in organizer's "¿No eres tú? Cerrar sesión".

const emailLabel = 'Tu email, para recibir un resumen y los resultados.';

/** The last step's email field, there only without a session. */
const emailField = (page: Page): Locator =>
  currentStep(page).getByRole('textbox', { name: emailLabel, exact: true });

const codeHeading = (page: Page): Locator =>
  page.getByRole('heading', { name: 'Escribe el código', exact: true });

/** The event every scenario here fills in: two dates and a note. */
async function fillWizard(
  wizard: { page: Page; hasTouch: boolean },
  myEvent: MyEvent,
  name: string,
): Promise<void> {
  const title = 'Cena de verano';
  // One month, so the calendar shows both when the wizard is checked.
  const dates = ['2026-06-19', '2026-06-26'];
  await reachLastStep(
    wizard,
    title,
    dates.map((date) => ({ dates: date })),
    name,
  );
  const note = 'Cenamos en casa de Marta.';
  await currentStep(wizard.page).getByLabel('Añade un comentario, si quieres.').fill(note);
  myEvent.title = title;
  myEvent.dates = dates;
  myEvent.note = note;
}

Given(
  'I have filled the creation wizard as {string} with the email {string}',
  async ({ page, hasTouch, myEvent, mailbox, mySignIn }, name: string, email: string) => {
    await fillWizard({ page, hasTouch }, myEvent, name);
    await emailField(page).fill(mailbox.addressOf(email));
    mySignIn.email = email;
  },
);

Given('I have pressed "Crear"', async ({ page, mailbox, mySignIn }) => {
  await currentStep(page).getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(codeHeading(page)).toBeVisible();
  await expect.poll(() => mailbox.codesSentTo(mySignIn.email)).toHaveLength(1);
});

Given(
  /^I (?:reach|have reached) the last step of the creation wizard$/,
  async ({ page, hasTouch, myEvent }) => {
    await fillWizard({ page, hasTouch }, myEvent, 'Ana');
  },
);

Then('I am asked for the code emailed to {string}', async ({ page, mailbox }, email: string) => {
  await expect(codeHeading(page)).toBeVisible();
  await expect(
    currentStep(page).getByText(mailbox.addressOf(email), { exact: true }),
  ).toBeVisible();
  expect(await mailbox.codesSentTo(email)).not.toHaveLength(0);
});

When('I type the code emailed to {string}', async ({ page, mailbox }, email: string) => {
  const code = (await mailbox.codesSentTo(email)).at(-1);
  if (code === undefined) throw new Error(`No code was emailed to ${email}`);
  await currentStep(page).getByLabel('Código', { exact: true }).fill(code);
});

Then('the header shows that I am signed in as {string}', async ({ page }, name: string) => {
  await expect(
    page.getByRole('banner').getByRole('button', { name: `Cuenta de ${name}`, exact: true }),
  ).toBeVisible();
});

Then('the event is owned by the account {string}', async ({ seeder, mailbox }, email: string) => {
  expect(await seeder.eventsOwnedBy(mailbox.addressOf(email))).toBe(1);
});

Then(
  'the last step shows my email {string} as text, not as a field',
  async ({ page, mailbox }, email: string) => {
    await expect(
      currentStep(page).getByText(mailbox.addressOf(email), { exact: true }),
    ).toBeVisible();
    await expect(emailField(page)).toHaveCount(0);
  },
);

Then('I see the "¡Hecho!" step without being asked for a code', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '¡Hecho!', exact: true })).toBeVisible();
  await expect(codeHeading(page)).toHaveCount(0);
});

When('I press "Cerrar sesión" under my email', async ({ page }) => {
  await currentStep(page).getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
});

Then('the last step asks for my email', async ({ page }) => {
  await expect(emailField(page)).toHaveValue('');
  await expect(emailField(page)).toBeFocused();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Entrar' })).toBeVisible();
});

Given(
  'my session has expired an hour after signing in',
  async ({ seeder, mailbox, mySession, clock }) => {
    if (!mySession.email) throw new Error('The scenario has not signed in');
    // Long after the code that signed in: a new one may be sent.
    await clock.advance(60 * 60_000);
    await seeder.endSessionsOf(mailbox.addressOf(mySession.email));
  },
);

When('I press "Cambiar email"', async ({ page }) => {
  await currentStep(page).getByRole('button', { name: 'Cambiar email', exact: true }).click();
});

Then('the email field still holds {string}', async ({ page, mailbox }, email: string) => {
  await expect(emailField(page)).toHaveValue(mailbox.addressOf(email));
});

Then('no account or event exists for {string}', async ({ seeder, mailbox }, email: string) => {
  const own = mailbox.addressOf(email);
  expect(await seeder.accountName(own)).toBeNull();
  expect(await seeder.eventsOwnedBy(own)).toBe(0);
});
