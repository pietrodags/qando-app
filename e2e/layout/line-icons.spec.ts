// The bare line icons on the page background, as the mouse finds them: the header's "Entrar"
// icon, its account circle and the waves' play/pause button grow a little lighter under the
// mouse, alike; on a touch screen none reacts. The API is answered here, so these run against
// any URL.
import { expect, type Locator, type Page, test } from '@playwright/test';

const account = { name: 'Ana', email: 'ana@example.com' };

async function open(page: Page, session: typeof account | null): Promise<void> {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: session }));
  await page.goto('/');
}

function opacity(icon: Locator): Promise<string> {
  return icon.evaluate((element) => getComputedStyle(element).opacity);
}

/** The icon is fully drawn at rest and a little lighter under the mouse. */
async function expectLighterUnderTheMouse(page: Page, icon: Locator): Promise<void> {
  await page.mouse.move(640, 400);
  await expect.poll(() => opacity(icon)).toBe('1');
  await icon.hover();
  await expect.poll(() => opacity(icon)).toBe('0.7');
  await page.mouse.move(640, 400);
  await expect.poll(() => opacity(icon)).toBe('1');
}

test.describe('with a mouse', () => {
  test('"Entrar" and the waves’ button grow lighter under the mouse', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'layout desktop', 'once, with the laptop');
    await open(page, null);

    await expectLighterUnderTheMouse(page, page.getByRole('link', { name: 'Entrar' }));
    await expectLighterUnderTheMouse(page, page.getByRole('button', { name: 'Animar el fondo' }));
  });

  test('the account circle grows lighter under the mouse as "Entrar" does', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'layout desktop', 'once, with the laptop');
    await open(page, account);

    await expectLighterUnderTheMouse(page, page.locator('app-account-menu button.account'));
  });
});

test('on a touch screen no line icon reacts', async ({ browser, viewport, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'layout phone', 'once, with the phone');
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport,
    ...(baseURL !== undefined && { baseURL }),
    locale: 'es-ES',
  });
  const page = await context.newPage();
  await open(page, null);
  const signIn = page.getByRole('link', { name: 'Entrar' });

  expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(false);
  await signIn.hover();
  // Long enough for a transition that should not be there.
  await page.waitForTimeout(300);
  expect(await opacity(signIn)).toBe('1');
  await context.close();
});
