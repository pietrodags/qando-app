// The management page as the browser lays it out and as the keyboard alone uses it, at each
// width: it never scrolls sideways, even with a long title and long links, a date can be
// chosen, asked about and confirmed without a mouse, the deadline changed and voting closed too,
// and its sections open and close with the keyboard; a section's heading pales under the mouse, never on a touch screen, and its
// chevron turns up while it is open. The API is answered here, so nothing is stored.
import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectEveryStopShowsFocus } from './focus.js';

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
  emails: [],
};

const sentSummary = { type: 'summary', status: 'sent', sentAt: '2026-06-14T09:14:00.000Z' };

/** Opens the management page, answering the API with `shown`; confirming answers it confirmed. */
async function open(page: Page, shown: object = event): Promise<string[]> {
  const confirmed: string[] = [];
  await page.route(`**/api/events/${event.participationId}`, (route) =>
    route.fulfill({ json: shown }),
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
  await expect(page.getByRole('heading', { level: 1, name: event.title })).toBeVisible();
  return confirmed;
}

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test('the management page never scrolls sideways, nor its question', async ({ page }) => {
  await open(page);
  // The long links too: their section starts closed.
  await page.getByRole('button', { name: 'Enlaces', exact: true }).click();
  await expect(page.getByText('Para votar', { exact: true })).toBeVisible();
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

test('every stop of the management page and its question shows that it has the focus', async ({
  page,
}) => {
  await open(page);
  expect(await expectEveryStopShowsFocus(page)).toEqual(
    // One stop for the dates: arrows move within them.
    expect.arrayContaining([
      'Elige la fecha final',
      expect.stringMatching(/^viernes 10 de julio/),
      'Confirmar fecha',
      'Plazo de votación',
      'Enlaces',
    ]),
  );

  await page.getByRole('radio', { name: 'lunes 6 de julio' }).check();
  await page.getByRole('button', { name: 'Confirmar fecha' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await expectEveryStopShowsFocus(page)).toEqual(
    expect.arrayContaining(['Volver', 'Confirmar']),
  );
});

/** Answers a change of the deadline and the closing as the API would; returns what was sent. */
async function answerDeadline(page: Page): Promise<string[]> {
  const sent: string[] = [];
  await page.route(`**/api/events/${event.participationId}/deadline`, async (route) => {
    const { deadline } = route.request().postDataJSON() as { deadline: string };
    sent.push(deadline);
    await route.fulfill({ json: { ...event, deadline } });
  });
  await page.route(`**/api/events/${event.participationId}/close`, async (route) => {
    sent.push('closed');
    await route.fulfill({ json: { ...event, state: 'closed', deadline: '2026-06-15' } });
  });
  return sent;
}

test('the deadline is changed and voting closed with the keyboard alone', async ({ page }) => {
  // Monday 15 June 2026, midday in Madrid: the deadline, 1 July, can be any day from today.
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00Z'));
  const sent = await answerDeadline(page);
  await open(page);
  const heading = page.getByRole('button', { name: 'Plazo de votación', exact: true });

  // From the last stop of the dates, the deadline's heading; Enter opens it, Tab goes inside.
  await page.getByRole('link', { name: 'Ver los resultados completos' }).focus();
  await page.keyboard.press('Tab');
  await expect(heading).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(heading).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  const day = page.getByRole('combobox', { name: 'Día' });
  await expect(day).toBeFocused();
  // A day typed is chosen in its select.
  await page.keyboard.type('3');
  await expect(day).toHaveValue('3');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('combobox', { name: 'Mes' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('combobox', { name: 'Año' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Cambiar plazo' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Plazo cambiado: se puede votar hasta el 3 de julio.')).toBeVisible();
  expect(sent).toEqual(['2026-07-03']);

  const close = page.getByRole('button', { name: 'Cerrar votación' });
  await close.focus();
  await page.keyboard.press('Enter');
  const question = page.getByRole('dialog', { name: `¿Cerrar la votación de "${event.title}"?` });
  await expect(question).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(question).toBeHidden();
  await expect(close).toBeFocused();
  expect(sent).toEqual(['2026-07-03']);

  await page.keyboard.press('Enter');
  await question.getByRole('button', { name: 'Cerrar votación' }).focus();
  await page.keyboard.press('Enter');
  // Closed, the focus goes to the button that replaced the one pressed.
  await expect(page.getByRole('button', { name: 'Reabrir votación' })).toBeFocused();
  expect(sent).toEqual(['2026-07-03', 'closed']);
  expect(await sidewaysOverflow(page)).toBe(0);
});

test('every stop of the deadline and of its question shows that it has the focus', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00Z'));
  await open(page);
  await page.getByRole('button', { name: 'Plazo de votación', exact: true }).click();
  await page.getByRole('combobox', { name: 'Día' }).selectOption('3');
  expect(await expectEveryStopShowsFocus(page)).toEqual(
    expect.arrayContaining(['Día', 'Mes', 'Año', 'Cambiar plazo', 'Cerrar votación']),
  );

  await page.getByRole('button', { name: 'Cerrar votación' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await expectEveryStopShowsFocus(page)).toEqual(
    expect.arrayContaining(['Volver', 'Cerrar votación']),
  );
});

test('the sections open and close with the keyboard alone, the final date open as the page opens', async ({
  page,
}) => {
  await open(page, { ...event, emails: [sentSummary] });
  const choose = page.getByRole('button', { name: 'Elige la fecha final', exact: true });
  const links = page.getByRole('button', { name: 'Enlaces', exact: true });
  const emails = page.getByRole('button', { name: 'Emails', exact: true });
  const deadline = page.getByRole('button', { name: 'Plazo de votación', exact: true });
  await expect(choose).toHaveAttribute('aria-expanded', 'true');
  await expect(deadline).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Cerrar votación' })).toBeHidden();
  await expect(page.getByRole('radio', { name: 'viernes 10 de julio' })).toBeVisible();
  await expect(links).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('Para votar', { exact: true })).toBeHidden();
  await expect(emails).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('Resumen del evento', { exact: true })).toBeHidden();

  // From the last stop of the dates, the next headings; Enter opens one and Tab goes inside.
  await page.getByRole('link', { name: 'Ver los resultados completos' }).focus();
  await page.keyboard.press('Tab');
  await expect(deadline).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(links).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(links).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Para votar', { exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Copiar' }).first()).toBeFocused();

  // The space bar closes it, and Tab passes over what it hides.
  await links.focus();
  await page.keyboard.press('Space');
  await expect(links).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('Para votar', { exact: true })).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(emails).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Resumen del evento', { exact: true })).toBeVisible();

  await choose.focus();
  await page.keyboard.press('Enter');
  await expect(choose).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('radio', { name: 'viernes 10 de julio' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Confirmar fecha' })).toBeHidden();
  expect(await sidewaysOverflow(page)).toBe(0);
});

test('a failed email opens "Emails" as the page opens, "Reintentar" in sight', async ({ page }) => {
  await open(page, { ...event, emails: [{ type: 'summary', status: 'failed' }] });

  await expect(page.getByRole('button', { name: 'Emails', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enlaces', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('a confirmed date is always in sight, the links and the emails closed under it', async ({
  page,
}) => {
  await open(page, {
    ...event,
    state: 'confirmed',
    confirmedOption: july10,
    recommendedOptionIds: [],
    emails: [sentSummary],
  });

  await expect(page.getByRole('heading', { name: 'Fecha confirmada' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver los resultados completos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Elige la fecha final' })).toHaveCount(0);
  for (const name of ['Enlaces', 'Emails']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  }
});

test.describe('a section heading as the mouse finds it', () => {
  // Transitions end at once, so a heading's look is read where it ends.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  function opacity(button: Locator): Promise<string> {
    return button.evaluate((element) => getComputedStyle(element).opacity);
  }

  /** How far the chevron is turned, in degrees either way. */
  function turn(chevron: Locator): Promise<number> {
    return chevron.evaluate((element) => {
      const { a, b } = new DOMMatrix(getComputedStyle(element).transform);
      return Math.abs(Math.round((Math.atan2(b, a) * 180) / Math.PI));
    });
  }

  test('a section heading pales a little under the mouse', async ({ page }) => {
    await open(page);
    const links = page.getByRole('button', { name: 'Enlaces', exact: true });
    await page.mouse.move(0, 0);
    await expect.poll(() => opacity(links)).toBe('1');

    await links.hover();
    await expect.poll(() => opacity(links)).toBe('0.7');

    await page.mouse.move(0, 0);
    await expect.poll(() => opacity(links)).toBe('1');
  });

  test('on a touch screen a section heading does not pale', async ({
    browser,
    viewport,
    baseURL,
  }) => {
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
    await open(page);
    expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(false);
    const links = page.getByRole('button', { name: 'Enlaces', exact: true });

    await links.hover();
    // Long enough for a change that should not be there.
    await page.waitForTimeout(300);
    expect(await opacity(links)).toBe('1');
    await context.close();
  });

  test('a section heading’s chevron turns up while the section is open', async ({ page }) => {
    await open(page);
    const links = page.getByRole('button', { name: 'Enlaces', exact: true });
    const chevron = links.locator('svg');
    expect(await chevron.evaluate((element) => getComputedStyle(element).transform)).toBe('none');

    await links.click();
    await expect(links).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => turn(chevron)).toBe(180);

    await links.click();
    await expect
      .poll(() => chevron.evaluate((element) => getComputedStyle(element).transform))
      .toBe('none');
  });
});
