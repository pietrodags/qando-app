// "Mis eventos" as the browser lays it out, at each width: a long list scrolls inside the card,
// which never grows past the screen, and fades at its foot until scrolled to the end; a short one
// does neither. The API is answered here: an account with the events each test gives it.
import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from '../accessibility.js';
import { expectEveryStopShowsFocus } from './focus.js';

/** `count` events of the account, the first with a title long enough to wrap. */
function events(count: number) {
  return Array.from({ length: count }, (_, n) => ({
    id: `event${String(n).padStart(2, '0')}`,
    title:
      n === 0
        ? 'Cumpleaños de Lucía: cena sorpresa en casa de sus padres con toda la familia'
        : `Evento ${String(n + 1)}`,
    state: (['open', 'closed', 'confirmed'] as const)[n % 3],
    deadline: '2026-12-01',
    createdAt: '2026-11-01T10:00:00.000Z',
  }));
}

async function open(page: Page, count: number): Promise<void> {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { name: 'Ana', email: 'ana@example.com' } }),
  );
  await page.route('**/api/me/events', (route) => route.fulfill({ json: events(count) }));
  await page.goto('/my-events');
  await expect(page.getByRole('heading', { name: 'Mis eventos' })).toBeVisible();
}

function list(page: Page) {
  return page.getByRole('main').getByRole('list');
}

test('a long list scrolls inside the card, which never grows past the screen', async ({ page }) => {
  await open(page, 12);
  const card = await page.getByRole('main').locator('section').boundingBox();
  const screen = page.viewportSize();
  expect(card).not.toBeNull();
  expect((card?.y ?? 0) + (card?.height ?? 0)).toBeLessThanOrEqual(screen?.height ?? 0);
  const sizes = await list(page).evaluate((ul) => [ul.scrollHeight, ul.clientHeight]);
  expect(sizes[0]).toBeGreaterThan(sizes[1] ?? 0);
  await expectAccessible(page);
});

test('the foot of a long list fades until it is scrolled to the end', async ({ page }) => {
  await open(page, 12);
  await expect(list(page)).toHaveClass(/more-below/);
  await list(page).evaluate((ul) => {
    ul.scrollTop = ul.scrollHeight;
  });
  await expect(list(page)).not.toHaveClass(/more-below/);
});

test('a short list neither scrolls nor fades', async ({ page }) => {
  await open(page, 2);
  const sizes = await list(page).evaluate((ul) => [ul.scrollHeight, ul.clientHeight]);
  expect(sizes[0]).toBe(sizes[1]);
  await expect(list(page)).not.toHaveClass(/more-below/);
});

test('the keyboard alone reaches every row, each showing its focus', async ({ page }) => {
  await open(page, 12);
  const stops = await expectEveryStopShowsFocus(page);
  for (const n of [0, 11]) expect(stops.join('\n')).toContain(events(12)[n]?.title);
});
