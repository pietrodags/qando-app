// The management page as the browser lays it out and as the keyboard alone uses it, at each
// width: it never scrolls sideways, even with a long title and long links, and a date can be
// chosen, asked about and confirmed without a mouse. The API is answered here, so nothing is
// stored.
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';

const july6 = { id: randomUUID(), dates: { kind: 'single', date: '2026-07-06' }, time: null };
const july10 = { id: randomUUID(), dates: { kind: 'single', date: '2026-07-10' }, time: null };

const event = {
  title: 'Cena de verano de los antiguos alumnos del instituto, con cónyuges y niños',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  state: 'open',
  options: [july6, july10],
  confirmedOption: null,
  voters: 2,
  recommendedOptionIds: [july10.id],
  participationId: 'k'.repeat(22),
  resultsId: 'r'.repeat(22),
};

/** Opens the management page, answering the API with `event`; confirming answers it confirmed. */
async function open(page: Page): Promise<string[]> {
  const confirmed: string[] = [];
  await page.route(`**/api/events/${event.participationId}`, (route) =>
    route.fulfill({ json: event }),
  );
  await page.route(`**/api/events/${event.participationId}/confirmation`, async (route) => {
    const { optionId } = route.request().postDataJSON() as { optionId: string };
    confirmed.push(optionId);
    const option = event.options.find(({ id }) => id === optionId);
    await route.fulfill({
      json: { ...event, state: 'confirmed', confirmedOption: option, recommendedOptionIds: [] },
    });
  });
  await page.goto(`/manage/${event.participationId}#t=${'T'.repeat(22)}`);
  await expect(page.getByRole('heading', { name: 'Elige la fecha final' })).toBeVisible();
  return confirmed;
}

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test('the management page never scrolls sideways, nor its question', async ({ page }) => {
  await open(page);
  expect(await sidewaysOverflow(page)).toBe(0);

  await page.getByRole('button', { name: 'Confirmar fecha' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await sidewaysOverflow(page)).toBe(0);
});

test('the token leaves the address bar and the history', async ({ page }) => {
  await page.goto('/');
  await open(page);

  expect(new URL(page.url()).hash).toBe('');
  // Back goes to the page before the link, never to the link with its token.
  await page.goBack();
  expect(page.url()).not.toContain('#t=');
  expect(new URL(page.url()).pathname).toBe('/');
});

test('a date is chosen, asked about and confirmed with the keyboard alone', async ({ page }) => {
  const confirmed = await open(page);

  // The recommended date is chosen: arrows move the choice within the group.
  await page.getByRole('radio', { name: 'viernes 10 de julio' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('radio', { name: 'lunes 6 de julio' })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Confirmar fecha' })).toBeFocused();
  await page.keyboard.press('Enter');

  const question = page.getByRole('dialog', { name: '¿Confirmar el lunes 6 de julio?' });
  await expect(question).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(question).toBeHidden();
  await expect(page.getByRole('button', { name: 'Confirmar fecha' })).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(question).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Fecha confirmada' })).toBeFocused();
  expect(confirmed).toEqual([july6.id]);
});
