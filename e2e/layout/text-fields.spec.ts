// The text fields as the browser draws them, at each width: what a person types reads apart from
// the labels (the interface typeface, semibold, a lighter grey) from the first character, and the
// focus ring shows only when the field was reached with the keyboard, never on load, by a click
// or by a tap. The API is answered here, so nothing is stored or sent.
import { expect, type Locator, type Page, test } from '@playwright/test';
import { currentStep } from '../steps/step-card.js';

const participationId = 'p'.repeat(22);

const event = {
  title: 'Cena de verano',
  organizerName: 'Ana',
  note: null,
  deadline: '2026-07-01',
  timeZone: 'Europe/Madrid',
  anonymous: false,
  state: 'open',
  options: [
    {
      id: '6f1c2a52-8d4e-4f0b-9a57-1d2e3f4a5b6c',
      dates: { kind: 'single', date: '2026-07-06' },
      time: null,
    },
  ],
  confirmedOption: null,
};

/** The look of the typed text: `--q-font-ui`, `--q-fw-semibold`, `--q-text-typed`. */
async function typedText(field: Locator) {
  return field.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      family: style.fontFamily.split(',')[0]?.trim(),
      weight: style.fontWeight,
      colour: style.color,
    };
  });
}

async function ring(field: Locator): Promise<string> {
  return field.evaluate((element) => getComputedStyle(element).outlineStyle);
}

/**
 * Checks one field: no ring if it has the focus on load, none after a click, the typed text's
 * look from the first character, and the ring after leaving it and coming back with Shift+Tab.
 */
async function expectTextField(page: Page, field: Locator, firstCharacter: string): Promise<void> {
  if (await field.evaluate((element) => element === document.activeElement)) {
    expect(await ring(field), 'no ring on load').toBe('none');
  }

  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await field.click();
  await expect(field).toBeFocused();
  expect(await ring(field), 'no ring after a click').toBe('none');

  await page.keyboard.type(firstCharacter);
  expect(await ring(field), 'no ring while typing after a click').toBe('none');
  expect(await typedText(field)).toEqual({
    family: '-apple-system',
    weight: '600',
    colour: 'rgb(108, 108, 108)',
  });

  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(field).toBeFocused();
  expect(await ring(field), 'the ring after Shift+Tab').toBe('solid');

  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await field.click();
  expect(await ring(field), 'no ring after a click that follows the keyboard').toBe('none');
}

test("the wizard's title: typed text and the keyboard-only ring", async ({ page }) => {
  await page.goto('/');
  await expectTextField(page, page.getByLabel('¿Qué organizamos?'), 'C');
});

test("the wizard's last step, the organizer's name: typed text and the keyboard-only ring", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00+02:00'));
  await page.goto('/');
  await page.getByLabel('¿Qué organizamos?').fill('Cena de verano');
  // The step's own "Siguiente": the step before keeps its own on screen while it folds away.
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByRole('button', { name: 'sábado, 20 de junio', exact: true }).click();
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expectTextField(page, page.getByLabel('Tu nombre, para comunicárselo a los demás.'), 'L');
});

test('the sign-in fields: typed text and the keyboard-only ring', async ({ page }) => {
  await page.route('**/api/auth/sign-in-code', (route) =>
    route.fulfill({ json: { sent: true, resendAfterSeconds: 30 } }),
  );
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  const email = page.getByLabel('Tu email');
  await expectTextField(page, email, 'a');

  await email.fill('ana@example.com');
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByRole('heading', { name: 'Escribe el código' })).toBeVisible();
  await expectTextField(page, page.getByLabel('Código'), '4');
});

test("the voter's name: typed text and the keyboard-only ring", async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00+02:00'));
  await page.route(`**/api/public/events/${participationId}`, (route) =>
    route.fulfill({ json: event }),
  );
  await page.goto(`/vote/${participationId}`);
  await expect(page.getByRole('heading', { name: 'Cena de verano' })).toBeVisible();
  await expectTextField(page, page.getByLabel('Escribe tu nombre para votar'), 'L');
});
