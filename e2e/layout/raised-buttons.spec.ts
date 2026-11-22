// The raised buttons as the mouse finds them, at each width: under it, the raised shadow becomes a
// thin ring and the button sinks a little, as the wizard's arrows do, each keeping its text
// colour; a disabled button does not react, nor does any on a touch screen. The API is answered
// here, so nothing is stored.
import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { currentStep } from '../steps/step-card.js';

// Transitions end at once, so a button's look is read where it ends.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

const july6 = { id: randomUUID(), dates: { kind: 'single', date: '2026-07-06' }, time: null };
const july10 = { id: randomUUID(), dates: { kind: 'single', date: '2026-07-10' }, time: null };
const participationId = 'k'.repeat(22);

/** An event its organizer manages, whose summary email could not be sent. */
const managed = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  state: 'open',
  options: [july6, july10],
  confirmedOption: null,
  voters: 2,
  recommendedOptionIds: [july10.id],
  participationId,
  resultsId: 'r'.repeat(22),
  emails: [{ type: 'summary', status: 'failed' }],
};

/** Opens the management page with `answer` from the API: the event, or a refusal. */
async function openManage(
  page: Page,
  answer: { status: number; json: object } = { status: 200, json: managed },
): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00+02:00'));
  await page.route(`**/api/events/${participationId}`, (route) => route.fulfill(answer));
  await page.goto(`/manage/${participationId}#t=${'T'.repeat(22)}`);
}

interface Look {
  readonly shadow: string;
  readonly transform: string;
}

/** What a button shows of the mouse: its shadow and its scale. */
function look(button: Locator): Promise<Look> {
  return button.evaluate((element) => {
    const { boxShadow, transform } = getComputedStyle(element);
    return { shadow: boxShadow, transform };
  });
}

/** A button under the mouse: the thin neutral ring, a little smaller. */
async function sunk(page: Page): Promise<Look> {
  const shadow = await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement('div'));
    probe.style.boxShadow = 'var(--q-shadow-ring-width) var(--q-ring-neutral)';
    const { boxShadow } = getComputedStyle(probe);
    probe.remove();
    return boxShadow;
  });
  return { shadow, transform: 'matrix(0.98, 0, 0, 0.98, 0, 0)' };
}

/** Each button is raised at rest and sinks into the ring under the mouse, its text unchanged. */
async function expectEachSinks(page: Page, buttons: readonly Locator[]): Promise<void> {
  const under = await sunk(page);
  for (const button of buttons) {
    await page.mouse.move(0, 0);
    await expect.poll(() => look(button)).not.toEqual(under);
    const colour = await button.evaluate((element) => getComputedStyle(element).color);
    await button.hover();
    await expect.poll(() => look(button)).toEqual(under);
    expect(await button.evaluate((element) => getComputedStyle(element).color)).toBe(colour);
  }
}

/** The button stays as it is under the mouse. */
async function expectUnmoved(page: Page, button: Locator): Promise<void> {
  await page.mouse.move(0, 0);
  const before = await look(button);
  await button.hover({ force: true });
  // Long enough for a transition that should not be there.
  await page.waitForTimeout(300);
  expect(await look(button)).toEqual(before);
}

test('the management page’s buttons sink under the mouse, in its questions too', async ({
  page,
}) => {
  await openManage(page);
  await expect(page.getByRole('heading', { name: 'Elige la fecha final' })).toBeVisible();
  await expectEachSinks(page, [
    page.getByRole('button', { name: 'Confirmar fecha' }),
    page.getByRole('link', { name: 'Ver', exact: true }),
    page.getByRole('button', { name: 'Copiar' }).first(),
    page.getByRole('button', { name: 'Reintentar' }),
    page.getByRole('button', { name: 'Cancelar evento' }),
  ]);

  await page.getByRole('button', { name: 'Confirmar fecha' }).click();
  const confirming = page.getByRole('dialog');
  await expect(confirming).toBeVisible();
  await expectEachSinks(page, [
    confirming.getByRole('button', { name: 'Volver' }),
    confirming.getByRole('button', { name: 'Confirmar' }),
  ]);
  await confirming.getByRole('button', { name: 'Volver' }).click();
  await expect(confirming).toHaveCount(0);

  await page.getByRole('button', { name: 'Cancelar evento' }).click();
  const cancelling = page.getByRole('dialog');
  await expect(cancelling).toBeVisible();
  await expectEachSinks(page, [
    cancelling.getByRole('button', { name: 'Volver' }),
    cancelling.getByRole('button', { name: 'Cancelar evento' }),
  ]);
});

test('“Compartir” sinks under the mouse as the raised buttons do', async ({ page }) => {
  await openManage(page, {
    status: 410,
    json: {
      error: {
        code: 'EVENT_CANCELLED',
        message: 'Cancelled',
        details: [],
        title: 'Cena de verano',
      },
    },
  });
  await expectEachSinks(page, [page.getByRole('button', { name: 'Compartir' })]);
});

test('the way out of a page that could not load, or of a link to nothing, sinks under the mouse', async ({
  page,
}) => {
  await page.route(`**/api/public/events/${participationId}`, (route) =>
    route.fulfill({ status: 500, json: {} }),
  );
  await page.goto(`/vote/${participationId}`);
  await expect(page.getByText('No se ha podido cargar')).toBeVisible();
  await expectEachSinks(page, [page.getByRole('button', { name: 'Reintentar' })]);

  await page.goto('/nada');
  await expectEachSinks(page, [page.getByRole('link', { name: 'Ir al inicio' })]);
});

test('the round ✓ that closes a modal sinks under the mouse', async ({ page }) => {
  // On a phone an outlined day opens the dates that share it in a modal.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00+02:00'));
  const range = (start: string, end: string): object => ({
    id: randomUUID(),
    dates: { kind: 'range', start, end },
    time: null,
  });
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
        options: [range('2026-07-07', '2026-07-10'), range('2026-07-08', '2026-07-11')],
        confirmedOption: null,
      },
    }),
  );
  await page.goto(`/vote/${participationId}`);
  await page.getByLabel('Escribe tu nombre para votar').fill('Luis');
  await page.getByRole('button', { name: 'Quiero elegir mis preferencias…' }).click();
  await page.getByRole('button', { name: 'martes, 7 de julio: Fechas que se solapan' }).click();
  const modal = page.getByRole('dialog', { name: 'Fechas que se solapan' });
  await expect(modal).toBeVisible();
  await expectEachSinks(page, [modal.getByRole('button', { name: 'Listo' })]);
});

test('the last step’s “Reintentar” sinks under the mouse, and its arrow back not while the event is sent', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00+02:00'));
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { name: 'Ana', email: 'ana@example.com' } }),
  );
  let answer: 'fail' | 'hold' = 'fail';
  await page.route('**/api/events', async (route) => {
    if (answer === 'fail') await route.fulfill({ status: 500, json: {} });
    // Held: the event is still on its way when the test ends.
  });
  await page.goto('/');
  await currentStep(page).getByLabel('Tu nombre').fill('Ana');
  await currentStep(page).getByLabel('¿Qué hay que organizar?').fill('Cena de verano');
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  await currentStep(page).getByRole('button', { name: 'sábado, 20 de junio', exact: true }).click();
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  const create = currentStep(page).getByRole('button', { name: 'Crear', exact: true });
  await create.click();
  const retry = currentStep(page).getByRole('button', { name: 'Reintentar' });
  await expectEachSinks(page, [retry]);

  answer = 'hold';
  await retry.click();
  const back = currentStep(page).getByRole('button', { name: 'Volver al paso 2' });
  await expect(back).toBeDisabled();
  await expectUnmoved(page, back);
});

test('on a touch screen no button sinks', async ({ browser, viewport, baseURL }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport,
    ...(baseURL !== undefined && { baseURL }),
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await openManage(page);
  expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(false);
  await expectUnmoved(page, page.getByRole('button', { name: 'Confirmar fecha' }));
  await context.close();
});
