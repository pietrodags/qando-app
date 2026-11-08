// The voting page as the keyboard alone uses it, at each width: every stop shows that it has the
// focus, and a vote is cast from the name to the thank-you without a mouse. The API is answered
// here, so nothing is stored.
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { expectEveryStopShowsFocus, tabTo } from './focus.js';

const july6 = { id: randomUUID(), dates: { kind: 'single', date: '2026-07-06' }, time: null };
const july10 = { id: randomUUID(), dates: { kind: 'single', date: '2026-07-10' }, time: null };
const participationId = 'p'.repeat(22);

const event = {
  title: 'Cena de verano',
  organizerName: 'Ana',
  note: null,
  deadline: '2026-07-01',
  timeZone: 'Europe/Madrid',
  anonymous: false,
  state: 'open',
  options: [july6, july10],
  confirmedOption: null,
};

/** Opens the voting page, answering the API with `event`; returns the votes it sends. */
async function open(page: Page): Promise<unknown[]> {
  const sent: unknown[] = [];
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00+02:00'));
  await page.route(`**/api/public/events/${participationId}`, (route) =>
    route.fulfill({ json: event }),
  );
  await page.route(`**/api/public/events/${participationId}/participations`, async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: { participationId: randomUUID() } });
  });
  await page.goto(`/vote/${participationId}`);
  await expect(page.getByRole('heading', { name: 'Cena de verano' })).toBeVisible();
  return sent;
}

test('every stop of the voting page shows that it has the focus', async ({ page }) => {
  await open(page);
  await page.getByLabel('Escribe tu nombre para votar').fill('Luis');

  const first = await expectEveryStopShowsFocus(page);
  expect(first).toEqual(
    expect.arrayContaining([
      'Me adapto a lo que elija la mayoría…',
      'Quiero elegir mis preferencias…',
    ]),
  );

  await page.getByRole('button', { name: 'Quiero elegir mis preferencias…' }).click();
  await expect(page.getByRole('region', { name: 'paso 2' })).toBeFocused();
  const days = await expectEveryStopShowsFocus(page);
  expect(days).toEqual(
    expect.arrayContaining(['lunes, 6 de julio: Disponible', 'viernes, 10 de julio: Disponible']),
  );

  await page.getByRole('button', { name: 'Confirmar mis días' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar mi voto' })).toBeFocused();
  expect(await expectEveryStopShowsFocus(page)).toEqual(
    expect.arrayContaining(['Volver atrás', 'Confirmar mi voto']),
  );

  await page.getByRole('button', { name: 'Confirmar mi voto' }).click();
  await expect(page.getByRole('heading', { name: '¡Hecho!' })).toBeFocused();
  expect(await expectEveryStopShowsFocus(page)).toEqual(expect.arrayContaining(['Editar mi voto']));
});

test('a vote is cast with the keyboard alone', async ({ page }) => {
  const sent = await open(page);

  // From a tablet up the page opens with the focus on the name; on a phone Tab reaches it.
  await tabTo(page, page.getByLabel('Escribe tu nombre para votar'));
  await page.keyboard.type('Luis');
  const choose = page.getByRole('button', { name: 'Quiero elegir mis preferencias…' });
  await tabTo(page, choose);
  await page.keyboard.press('Enter');

  // Enter says whether a day suits; Shift+Enter makes it the preferred one.
  const sixth = page.getByRole('button', { name: /^lunes, 6 de julio:/ });
  const tenth = page.getByRole('button', { name: /^viernes, 10 de julio:/ });
  // The focus goes to the new step, so the first Tab reaches its first day.
  await expect(page.getByRole('region', { name: 'paso 2' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(sixth).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(sixth).toHaveAccessibleName('lunes, 6 de julio: No puedo');
  await page.keyboard.press('Tab');
  await expect(tenth).toBeFocused();
  await page.keyboard.press('Shift+Enter');
  await expect(tenth).toHaveAccessibleName('viernes, 10 de julio: Preferido');

  const done = page.getByRole('button', { name: 'Confirmar mis días' });
  await tabTo(page, done);
  await page.keyboard.press('Enter');

  // The question takes the focus on its send button; Escape gives it back to "Confirmar mis días".
  const send = page.getByRole('button', { name: 'Confirmar mi voto' });
  await expect(send).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(done).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(send).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: '¡Hecho!' })).toBeFocused();
  expect(sent).toEqual([
    { name: 'Luis', votes: { [july6.id]: 'unavailable', [july10.id]: 'preferred' } },
  ]);
});
