// The sign-in page as the browser lays it out and as the keyboard alone uses it, at each width:
// it never scrolls sideways, even with a long email, and signing in needs no mouse. The API is
// answered here, so no email is sent and no session is opened.
import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from '../accessibility.js';
import { expectEveryStopShowsFocus } from './focus.js';

const longEmail =
  'antiguos.alumnos.del.instituto.de.la.promocion.de.1998@correo-del-instituto.example.com';

/** Opens the sign-in page; a code asked is "sent", and only 482915 signs in. */
async function open(page: Page, query = ''): Promise<void> {
  await page.route('**/api/auth/sign-in-code', (route) =>
    route.fulfill({ json: { sent: true, resendAfterSeconds: 30 } }),
  );
  await page.route('**/api/auth/sign-in', (route) => {
    const { code } = route.request().postDataJSON() as { code: string };
    return code === '482915'
      ? route.fulfill({ json: { signedIn: true } })
      : route.fulfill({
          status: 400,
          json: { error: { code: 'WRONG_CODE', message: 'x', details: [], attemptsLeft: 4 } },
        });
  });
  await page.goto(`/sign-in${query}`);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
}

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test('the sign-in page never scrolls sideways, with a long email in either step', async ({
  page,
}) => {
  await open(page);
  await page.getByLabel('Tu email').fill(longEmail);
  expect(await sidewaysOverflow(page)).toBe(0);
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByRole('heading', { name: 'Escribe el código' })).toBeVisible();
  await expect(page.getByText(longEmail)).toBeVisible();
  expect(await sidewaysOverflow(page)).toBe(0);
  await expectAccessible(page);

  await page.getByLabel('Código').fill('111111');
  await expect(page.getByRole('alert')).toHaveText('Código incorrecto. Te quedan 4 intentos.');
  expect(await sidewaysOverflow(page)).toBe(0);
  await expectAccessible(page);
});

test('signing in needs the keyboard alone, and opens "Mis eventos"', async ({ page }) => {
  await open(page);

  await expect(page.getByLabel('Tu email')).toBeFocused();
  await page.keyboard.type('ana@example.com');
  await page.keyboard.press('Enter');

  await expect(page.getByLabel('Código')).toBeFocused();
  await page.keyboard.type('111111');
  await expect(page.getByRole('alert')).toHaveText('Código incorrecto. Te quedan 4 intentos.');
  // The wrong code is corrected where it is: the cursor never left the field.
  await expect(page.getByLabel('Código')).toBeFocused();
  for (let digit = 0; digit < 6; digit++) await page.keyboard.press('Backspace');
  await page.keyboard.type('482915');

  await expect(page.getByRole('heading', { name: 'Mis eventos' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/my-events');
});

test('a pasted code with spaces signs in, back on the page that asked for it', async ({ page }) => {
  await open(page, '?returnTo=%2Fprofile');
  await page.getByLabel('Tu email').fill('ana@example.com');
  await page.getByRole('button', { name: 'Enviar código' }).click();

  await page.getByLabel('Código').focus();
  await page.evaluate(() => {
    const field = document.activeElement as HTMLInputElement;
    const data = new DataTransfer();
    data.setData('text/plain', ' 482 915\n');
    field.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    // What the browser's paste leaves in the field.
    field.value = ' 482 915';
    field.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });

  await expect(page.getByRole('heading', { name: 'Perfil' })).toBeVisible();
  // In place of the sign-in page: going back does not return to the code.
  await page.goBack();
  expect(new URL(page.url()).pathname).not.toBe('/sign-in');
});

test('every stop of both steps shows that it has the focus', async ({ page }) => {
  await open(page);
  expect(await expectEveryStopShowsFocus(page)).toEqual(
    expect.arrayContaining(['Tu email', 'Enviar código']),
  );

  await page.getByLabel('Tu email').fill('ana@example.com');
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByLabel('Código')).toBeFocused();
  expect(await expectEveryStopShowsFocus(page)).toEqual(
    expect.arrayContaining(['Código', 'Cambiar email']),
  );
});
