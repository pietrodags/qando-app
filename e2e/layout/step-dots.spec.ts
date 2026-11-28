// The dot beside every step's label, as the browser draws it: one colour on every step, in the
// wizard and on the voting page, as "Editar opciones" draws its steps with the wizard's. The API
// is answered here, so this runs against any URL.
import { expect, type Locator, test } from '@playwright/test';
import { currentStep } from '../steps/step-card.js';

/** The dot's salmon, #ff9a79. */
const DOT = 'rgb(255, 154, 121)';
const participationId = 'p'.repeat(22);

function dotOf(step: Locator): Promise<string> {
  return step
    .locator('.step-label')
    .evaluate((label) => getComputedStyle(label, '::before').backgroundColor);
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'layout desktop', 'once: the dot is the same on any screen');
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00+02:00'));
});

test('every step of the wizard has the same salmon dot beside its label', async ({ page }) => {
  await page.goto('/');
  expect(await dotOf(currentStep(page))).toBe(DOT);

  await currentStep(page).getByLabel('¿Qué organizamos?').fill('Cena de verano');
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(currentStep(page).getByRole('heading', { name: 'Junio 2026' })).toBeVisible();

  expect(await dotOf(currentStep(page))).toBe(DOT);
});

test('every step of the voting page has the same salmon dot beside its label', async ({ page }) => {
  await page.route(`**/api/public/events/${participationId}`, (route) =>
    route.fulfill({
      json: {
        title: 'Cena de verano',
        organizerName: 'Ana',
        note: null,
        deadline: '2026-07-01',
        timeZone: 'Europe/Madrid',
        anonymous: false,
        state: 'open',
        options: [
          { id: crypto.randomUUID(), dates: { kind: 'single', date: '2026-07-06' }, time: null },
          { id: crypto.randomUUID(), dates: { kind: 'single', date: '2026-07-10' }, time: null },
        ],
        confirmedOption: null,
      },
    }),
  );
  await page.goto(`/vote/${participationId}`);
  expect(await dotOf(page.getByRole('region', { name: 'paso 1' }))).toBe(DOT);

  await page.getByLabel('Escribe tu nombre para votar').fill('Luis');
  await page.getByRole('button', { name: 'Quiero elegir mis preferencias…' }).click();

  expect(await dotOf(page.getByRole('region', { name: 'paso 2' }))).toBe(DOT);
});
