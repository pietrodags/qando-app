import { randomBytes } from 'node:crypto';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import type { EventSeed, SeededEvent } from '@qando/api/seed';
import { createBdd } from 'playwright-bdd';
import { expectAccessible } from '../accessibility.js';
import { localInstant } from './clock.steps.js';
import { type ScenarioClock, type StoredEvents, test } from './fixtures.js';
import { pageHeaders, signInThroughTheApi } from './sign-in.steps.js';
import { expectNoVoting } from './vote.steps.js';

const { Given, When, Then } = createBdd(test);

/** "viernes 10 de julio", as the pages and the emails name a whole day. */
export function longLabel(isoDate: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
    .format(Date.parse(isoDate))
    .replace(',', '');
}

/** The option of the latest event the pages name `label`: its ID and ISO date. */
function optionNamed(events: StoredEvents, label: string): { id: string; date: string } {
  const { seed, seeded } = events.get(events.latest.title);
  const dates = seed.options.map((option) => (typeof option === 'string' ? option : option.date));
  const index = dates.findIndex((date) => longLabel(date) === label);
  const id = seeded.optionIds[index];
  const date = dates[index];
  if (id === undefined || date === undefined) {
    throw new Error(`"${seed.title}" offers no option "${label}"`);
  }
  return { id, date };
}

// The management page.

/** Opens the management link, `/manage/:id#t=<token>`, as the organizer received it. */
export async function openManagementLink(page: Page, event: SeededEvent): Promise<void> {
  await page.goto(`/manage/${event.publicId}#t=${event.managementToken}`);
}

/** Chooses the option named `label` (the first one when none is named) and confirms it. */
async function chooseAndConfirm(page: Page, label?: string): Promise<void> {
  // A recommended option's radio is also named by its "Más votada" badge.
  const radio =
    label === undefined
      ? page.getByRole('radio').first()
      : page.getByRole('radio', { name: new RegExp(`^${label}\\b`) });
  await radio.check();
  await page.getByRole('button', { name: 'Confirmar fecha', exact: true }).click();
}

/** The question asked before an unusual confirmation. */
function question(page: Page): Locator {
  return page.getByRole('dialog');
}

/**
 * The card of a confirmed date, as the management and participation pages show it: the heading
 * ("Fecha confirmada") and the date in full under it ("viernes 10 de julio de 2026").
 */
async function expectConfirmedCard(page: Page, heading: string, date: string): Promise<void> {
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await expect(page.locator('p.date')).toContainText(date);
}

/** "Fecha confirmada: viernes 10 de julio": the heading and the date. */
function confirmedParts(text: string): [heading: string, date: string] {
  const [heading = '', date = ''] = text.split(': ');
  return [heading, date];
}

When('I confirm {string} on the management page', async ({ page, events }, label: string) => {
  await openManagementLink(page, events.latest);
  await chooseAndConfirm(page, label);
  // The usual case: confirmed at once, no question asked.
  await expect(page.getByRole('heading', { name: 'Fecha confirmada', exact: true })).toBeVisible();
  await expect(question(page)).toHaveCount(0);
});

When(
  'I choose to confirm {string}( on the management page)',
  async ({ page, events }, label: string) => {
    await openManagementLink(page, events.latest);
    await chooseAndConfirm(page, label);
  },
);

When('I choose to confirm one of its options', async ({ page, events }) => {
  await openManagementLink(page, events.latest);
  await chooseAndConfirm(page);
});

Then('I am asked to confirm, with {string}', async ({ page }, text: string) => {
  await expect(question(page)).toBeVisible();
  await expect(question(page)).toContainText(text);
});

Then(
  'I am asked to confirm, with a note that it is not the recommended option',
  async ({ page }) => {
    await expect(question(page)).toBeVisible();
    await expect(question(page)).toContainText('No es la fecha más votada.');
  },
);

Then('I am asked to confirm, with a note that nobody has voted', async ({ page }) => {
  await expect(question(page)).toBeVisible();
  await expect(question(page)).toContainText('Nadie ha votado todavía.');
});

When('I accept', async ({ page }) => {
  await question(page).getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fecha confirmada', exact: true })).toBeVisible();
});

Then(
  'the management, results and participation pages show {string}',
  async ({ page, events }, text: string) => {
    const [heading, date] = confirmedParts(text);
    await expectConfirmedCard(page, heading, date);
    await page.goto(`/results/${events.latest.resultsId}`);
    await expect(page.locator('.confirmed')).toHaveText(text);
    await page.goto(`/vote/${events.latest.publicId}`);
    await expectConfirmedCard(page, heading, date);
  },
);

Then(
  'participants see {string} without counts and cannot vote',
  async ({ events, otherBrowsers }, text: string) => {
    const [heading, date] = confirmedParts(text);
    const participant = await otherBrowsers.page();
    await participant.goto(`/vote/${events.latest.publicId}`);
    await expectConfirmedCard(participant, heading, date);
    await expect(participant.locator('main')).not.toContainText(
      /\d+\s*(votos?|personas?|participantes?)/,
    );
    await expectNoVoting(participant);
  },
);

// The confirmation API, asked directly.

/**
 * The headers of the scenario's requests: its client address, the management token if given and,
 * once set, its time.
 */
function scenarioHeaders(address: string, clock: ScenarioClock, token?: string) {
  const now = clock.now;
  return {
    'x-forwarded-for': address,
    ...(token !== undefined && { 'x-management-token': token }),
    ...(now && { 'x-test-now': now.toISOString() }),
  };
}

interface Asker {
  readonly request: APIRequestContext;
  readonly address: string;
  readonly clock: ScenarioClock;
}

/** Asks the API to confirm `optionId` on `event` with `token`; answers the status. */
async function askToConfirm(
  { request, address, clock }: Asker,
  event: SeededEvent,
  token: string,
  optionId: string,
): Promise<number> {
  const answer = await request.post(`/api/events/${event.publicId}/confirmation`, {
    headers: scenarioHeaders(address, clock, token),
    data: { optionId },
  });
  return answer.status();
}

/** What the API stores of the event's outcome, read with its management token. */
async function outcomeOf(
  { request, address, clock }: Asker,
  event: SeededEvent,
): Promise<{ state: string; confirmedDate: string | null }> {
  const answer = await request.get(`/api/events/${event.publicId}`, {
    headers: scenarioHeaders(address, clock, event.managementToken),
  });
  expect(answer.status()).toBe(200);
  const { state, confirmedOption } = (await answer.json()) as {
    state: string;
    confirmedOption: { dates: { date?: string } } | null;
  };
  return { state, confirmedDate: confirmedOption?.dates.date ?? null };
}

Given(
  'I have confirmed {string}',
  async ({ request, address, clock, events, myConfirmation }, label: string) => {
    const option = optionNamed(events, label);
    const event = events.latest;
    const asker = { request, address, clock };
    expect(await askToConfirm(asker, event, event.managementToken, option.id)).toBe(200);
    myConfirmation.date = option.date;
  },
);

When(
  'the API is asked to confirm {string}',
  async ({ request, address, clock, events, apiAnswer }, label: string) => {
    const event = events.latest;
    const asker = { request, address, clock };
    const { id } = optionNamed(events, label);
    apiAnswer.status = await askToConfirm(asker, event, event.managementToken, id);
  },
);

When(
  'the API is asked to confirm an option of another event',
  async ({ request, address, clock, events, seeder, apiAnswer }) => {
    // Stored apart from the scenario's events: the later steps still mean the scenario's own.
    const other = await seeder.seed({
      title: 'Otro evento',
      options: ['2026-07-06'],
      deadline: '2026-07-01',
    });
    const otherOption = other.optionIds[0] ?? '';
    const event = events.latest;
    const asker = { request, address, clock };
    apiAnswer.status = await askToConfirm(asker, event, event.managementToken, otherOption);
  },
);

When(
  'someone asks the API to confirm {string} with the participation link',
  async ({ request, address, clock, events, apiAnswer }, label: string) => {
    const event = events.latest;
    const { id } = optionNamed(events, label);
    apiAnswer.status = await askToConfirm({ request, address, clock }, event, event.publicId, id);
  },
);

When(
  'someone asks the API to confirm {string} with the results link',
  async ({ request, address, clock, events, apiAnswer }, label: string) => {
    const event = events.latest;
    const { id } = optionNamed(events, label);
    apiAnswer.status = await askToConfirm({ request, address, clock }, event, event.resultsId, id);
  },
);

Then(
  'it answers {int} and the confirmed date is unchanged',
  async ({ request, address, clock, events, apiAnswer, myConfirmation }, status: number) => {
    expect(apiAnswer.status).toBe(status);
    const outcome = await outcomeOf({ request, address, clock }, events.latest);
    expect(outcome).toEqual({ state: 'confirmed', confirmedDate: myConfirmation.date });
  },
);

Then(
  'it answers {int} and nothing is confirmed',
  async ({ request, address, clock, events, apiAnswer }, status: number) => {
    expect(apiAnswer.status).toBe(status);
    const outcome = await outcomeOf({ request, address, clock }, events.latest);
    expect(outcome).toEqual({ state: 'open', confirmedDate: null });
  },
);

// Cancelling through the API, asked directly.

/** Asks the API to cancel `event` with the headers given; answers the status. */
async function askToCancel(
  request: APIRequestContext,
  event: SeededEvent,
  headers: Record<string, string>,
): Promise<number> {
  const answer = await request.delete(`/api/events/${event.publicId}`, { headers });
  return answer.status();
}

When(
  'someone asks the API to cancel {string} with no credential',
  async ({ request, address, clock, events, apiAnswer }, title: string) => {
    const event = events.get(title).seeded;
    apiAnswer.status = await askToCancel(request, event, scenarioHeaders(address, clock));
  },
);

When(
  'someone asks the API to cancel {string} with the participation link',
  async ({ request, address, clock, events, apiAnswer }, title: string) => {
    const event = events.get(title).seeded;
    const headers = scenarioHeaders(address, clock, event.publicId);
    apiAnswer.status = await askToCancel(request, event, headers);
  },
);

When(
  'someone asks the API to cancel {string} with the results link',
  async ({ request, address, clock, events, apiAnswer }, title: string) => {
    const event = events.get(title).seeded;
    const headers = scenarioHeaders(address, clock, event.resultsId);
    apiAnswer.status = await askToCancel(request, event, headers);
  },
);

When(
  'someone asks the API to cancel {string} with a wrong management token',
  async ({ request, address, clock, events, apiAnswer }, title: string) => {
    const event = events.get(title).seeded;
    const headers = scenarioHeaders(address, clock, randomBytes(16).toString('base64url'));
    apiAnswer.status = await askToCancel(request, event, headers);
  },
);

When(
  'someone asks the API to cancel {string} with the session of {string}',
  async (
    { request, baseURL, address, clock, events, mailbox, apiAnswer },
    title: string,
    email: string,
  ) => {
    // Sent as qando's pages send it: a session from another site is refused before it is read.
    const headers = pageHeaders(baseURL, address, clock);
    await signInThroughTheApi(request, headers, mailbox, email);
    apiAnswer.status = await askToCancel(request, events.get(title).seeded, headers);
  },
);

Then(
  'it answers {int} and the event is unchanged',
  async ({ request, address, clock, events, apiAnswer }, status: number) => {
    expect(apiAnswer.status).toBe(status);
    // A cancelled event would answer its management token with 410.
    const outcome = await outcomeOf({ request, address, clock }, events.latest);
    expect(outcome).toEqual({ state: 'open', confirmedDate: null });
  },
);

// The deadline: closing voting early and choosing a new deadline, through the API.

/** Midday of `date` in the event's zone: that day there, whatever the zone's offset. */
function middayOn(seed: EventSeed, date: string): Date {
  return localInstant(date, '12:00', seed.timeZone ?? 'Europe/Madrid');
}

/** Asks the API to close voting on `event` now, with its management token. */
async function askToClose({ request, address, clock }: Asker, event: SeededEvent): Promise<void> {
  const answer = await request.post(`/api/events/${event.publicId}/close`, {
    headers: scenarioHeaders(address, clock, event.managementToken),
  });
  expect(answer.status()).toBe(200);
}

/** Asks the API to change the deadline of `event` to `deadline`, with its management token. */
async function askToChangeDeadline(
  { request, address, clock }: Asker,
  event: SeededEvent,
  deadline: string,
): Promise<void> {
  const answer = await request.patch(`/api/events/${event.publicId}/deadline`, {
    headers: scenarioHeaders(address, clock, event.managementToken),
    data: { deadline },
  });
  expect(answer.status()).toBe(200);
}

When(
  'the organizer closes voting on {string}',
  async ({ request, address, clock, events }, date: string) => {
    const { seed, seeded } = events.get(events.latest.title);
    await clock.set(middayOn(seed, date));
    await askToClose({ request, address, clock }, seeded);
  },
);

When(
  'the organizer extends the deadline to {string}',
  async ({ request, address, clock, events }, deadline: string) => {
    await askToChangeDeadline({ request, address, clock }, events.latest, deadline);
  },
);

// The deadline on the management page.

/** Opens the management page of the stored event `title` and waits for it. */
async function openManagementPage(page: Page, events: StoredEvents, title: string) {
  await openManagementLink(page, events.get(title).seeded);
  await expectManagementPage(page, events, title);
}

Given('I am on the management page of {string}', async ({ page, events }, title: string) => {
  await openManagementPage(page, events, title);
});

When('I open the management page of {string}', async ({ page, events }, title: string) => {
  await openManagementPage(page, events, title);
});

/**
 * The page's line under the title on whether voting is open, by its first half ("Votación
 * cerrada el 15 de junio de 2026"), without how many voted.
 */
function stateLine(page: Page, text: string): Locator {
  return page.getByRole('main').getByText(text, { exact: true });
}

const openUntil = (deadline: string) => `Votación abierta hasta el ${deadlineLabel(deadline)}`;
const closedOn = (deadline: string) => `Votación cerrada el ${deadlineLabel(deadline)}`;

/** The scenario's day in `timeZone`, `YYYY-MM-DD`. */
function dayIn(clock: ScenarioClock, timeZone: string): string {
  if (!clock.now) throw new Error('The scenario has not set its time');
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(clock.now);
}

/** Opens the "Plazo de votación" section, closed as the page opens, unless it is open already. */
async function openDeadlineSection(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Plazo de votación', exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

/** A select of the deadline's group, by its name. */
function deadlineSelect(page: Page, name: 'Día' | 'Mes' | 'Año'): Locator {
  return page.getByRole('group').getByRole('combobox', { name, exact: true });
}

/**
 * Chooses `date` in the deadline's selects: the year, then the month (which may move the day to
 * the nearest one it allows), then the day.
 */
async function chooseDeadline(page: Page, date: string): Promise<void> {
  const [year = '', month = '', day = ''] = date.split('-');
  const values = [
    ['Año', year],
    ['Mes', String(Number(month))],
    ['Día', String(Number(day))],
  ] as const;
  for (const [name, value] of values) await deadlineSelect(page, name).selectOption(value);
  for (const [name, value] of values) await expect(deadlineSelect(page, name)).toHaveValue(value);
}

/** Presses `button` in the deadline's section and answers the question with it. */
async function closeOnThePage(page: Page, button: string, title: string): Promise<void> {
  await openDeadlineSection(page);
  await page.getByRole('button', { name: button, exact: true }).click();
  await expect(question(page)).toContainText(`¿Cerrar la votación de "${title}"?`);
  // Gone once answered: the question is checked while it is open.
  await expectAccessible(page);
  await question(page).getByRole('button', { name: button, exact: true }).click();
  await expect(question(page)).toBeHidden();
}

When('I press {string} and confirm', async ({ page, clock, events }, button: string) => {
  const { seed } = events.get(events.latest.title);
  await closeOnThePage(page, button, seed.title);
  // Closed today: the deadline becomes the scenario's day.
  const today = dayIn(clock, seed.timeZone ?? 'Europe/Madrid');
  await expect(stateLine(page, closedOn(today))).toBeVisible();
});

When('I extend the deadline to {string}', async ({ page, events }, deadline: string) => {
  const event = events.latest;
  // Back on the management page, when a step left it for another.
  if (new URL(page.url()).pathname !== `/manage/${event.publicId}`) {
    await openManagementLink(page, event);
  }
  await openDeadlineSection(page);
  await chooseDeadline(page, deadline);
  // Closed, the section offers to reopen voting; open, to change its deadline.
  const reopen = page.getByRole('button', { name: 'Reabrir votación', exact: true });
  const change = page.getByRole('button', { name: 'Cambiar plazo', exact: true });
  await expect(reopen.or(change)).toBeVisible();
  await ((await reopen.isVisible()) ? reopen : change).click();
  await expect(stateLine(page, openUntil(deadline))).toBeVisible();
});

Then('the deadline selects offer no day before {string}', async ({ page }, date: string) => {
  const [year = '', month = '', day = ''] = date.split('-');
  await openDeadlineSection(page);
  // Each select lists its values in order: its first option is the earliest it offers.
  const earliest = (name: 'Día' | 'Mes' | 'Año') =>
    deadlineSelect(page, name).getByRole('option').first();
  await deadlineSelect(page, 'Año').selectOption(year);
  await expect(earliest('Año')).toHaveText(year);
  // The months of that year, from today's.
  await expect(earliest('Mes')).toHaveAttribute('value', String(Number(month)));
  await deadlineSelect(page, 'Mes').selectOption(String(Number(month)));
  await expect(deadlineSelect(page, 'Mes')).toHaveValue(String(Number(month)));
  await expect(earliest('Día')).toHaveText(String(Number(day)));
});

Given(
  'voting on {string} was closed early on {string}',
  async ({ page, request, address, clock, events }, title: string, date: string) => {
    const { seed, seeded } = events.get(title);
    // First a tab of its management page, opened while voting is open: the tab the next step
    // comes back to.
    await openManagementPage(page, events, title);
    await expect(stateLine(page, openUntil(seed.deadline))).toBeVisible();
    await clock.set(middayOn(seed, date));
    await askToClose({ request, address, clock }, seeded);
  },
);

When(
  '{string} is pressed again on {string}, from a tab opened before',
  async ({ page, clock, events }, button: string, date: string) => {
    const { seed } = events.get(events.latest.title);
    await clock.set(middayOn(seed, date));
    // The tab still shows voting open, as it read the event when it was opened.
    await expect(stateLine(page, openUntil(seed.deadline))).toBeVisible();
    await closeOnThePage(page, button, seed.title);
  },
);

Then(
  'the pages still say that voting closed on {string}',
  async ({ page, events }, date: string) => {
    const event = events.latest;
    await expect(stateLine(page, closedOn(date))).toBeVisible();
    // As the API keeps it, not only as the tab took the answer to its request.
    await page.reload();
    await expect(stateLine(page, closedOn(date))).toBeVisible();
    await page.goto(`/vote/${event.publicId}`);
    await expect(page.getByText('Votación cerrada', { exact: true })).toBeVisible();
    await expectNoVoting(page);
    await page.goto(`/results/${event.resultsId}`);
    await expect(
      page.getByText('Este es el cómputo final de la votación:', { exact: true }),
    ).toBeVisible();
  },
);

// "Mis eventos".

/** The rows of "Mis eventos", each a link to its event's management page. */
function myEventRows(page: Page): Locator {
  return page.getByRole('main').getByRole('listitem');
}

/** "1 de julio de 2026": a deadline as the state lines write it. */
function deadlineLabel(isoDate: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.parse(isoDate));
}

Then(
  'I see the events {string} and {string}, in this order, with their state and deadline',
  async ({ page, events }, first: string, second: string) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Mis eventos' })).toBeVisible();
    const lines = [first, second].map((title) => {
      const { deadline } = events.get(title).seed;
      return new RegExp(`^${title}\\s*Votación abierta hasta el ${deadlineLabel(deadline)}$`);
    });
    await expect(myEventRows(page)).toHaveText(lines);
  },
);

Then('I do not see {string}', async ({ page }, text: string) => {
  await expect(page.getByRole('main')).not.toContainText(text);
});

Then(
  'I see "Mis eventos" listing {string} and {string}',
  async ({ page }, first: string, second: string) => {
    await expect(page).toHaveURL((url) => url.pathname === '/my-events');
    await expect(page.getByRole('heading', { level: 1, name: 'Mis eventos' })).toBeVisible();
    for (const title of [first, second]) {
      await expect(myEventRows(page).filter({ hasText: title })).toHaveCount(1);
    }
  },
);

/** The management page of the stored event `title`, open on `page`. */
async function expectManagementPage(page: Page, events: StoredEvents, title: string) {
  const { seeded } = events.get(title);
  await expect(page).toHaveURL((url) => url.pathname === `/manage/${seeded.publicId}`);
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
}

When(
  'I open the management link of {string} in a new browser',
  async ({ otherBrowsers, events }, title: string) => {
    const page = await otherBrowsers.page();
    await openManagementLink(page, events.get(title).seeded);
    events.opened = title;
    events.openedOn = page;
  },
);

/** The management page of the event a step opened, on the page it was opened on. */
async function expectOpenedManagementPage(page: Page, events: StoredEvents): Promise<void> {
  if (events.opened === undefined) throw new Error('No step opened an event');
  await expectManagementPage(events.openedOn ?? page, events, events.opened);
}

Then('I see its management page', async ({ page, events }) => {
  await expectOpenedManagementPage(page, events);
});

Then('I see the same management page', async ({ page, events }) => {
  await expectOpenedManagementPage(page, events);
});

// Cancelling on the management page.

/** Presses `button` on the management page shown and answers the question with it. */
async function cancelOnThePage(page: Page, button: string, title: string): Promise<void> {
  await page.getByRole('button', { name: button, exact: true }).click();
  await expect(question(page)).toContainText(`¿Cancelar "${title}"?`);
  // Gone once answered: the question is checked while it is open.
  await expectAccessible(page);
  await question(page).getByRole('button', { name: button, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evento cancelado', exact: true })).toBeVisible();
}

When(
  'I press {string} on its management page and confirm',
  async ({ page, events }, button: string) => {
    await openManagementLink(page, events.latest);
    await cancelOnThePage(page, button, events.latest.title);
  },
);

When(
  'the organizer confirms a date of {string} and cancels {string}',
  async ({ page, events }, confirmed: string, cancelled: string) => {
    await openManagementLink(page, events.get(confirmed).seeded);
    await chooseAndConfirm(page);
    // Nobody has voted: the question comes first.
    await question(page).getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Fecha confirmada', exact: true }),
    ).toBeVisible();
    await openManagementLink(page, events.get(cancelled).seeded);
    await cancelOnThePage(page, 'Cancelar evento', cancelled);
  },
);

Then(
  'I see the text {string} with buttons to copy and share it',
  async ({ page, events }, text: string) => {
    const shown = events.openedOn ?? page;
    await expect(shown.getByText(text, { exact: true })).toBeVisible();
    await expect(shown.getByRole('button', { name: 'Compartir', exact: true })).toBeVisible();
    // Every channel carries the text alone: nothing is left to link to.
    for (const channel of ['WhatsApp', 'Telegram', 'Email']) {
      const link = shown.getByRole('link', { name: channel, exact: true });
      await expect(link).toHaveAttribute('href', new RegExp(escaped(encodeURIComponent(text))));
      await expect(link).not.toHaveAttribute('href', /%2Fvote%2F|%2Fresults%2F/);
    }
    await shown.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await shown.getByRole('button', { name: 'Copiar mensaje', exact: true }).click();
    await expect(shown.getByText('Mensaje copiado', { exact: true })).toBeVisible();
    expect(await shown.evaluate(() => navigator.clipboard.readText())).toBe(text);
  },
);

/** `text` matched literally inside a regular expression. */
function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

Then(
  'the options, participations, votes and pending emails of the event are deleted',
  async ({ events }) => {
    expect(await events.rowsOf(events.latest.title)).toEqual({
      options: 0,
      participations: 0,
      votes: 0,
      confirmations: 0,
      emails: 0,
    });
  },
);

Then(
  'the participation, management and results links show {string} with {string}',
  async ({ page, events }, message: string, title: string) => {
    const event = events.get(title).seeded;
    for (const open of [
      () => page.goto(`/vote/${event.publicId}`),
      () => openManagementLink(page, event),
      () => page.goto(`/results/${event.resultsId}`),
    ]) {
      await open();
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
      await expect(page.getByRole('main')).toContainText(message);
    }
  },
);

Then('the API rejects every change to the event', async ({ request, address, clock, events }) => {
  const event = events.latest;
  const headers = scenarioHeaders(address, clock, event.managementToken);
  const [optionId = ''] = event.optionIds;
  const answers = [
    await request.post(`/api/public/events/${event.publicId}/participations`, {
      headers: { ...headers, 'x-vote-token': randomBytes(16).toString('base64url') },
      data: { name: 'Marta', votes: { [optionId]: 'available' } },
    }),
    await request.post(`/api/events/${event.publicId}/confirmation`, {
      headers,
      data: { optionId },
    }),
    await request.post(`/api/events/${event.publicId}/emails/summary/retry`, { headers }),
    await request.delete(`/api/events/${event.publicId}`, { headers }),
  ];
  expect(answers.map((answer) => answer.status())).toEqual([410, 410, 410, 410]);
});
