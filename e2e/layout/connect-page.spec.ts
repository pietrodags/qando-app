// The consent page as the browser lays it out and as the keyboard alone uses it, at each width: it
// never scrolls sideways, whatever an application calls itself, and answering needs no mouse. The
// API and the authorization server are answered here, so nothing is connected.
import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from '../accessibility.js';
import { expectEveryStopShowsFocus } from './focus.js';
import { sidewaysOverflow } from './page-overflow.js';

/** A request to connect, as the authorization server signs it into the page's address. */
const asked = '?response_type=code&client_id=https%3A%2F%2Fclaude.example%2Fmcp.json&sig=abc';
/** Where the application asked the browser back. */
const back = 'https://claude.example/callback?code=c0de&state=s';

const claude = { name: 'Claude', host: 'claude.example' };
const wordy = {
  name: 'Asistente Personal Extraordinariamente Largo de Pruebas',
  host: 'un-nombre-de-host-realmente-muy-largo.aplicaciones-de-ejemplo.example',
};
const unbroken = { name: 'A'.repeat(90), host: `${'h'.repeat(90)}.example` };

interface Answers {
  /** The application the request names; none for a request the API no longer takes. */
  readonly application?: { readonly name: string; readonly host: string };
  /** Whether the authorization server takes the account's answer. */
  readonly takesAnswer?: boolean;
  /** Where the application asks the browser back, once the answer is taken. */
  readonly returnTo?: string;
}

/** Opens the consent page for a signed-in account, with the application's own page answered. */
async function open(
  page: Page,
  { application = claude, takesAnswer = true, returnTo = back }: Answers = {},
  query = asked,
): Promise<void> {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { name: 'Ana', email: 'ana@example.com' } }),
  );
  await page.route('**/api/auth/connecting-application', (route) =>
    route.fulfill({ json: application }),
  );
  await page.route('**/api/auth/oauth2/consent', (route) =>
    takesAnswer
      ? route.fulfill({ json: { redirect: true, url: returnTo } })
      : route.fulfill({
          status: 500,
          json: { error: { code: 'INTERNAL_ERROR', message: 'x', details: [] } },
        }),
  );
  await page.route('https://claude.example/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><title>Application</title><h1>Back</h1></html>',
    }),
  );
  await page.route('**/api/me/events', (route) => route.fulfill({ json: [] }));
  await page.goto(`/connect${query}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

for (const [what, application] of [
  ['a short name', claude],
  ['a name and a host of many words', wordy],
  ['a name and a host with nowhere to break', unbroken],
] as const) {
  test(`the consent page never scrolls sideways, and keeps its text in the card: ${what}`, async ({
    page,
  }) => {
    await open(page, { application, takesAnswer: false });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(application.name);
    expect(await sidewaysOverflow(page)).toBe(0);
    // Every line of the card ends inside it.
    const card = await page.locator('main .card').boundingBox();
    for (const line of await page.locator('main .card :is(h1, p, li)').all()) {
      const box = await line.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(card!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(card!.x + card!.width);
    }
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Permitir' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'No se ha podido enviar tu respuesta. Inténtalo de nuevo.',
    );
    expect(await sidewaysOverflow(page)).toBe(0);
    await expectAccessible(page);
  });
}

for (const [what, application] of [
  ['a short name', claude],
  ['a name with nowhere to break', unbroken],
] as const) {
  test(`an answer handed to an application on the computer says to go back to it, in the card: ${what}`, async ({
    page,
  }) => {
    await open(page, { application, returnTo: 'cursor://mcp/callback?code=c0de' });
    await page.getByRole('button', { name: 'Permitir' }).click();
    // The browser stays: the card that takes the consent's place has the focus.
    await expect(
      page.getByRole('heading', { level: 1, name: `Vuelve a ${application.name}` }),
    ).toBeFocused();
    expect(await sidewaysOverflow(page)).toBe(0);
    const card = await page.locator('main .card').boundingBox();
    for (const line of await page.locator('main .card :is(h1, p, button)').all()) {
      const box = await line.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(card!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(card!.x + card!.width);
    }
    await expectAccessible(page);
    expect(await expectEveryStopShowsFocus(page)).toEqual(
      expect.arrayContaining([`Abrir ${application.name}`]),
    );
  });
}

test('the two answers sit side by side, "Permitir" last, over "Privacidad y condiciones"', async ({
  page,
}) => {
  await open(page);
  const cancel = await page.getByRole('button', { name: 'Cancelar' }).boundingBox();
  const allow = await page.getByRole('button', { name: 'Permitir' }).boundingBox();
  const privacy = await page.getByRole('link', { name: 'Privacidad y condiciones' }).boundingBox();
  expect(cancel!.y).toBe(allow!.y);
  expect(cancel!.x + cancel!.width).toBeLessThan(allow!.x);
  expect(privacy!.y).toBeGreaterThan(allow!.y + allow!.height);
  // Nothing failed: the notice between them takes no room.
  expect(await page.locator('main app-failure-notice').boundingBox()).toBeNull();
  const answers = await page.locator('main .answers').boundingBox();
  const hint = await page.locator('main .hint').boundingBox();
  expect(privacy!.y - (answers!.y + answers!.height)).toBeLessThan(
    answers!.y - (hint!.y + hint!.height),
  );
  // What it will do: the lines of the list start together, under their label.
  const [read, manage] = await page.getByRole('listitem').all();
  expect((await read!.boundingBox())!.x).toBe((await manage!.boundingBox())!.x);
});

test('while it loads, and when it could not, the page shows the same card, never one inside another', async ({
  page,
}) => {
  let fails = false;
  let answer: () => void = () => undefined;
  const waited = new Promise<void>((resolve) => (answer = resolve));
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { name: 'Ana', email: 'ana@example.com' } }),
  );
  await page.route('**/api/auth/connecting-application', async (route) => {
    if (!fails) await waited;
    await route.fulfill({
      status: 500,
      json: { error: { code: 'INTERNAL_ERROR', message: 'x', details: [] } },
    });
  });
  /** How a state draws its card, and how wide. */
  const cardOf = (selector: string) =>
    page.locator(selector).evaluate((card) => {
      const { boxShadow, borderRadius, backgroundImage, border, padding } = getComputedStyle(card);
      const { width } = card.getBoundingClientRect();
      return { boxShadow, borderRadius, backgroundImage, border, padding, width };
    });
  await page.goto(`/connect${asked}`);
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Cargando…');
  await expect(page.locator('main .card')).toHaveCount(0);
  const loadingCard = await cardOf('main app-loading-state .loading');
  expect(loadingCard.boxShadow).not.toBe('none');
  // As wide as the card it stands for, up to the page's gutters.
  const main = await page.locator('main').boundingBox();
  const loading = await page.locator('main app-loading-state').boundingBox();
  expect(loading!.width).toBeGreaterThan(Math.min(main!.width, 650) - 50);
  expect(await sidewaysOverflow(page)).toBe(0);
  await expectAccessible(page);

  fails = true;
  answer();
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await expect(page.locator('main .card')).toHaveCount(0);
  // What it could not load is said in a card, the one "Cargando…" had: no words on the waves.
  expect(await cardOf('main app-error-state .error')).toEqual(loadingCard);
  expect(await sidewaysOverflow(page)).toBe(0);
  await expectAccessible(page);
});

test('allowing needs the keyboard alone, and leaves for the application', async ({ page }) => {
  await open(page);
  // The card's heading has the focus, so the next stops are the card's own, in reading order.
  await expect(page.getByRole('heading', { name: 'Conectar Claude con qando' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Permitir' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForURL(back);
});

test('every stop of the consent shows that it has the focus', async ({ page }) => {
  await open(page);
  expect(await expectEveryStopShowsFocus(page)).toEqual(
    expect.arrayContaining(['Cancelar', 'Permitir', 'Privacidad y condiciones']),
  );
});

test('a page opened without a request says so, and leads to "Mis eventos" with the keyboard alone', async ({
  page,
}) => {
  await open(page, {}, '');
  await expect(page.getByRole('heading', { name: 'Esta solicitud ha caducado' })).toBeFocused();
  expect(await sidewaysOverflow(page)).toBe(0);
  await expectAccessible(page);
  expect(await expectEveryStopShowsFocus(page)).toEqual(
    expect.arrayContaining(['Ir a Mis eventos']),
  );

  await page.getByRole('link', { name: 'Ir a Mis eventos' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Mis eventos' })).toBeVisible();
});
