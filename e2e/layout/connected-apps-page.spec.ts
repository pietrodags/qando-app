// "Apps conectadas" as the browser lays it out, at each width: "Desconectar" at the end of each
// row, beside its texts where they leave it room and under them where not, never over them; its
// question in its place; with no application, the connector's address in its well inside the
// card. The API is answered here: an account with the applications each test gives it.
import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from '../accessibility.js';
import { expectEveryStopShowsFocus } from './focus.js';

interface Application {
  readonly id: string;
  readonly name: string;
  readonly host: string;
  readonly connectedAt: string;
}

const applications: readonly Application[] = [
  { id: 'c1', name: 'Claude', host: 'claude.ai', connectedAt: '2026-11-24T12:00:00.000Z' },
  { id: 'c2', name: 'ChatGPT', host: 'chatgpt.com', connectedAt: '2026-11-20T12:00:00.000Z' },
];

async function open(page: Page, listed: readonly Application[]): Promise<void> {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { name: 'Ana', email: 'ana@example.com' } }),
  );
  await page.route('**/api/me/connected-apps', (route) => route.fulfill({ json: listed }));
  await page.goto('/connected-apps');
  await expect(page.getByRole('heading', { name: 'Apps conectadas' })).toBeVisible();
}

function row(page: Page, name: string) {
  return page
    .getByRole('main')
    .getByRole('listitem')
    .filter({ has: page.getByText(name, { exact: true }) });
}

type Box = NonNullable<Awaited<ReturnType<ReturnType<Page['locator']>['boundingBox']>>>;

async function boxOf(locator: ReturnType<Page['locator']>): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Not on screen');
  return box;
}

/** Whether `inner` lies inside `outer`, to the pixel. */
function inside(inner: Box, outer: Box): boolean {
  return (
    inner.x >= outer.x - 1 &&
    inner.y >= outer.y - 1 &&
    inner.x + inner.width <= outer.x + outer.width + 1 &&
    inner.y + inner.height <= outer.y + outer.height + 1
  );
}

test('"Desconectar" ends each row, beside or under its texts, never over them', async ({
  page,
}) => {
  await open(page, applications);
  for (const { name } of applications) {
    const texts = await boxOf(row(page, name).locator('.text'));
    const button = await boxOf(
      row(page, name).getByRole('button', { name: `Desconectar ${name}` }),
    );
    const whole = await boxOf(row(page, name));
    const beside = button.x >= texts.x + texts.width;
    const under = button.y >= texts.y + texts.height;
    expect(beside || under).toBe(true);
    expect(inside(button, whole)).toBe(true);
    // At the row's right end: only the row's own padding after it.
    expect(whole.x + whole.width - (button.x + button.width)).toBeLessThanOrEqual(20);
  }
  await expectAccessible(page);
});

test('the question takes the place of "Desconectar", inside its row', async ({ page }) => {
  await open(page, applications);
  await row(page, 'Claude').getByRole('button', { name: 'Desconectar Claude' }).click();

  const question = row(page, 'Claude').getByRole('group', { name: '¿Desconectar?' });
  await expect(question).toBeVisible();
  expect(inside(await boxOf(question), await boxOf(row(page, 'Claude')))).toBe(true);
  await expect(question.getByRole('button', { name: 'No' })).toBeFocused();
  await expectAccessible(page);
});

test('the keyboard alone reaches each "Desconectar", each showing its focus', async ({ page }) => {
  await open(page, applications);
  const stops = await expectEveryStopShowsFocus(page);
  expect(stops).toContain('Desconectar Claude');
  expect(stops).toContain('Desconectar ChatGPT');
});

test('with no application, the connector’s address and "Copiar" are whole, inside the card', async ({
  page,
}) => {
  await open(page, []);
  const card = await boxOf(page.getByRole('main').locator('section'));
  const well = page.getByRole('main').getByRole('listitem');
  expect(inside(await boxOf(well), card)).toBe(true);
  const address = well.getByText(/\/api\/mcp$/);
  // The address is not cut: it is as wide as its text.
  expect(await address.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  await expect(well.getByRole('button', { name: 'Copiar' })).toBeVisible();
  await expectAccessible(page);
});
